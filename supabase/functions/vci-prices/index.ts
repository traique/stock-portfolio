// supabase/functions/vci-prices/index.ts
//
// 2 mode:
//   - mode "cron"    : tự đọc mã từ watchlists + transactions → fetch VCI → upsert price_snapshots
//   - mode "realtime": fetch symbols cụ thể → trả JSON (dùng cho debug)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VCI_URL = 'https://trading.vietcap.com.vn/api/price/symbols/getList';

const VCI_HEADERS = {
  'Content-Type': 'application/json',
  'Referer': 'https://trading.vietcap.com.vn/',
  'Origin': 'https://trading.vietcap.com.vn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round10(v: number): number {
  return Math.round(v / 10) * 10;
}

// deno-lint-ignore no-explicit-any
function parseItem(item: any) {
  const listing = item?.listingInfo ?? {};
  const match   = item?.matchPrice  ?? {};
  const bidask  = item?.bidAsk      ?? {};

  const symbol = String(listing.symbol ?? listing.ticker ?? item?.symbol ?? '').toUpperCase();
  if (!symbol) return null;

  // VNINDEX: VCI trả cấu trúc index khác cổ phiếu thường
  if (symbol === 'VNINDEX') {
    const price = safeNum(item?.indexValue ?? item?.close ?? item?.lastValue ?? match.matchPrice);
    const ref   = safeNum(item?.refIndexValue ?? item?.referenceIndex ?? listing.refPrice);
    if (!price) return null;
    const change = ref ? price - ref : 0;
    const pct    = ref ? (change / ref) * 100 : 0;
    return {
      symbol, price, ref, change, pct,
      ceiling: 0, floor: 0,
      high: safeNum(item?.highIndex ?? item?.high ?? match.highPrice),
      low:  safeNum(item?.lowIndex  ?? item?.low  ?? match.lowPrice),
      volume: safeNum(item?.totalVolume ?? item?.volume ?? match.totalVolume),
      exchange: 'HOSE',
      provider: 'vci-edge',
      fetched_at: new Date().toISOString(),
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
    symbol,
    price,
    ref,
    change,
    pct,
    ceiling:   round10(ref * 1.07),
    floor:     round10(ref * 0.93),
    high:      safeNum(match.highPrice ?? match.high),
    low:       safeNum(match.lowPrice  ?? match.low),
    volume:    safeNum(match.totalVolume ?? match.totalShare ?? match.volume),
    exchange:  String(listing.board ?? listing.exchange ?? '').toUpperCase(),
    provider:  'vci-edge',
    fetched_at: new Date().toISOString(),
  };
}

async function fetchFromVci(symbols: string[]) {
  if (!symbols.length) return [];

  // Batch 50 symbols/request để tránh timeout
  const BATCH = 50;
  const results = [];

  for (let i = 0; i < symbols.length; i += BATCH) {
    const chunk = symbols.slice(i, i + BATCH);
    const res = await fetch(VCI_URL, {
      method: 'POST',
      headers: VCI_HEADERS,
      body: JSON.stringify({ symbols: chunk }),
    });
    if (!res.ok) throw new Error(`VCI HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('VCI response không phải array');
    results.push(...data.map(parseItem).filter(Boolean));
  }

  return results;
}

// Đọc tất cả mã đang được dùng trong DB (watchlists + holdings)
async function getActiveSymbols(sb: ReturnType<typeof createClient>): Promise<string[]> {
  const [watchRes, txRes] = await Promise.all([
    // Tất cả mã trong watchlist của mọi user
    sb.from('watchlists').select('symbol'),
    // Chỉ các mã đang có vị thế mở (transactions chưa bán hết)
    // Dùng distinct để tránh trùng
    sb.from('transactions').select('symbol'),
  ]);

  const symbols = new Set<string>();

  for (const row of watchRes.data ?? []) {
    if (row.symbol) symbols.add(String(row.symbol).toUpperCase().trim());
  }
  for (const row of txRes.data ?? []) {
    if (row.symbol) symbols.add(String(row.symbol).toUpperCase().trim());
  }

  // Luôn include VNINDEX — fallback khi Yahoo bị block từ Vercel US
  symbols.add('VNINDEX');

  return [...symbols].filter(Boolean).sort();
}

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

    // ── MODE: CRON ──────────────────────────────────────────────────────────
    if (mode === 'cron') {
      // Đọc đúng mã đang được dùng thay vì fetch toàn bộ 87 mã
      const activeSymbols = await getActiveSymbols(sb);

      if (!activeSymbols.length) {
        return new Response(
          JSON.stringify({ ok: true, count: 0, message: 'Không có mã nào đang active' }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
      }

      const results = await fetchFromVci(activeSymbols);

      if (!results.length) throw new Error('VCI không trả dữ liệu');

      const { error } = await sb
        .from('price_snapshots')
        .upsert(results, { onConflict: 'symbol' });

      if (error) throw new Error(`Supabase upsert: ${error.message}`);

      return new Response(
        JSON.stringify({
          ok: true,
          symbols: activeSymbols,
          count: results.length,
          updatedAt: new Date().toISOString(),
        }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── MODE: REALTIME ───────────────────────────────────────────────────────
    const symbols: string[] = Array.isArray(body.symbols)
      ? body.symbols.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean)
      : await getActiveSymbols(sb);

    const results = await fetchFromVci(symbols);

    const prices: Record<string, number> = {};
    for (const r of results) {
      if (r) prices[r.symbol] = r.price;
    }

    return new Response(
      JSON.stringify({
        prices,
        detail: results,
        updatedAt: new Date().toISOString(),
        provider: 'vci-edge',
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[vci-prices]', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
