// supabase/functions/quick-task/index.ts
//
// VCI Edge Function — 4 modes:
//   realtime : lấy giá hiện tại (mặc định)
//   cron     : tự đọc mã từ DB → upsert price_snapshots
//   eod      : lưu OHLCV EOD vào price_history (chạy sau 15:20 VN)
//   history  : trả OHLCV 1 symbol (debug)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Constants ────────────────────────────────────────────────────────────────

const VCI_URL       = 'https://trading.vietcap.com.vn/api/price/symbols/getList';
const VCI_CHART_URL = 'https://trading.vietcap.com.vn/api/price/symbols/chart';

const VCI_HEADERS = {
  'Content-Type': 'application/json',
  'Referer':      'https://trading.vietcap.com.vn/',
  'Origin':       'https://trading.vietcap.com.vn/',
  'User-Agent':   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round10(v: number): number {
  return Math.round(v / 10) * 10;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── VCI Realtime ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function parseItem(item: any) {
  const listing = item?.listingInfo ?? {};
  const match   = item?.matchPrice  ?? {};
  const bidask  = item?.bidAsk      ?? {};

  const symbol = String(listing.symbol ?? listing.ticker ?? item?.symbol ?? '').toUpperCase();
  if (!symbol) return null;

  if (symbol === 'VNINDEX') {
    const price = safeNum(item?.indexValue ?? item?.close ?? item?.lastValue ?? match.matchPrice);
    const ref   = safeNum(item?.refIndexValue ?? item?.referenceIndex ?? listing.refPrice);
    if (!price) return null;
    const change = ref ? price - ref : 0;
    const pct    = ref ? (change / ref) * 100 : 0;
    return {
      symbol, price, ref, change, pct,
      ceiling: 0, floor: 0,
      high:   safeNum(item?.highIndex ?? item?.high ?? match.highPrice),
      low:    safeNum(item?.lowIndex  ?? item?.low  ?? match.lowPrice),
      volume: safeNum(item?.totalVolume ?? item?.volume ?? match.totalVolume),
      exchange: 'HOSE', provider: 'vci-edge', fetched_at: new Date().toISOString(),
    };
  }

  const price =
    safeNum(match.matchPrice) ||
    safeNum(match.closePrice) ||
    safeNum(bidask?.bidPrices?.[0]?.price);

  const ref = safeNum(listing.refPrice ?? listing.referencePrice);
  if (!price) return null;

  const change = ref ? price - ref : 0;
  const pct    = ref ? (change / ref) * 100 : 0;

  return {
    symbol, price, ref, change, pct,
    ceiling:  round10(ref * 1.07),
    floor:    round10(ref * 0.93),
    high:     safeNum(match.highPrice ?? match.high),
    low:      safeNum(match.lowPrice  ?? match.low),
    volume:   safeNum(match.totalVolume ?? match.totalShare ?? match.volume),
    exchange: String(listing.board ?? listing.exchange ?? '').toUpperCase(),
    provider: 'vci-edge',
    fetched_at: new Date().toISOString(),
  };
}

async function fetchFromVci(symbols: string[]) {
  if (!symbols.length) return [];
  const BATCH = 50;
  const results = [];
  for (let i = 0; i < symbols.length; i += BATCH) {
    const chunk = symbols.slice(i, i + BATCH);
    const res = await fetch(VCI_URL, {
      method: 'POST', headers: VCI_HEADERS,
      body: JSON.stringify({ symbols: chunk }),
    });
    if (!res.ok) throw new Error(`VCI HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('VCI response không phải array');
    results.push(...data.map(parseItem).filter(Boolean));
  }
  return results;
}

async function getActiveSymbols(sb: ReturnType<typeof createClient>): Promise<string[]> {
  const [watchRes, txRes] = await Promise.all([
    sb.from('watchlists').select('symbol'),
    sb.from('transactions').select('symbol'),
  ]);
  const symbols = new Set<string>();
  for (const row of watchRes.data ?? []) {
    if (row.symbol) symbols.add(String(row.symbol).toUpperCase().trim());
  }
  for (const row of txRes.data ?? []) {
    if (row.symbol) symbols.add(String(row.symbol).toUpperCase().trim());
  }
  symbols.add('VNINDEX');
  return [...symbols].filter(Boolean).sort();
}

// ─── VCI Chart (EOD / History) ────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function fetchVciOHLCV(symbol: string, days = 90): Promise<any[]> {
  const to   = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;

  const res = await fetch(VCI_CHART_URL, {
    method: 'POST', headers: VCI_HEADERS,
    body: JSON.stringify({ symbol, resolution: 'D', from, to }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`VCI chart ${symbol} HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  const data = await res.json();

  // deno-lint-ignore no-explicit-any
  let candles: any[] = [];

  if (Array.isArray(data)) {
    candles = data.filter((d) => d.c > 0);
  } else if (Array.isArray(data?.c)) {
    candles = (data.t as number[]).map((t: number, i: number) => ({
      t, o: data.o[i], h: data.h[i], l: data.l[i], c: data.c[i], v: data.v[i],
    })).filter((d) => d.c > 0);
  }

  return candles;
}

// deno-lint-ignore no-explicit-any
async function saveEodHistory(supabase: any, symbol: string, exchange: string, candles: any[]) {
  if (!candles.length) return { saved: 0 };

  const rows = candles.map((c) => ({
    symbol, exchange,
    trade_date: new Date(c.t * 1000).toISOString().slice(0, 10),
    open:   c.o ?? c.c,
    high:   c.h ?? c.c,
    low:    c.l ?? c.c,
    close:  c.c,
    volume: c.v ?? 0,
  }));

  const { error } = await supabase
    .from('price_history')
    .upsert(rows, { onConflict: 'symbol,trade_date' });

  if (error) throw new Error(`upsert ${symbol}: ${error.message}`);
  return { saved: rows.length };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode ?? 'realtime';

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const sb = createClient(supabaseUrl, serviceKey);

    // ── CRON ─────────────────────────────────────────────────────────────────
    if (mode === 'cron') {
      const activeSymbols = await getActiveSymbols(sb);
      if (!activeSymbols.length) {
        return json({ ok: true, count: 0, message: 'Không có mã nào đang active' });
      }
      const results = await fetchFromVci(activeSymbols);
      if (!results.length) throw new Error('VCI không trả dữ liệu');
      const { error } = await sb
        .from('price_snapshots')
        .upsert(results, { onConflict: 'symbol' });
      if (error) throw new Error(`Supabase upsert: ${error.message}`);
      return json({ ok: true, symbols: activeSymbols, count: results.length, updatedAt: new Date().toISOString() });
    }

    // ── EOD ──────────────────────────────────────────────────────────────────
    if (mode === 'eod') {
      const days: number = typeof body.days === 'number' ? body.days : 5;

      const [watchRes, txRes] = await Promise.all([
        sb.from('watchlists').select('symbol'),
        sb.from('transactions').select('symbol'),
      ]);

      const allSymbols = [...new Set([
        ...((watchRes.data ?? []).map((r: { symbol: string }) => r.symbol.toUpperCase())),
        ...((txRes.data    ?? []).map((r: { symbol: string }) => r.symbol.toUpperCase())),
      ])].filter((s: string) => s && s !== 'VNINDEX');

      const { data: snapRows } = await sb
        .from('price_snapshots')
        .select('symbol, exchange')
        .in('symbol', allSymbols);

      const exchangeMap: Record<string, string> = {};
      (snapRows ?? []).forEach((r: { symbol: string; exchange: string }) => {
        exchangeMap[r.symbol] = r.exchange;
      });

      const settled = await Promise.allSettled(
        allSymbols.map(async (sym: string) => {
          const candles  = await fetchVciOHLCV(sym, days);
          const exchange = exchangeMap[sym] ?? 'HOSE';
          const { saved } = await saveEodHistory(sb, sym, exchange, candles);
          return { sym, saved };
        })
      );

      let success = 0, failed = 0;
      // deno-lint-ignore no-explicit-any
      const errors: any[] = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') { success++; }
        else { failed++; errors.push({ symbol: allSymbols[i], error: String(r.reason) }); }
      });

      return json({ mode: 'eod', days, symbols: allSymbols.length, success, failed, errors, updatedAt: new Date().toISOString() });
    }

    // ── HISTORY ───────────────────────────────────────────────────────────────
    if (mode === 'history') {
      const histSymbols: string[] = Array.isArray(body.symbols)
        ? body.symbols.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean)
        : [];

      if (!histSymbols.length) {
        return json({ error: 'symbols array required' }, 400);
      }

      const days: number = typeof body.days === 'number' ? body.days : 66;
      const histResults = await Promise.allSettled(
        histSymbols.map(async (sym) => {
          const candles = await fetchVciOHLCV(sym, days);
          return {
            symbol: sym,
            closes:  candles.map((d) => d.c),
            highs:   candles.map((d) => d.h),
            lows:    candles.map((d) => d.l),
            volumes: candles.map((d) => d.v),
            count:   candles.length,
            source:  'vci-chart',
          };
        })
      );

      const history = histResults.map((r, i) =>
        r.status === 'fulfilled'
          ? r.value
          : { symbol: histSymbols[i], closes: [], highs: [], lows: [], volumes: [], source: 'error', error: String((r as PromiseRejectedResult).reason) }
      );

      return json({ history, updatedAt: new Date().toISOString(), provider: 'vci-history' });
    }

    // ── PROBE — tìm endpoint chart đúng (timeout 5s mỗi endpoint) ──────────
    if (mode === 'probe') {
      const sym = String(body.symbol ?? 'HPG').toUpperCase();
      const to   = Math.floor(Date.now() / 1000);
      const from = to - 10 * 86400;

      // Helper fetch với timeout
      async function fetchWithTimeout(url: string, opts: RequestInit, ms = 5000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        try {
          const r = await fetch(url, { ...opts, signal: controller.signal });
          clearTimeout(timer);
          return r;
        } catch(e) {
          clearTimeout(timer);
          throw e;
        }
      }

      const endpoints = [
        {
          name: '1-trading-POST-symbols/chart',
          method: 'POST',
          url: 'https://trading.vietcap.com.vn/api/price/symbols/chart',
          body: JSON.stringify({ symbol: sym, resolution: 'D', from, to }),
        },
        {
          name: '2-trading-GET-tradingview',
          method: 'GET',
          url: `https://trading.vietcap.com.vn/api/tradingview/history?symbol=${sym}&resolution=D&from=${from}&to=${to}`,
          body: undefined,
        },
        {
          name: '3-mt-GET-historical',
          method: 'GET',
          url: `https://mt.vietcap.com.vn/api/price/v1/historical-price/${sym}?resolution=D&limit=10`,
          body: undefined,
        },
        {
          name: '4-tcbs-GET-bars',
          method: 'GET',
          url: `https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term?ticker=${sym}&type=stock&resolution=D&from=${from}&to=${to}`,
          body: undefined,
        },
      ];

      // Chạy tuần tự để dễ debug, không song song
      const results = [];
      for (const ep of endpoints) {
        try {
          const r = await fetchWithTimeout(ep.url, {
            method: ep.method,
            headers: VCI_HEADERS,
            body: ep.body,
          }, 5000);
          const text = await r.text();
          results.push({
            name:    ep.name,
            status:  r.status,
            ok:      r.ok,
            preview: text.slice(0, 200),
          });
        } catch(e) {
          results.push({
            name:  ep.name,
            status: 0,
            ok:    false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return json({ probe: sym, results });
    }

    // ── REALTIME (default) ────────────────────────────────────────────────────
    const symbols: string[] = Array.isArray(body.symbols)
      ? body.symbols.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean)
      : await getActiveSymbols(sb);

    const results = await fetchFromVci(symbols);
    const prices: Record<string, number> = {};
    for (const r of results) { if (r) prices[r.symbol] = r.price; }

    return json({ prices, detail: results, updatedAt: new Date().toISOString(), provider: 'vci-edge' });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[quick-task]', message);
    return json({ error: message }, 500);
  }
});
