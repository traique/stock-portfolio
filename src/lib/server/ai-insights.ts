// ================= NETWORK HELPERS =================

const HISTORY_TIMEOUT_MS = 8000;
const HISTORY_MAX_RETRIES = 2;
const HISTORY_CONCURRENCY = 5; // tránh fire 60 mã song song → 429/block

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = HISTORY_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Fetch JSON có timeout + retry/backoff cho 429 & 5xx (4xx khác thì bỏ ngay)
async function fetchJsonWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; timeoutMs?: number; label?: string } = {},
): Promise<any> {
  const {
    retries = HISTORY_MAX_RETRIES,
    timeoutMs = HISTORY_TIMEOUT_MS,
    label = url,
  } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${label}: HTTP ${res.status}`);
      } else if (!res.ok) {
        throw new Error(`${label}: HTTP ${res.status}`); // 4xx khác → không retry
      } else {
        return await res.json();
      }
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) {
      const backoff = 400 * 2 ** attempt + Math.floor(Math.random() * 250);
      await sleep(backoff);
    }
  }
  throw lastErr ?? new Error(`${label}: failed`);
}

// Chạy map với giới hạn số request đồng thời
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = { status: 'fulfilled', value: await fn(items[idx], idx) };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

// ================= HISTORY (Yahoo cho HOSE, VCI cho HNX/UPCOM) =================

const EMPTY_HISTORY: PriceHistory = { close: [], volume: [], high: [], low: [], dates: [] };

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// ─── Yahoo (HOSE + VNINDEX) ─────────────────────────────────────────────────
async function fetchYahooHistory(ticker: string): Promise<PriceHistory> {
  let lastError: unknown;

  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3mo`;
      const json = await fetchJsonWithRetry(
        url,
        {
          headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
          next: { revalidate: HISTORY_CACHE_SECS },
        } as RequestInit,
        { label: `Yahoo ${host}` },
      );

      const result = json?.chart?.result?.[0];
      const q = result?.indicators?.quote?.[0] ?? {};
      const ts: number[] = result?.timestamp ?? [];

      // Align theo từng nến: bỏ cả nến nếu close rỗng (không filter rời rạc nữa)
      const close: number[] = [];
      const volume: number[] = [];
      const high: number[] = [];
      const low: number[] = [];
      const dates: string[] = [];

      for (let i = 0; i < ts.length; i++) {
        const c = Number(q.close?.[i]);
        if (!Number.isFinite(c) || c <= 0) continue;
        const h = Number(q.high?.[i]);
        const l = Number(q.low?.[i]);
        const v = Number(q.volume?.[i]);
        close.push(c);
        high.push(Number.isFinite(h) && h > 0 ? h : c);
        low.push(Number.isFinite(l) && l > 0 ? l : c);
        volume.push(Number.isFinite(v) && v >= 0 ? v : 0);
        dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
      }

      if (close.length === 0) {
        lastError = new Error(`Empty close data from ${host}`);
        continue;
      }
      return { close, volume, high, low, dates };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error(`All Yahoo hosts failed for ${ticker}`);
}

// ─── VCI chart (HOSE + HNX + UPCOM) ─────────────────────────────────────────
// Cùng host với Edge realtime đang chạy OK → server-side gọi được, phủ đủ 3 sàn.
const VCI_CHART_URL = 'https://trading.vietcap.com.vn/api/chart/OHLCChart/gap';
const VCI_CHART_HEADERS = {
  'Content-Type': 'application/json',
  Referer: 'https://trading.vietcap.com.vn/',
  Origin: 'https://trading.vietcap.com.vn',
  'User-Agent': USER_AGENT,
};

async function fetchVciChartHistory(symbol: string, days = 90): Promise<PriceHistory> {
  const to = Math.floor(Date.now() / 1000);
  // pad cho cuối tuần + nghỉ lễ để chắc chắn đủ ~60 phiên
  const from = to - Math.ceil(days * 1.6) * 86400;

  const json = await fetchJsonWithRetry(
    VCI_CHART_URL,
    {
      method: 'POST',
      headers: VCI_CHART_HEADERS,
      body: JSON.stringify({ timeFrame: 'ONE_DAY', symbols: [symbol], from, to }),
      cache: 'no-store',
    } as RequestInit,
    { label: `VCI chart ${symbol}` },
  );

  // Response là array; mỗi phần tử có o/h/l/c/v/t là các mảng song song
  const block = Array.isArray(json)
    ? json.find((b: any) => String(b?.symbol).toUpperCase() === symbol) ?? json[0]
    : json;

  const t: unknown[] = block?.t ?? [];
  const c: unknown[] = block?.c ?? [];
  const h: unknown[] = block?.h ?? [];
  const l: unknown[] = block?.l ?? [];
  const v: unknown[] = block?.v ?? [];

  const close: number[] = [];
  const volume: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const dates: string[] = [];

  for (let i = 0; i < c.length; i++) {
    const cc = Number(c[i]);
    if (!Number.isFinite(cc) || cc <= 0) continue;
    const hh = Number(h[i]);
    const ll = Number(l[i]);
    const vv = Number(v[i]);
    const ts = Number(t[i]);
    close.push(cc);
    high.push(Number.isFinite(hh) && hh > 0 ? hh : cc);
    low.push(Number.isFinite(ll) && ll > 0 ? ll : cc);
    volume.push(Number.isFinite(vv) && vv >= 0 ? vv : 0);
    dates.push(Number.isFinite(ts) ? new Date(ts * 1000).toISOString().slice(0, 10) : '');
  }

  if (close.length === 0) throw new Error(`VCI chart empty for ${symbol}`);
  return { close, volume, high, low, dates };
}

// ─── Supabase price_history (fallback chung, tất cả sàn) ────────────────────
async function fetchSupabaseHistory(symbol: string, days = 90): Promise<PriceHistory> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) throw new Error('Missing Supabase env');

  const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const apiUrl =
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/price_history` +
    `?symbol=eq.${encodeURIComponent(symbol)}&trade_date=gte.${from}` +
    `&order=trade_date.asc&select=close,high,low,volume,trade_date`;

  const json = await fetchJsonWithRetry(
    apiUrl,
    { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
    { label: `price_history ${symbol}` },
  );

  const rows: Array<{ close: number; high: number; low: number; volume: number; trade_date: string }> =
    Array.isArray(json) ? json : [];
  if (!rows.length) throw new Error(`price_history empty for ${symbol}`);

  const toNum = (x: unknown) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    close: rows.map((r) => toNum(r.close)),
    volume: rows.map((r) => toNum(r.volume)),
    high: rows.map((r) => toNum(r.high)),
    low: rows.map((r) => toNum(r.low)),
    dates: rows.map((r) => String(r.trade_date ?? '').slice(0, 10)),
  };
}

// ─── Lưu lại Supabase (dùng NGÀY THẬT từ nguồn, không đoán nữa) ─────────────
async function saveHistoryToSupabase(
  symbol: string,
  exchange: string,
  history: PriceHistory,
): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!supabaseUrl || !anonKey || history.close.length === 0) return;

    const dates = history.dates ?? [];
    const rows = history.close.map((close, i) => {
      const high = history.high[i] ?? close;
      const low = history.low[i] ?? close;
      return {
        symbol,
        exchange,
        trade_date: dates[i] || approximateTradeDate(history.close.length, i),
        open: Math.round((high + low) / 2), // Yahoo/VCI không tách open → midpoint proxy
        high,
        low,
        close,
        volume: history.volume[i] ?? 0,
      };
    }).filter((r) => r.trade_date); // bỏ row không xác định được ngày

    if (!rows.length) return;

    await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/price_history`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
  } catch {
    /* non-critical */
  }
}

// Chỉ dùng khi nguồn không kèm ngày (đếm lùi qua ngày làm việc)
function approximateTradeDate(total: number, i: number): string {
  const daysAgo = total - 1 - i;
  const date = new Date();
  let back = 0;
  while (back < daysAgo) {
    date.setDate(date.getDate() - 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) back++;
  }
  return date.toISOString().slice(0, 10);
}

// ─── Định tuyến chính ───────────────────────────────────────────────────────
async function fetchHistory(symbol: string): Promise<PriceHistory> {
  if (symbol === 'VNINDEX') {
    try { return await fetchYahooHistory('^VNINDEX'); } catch { /* fallthrough */ }
    try { return await fetchSupabaseHistory('VNINDEX', 90); } catch { /* */ }
    return EMPTY_HISTORY;
  }

  const exchange = getExchange(symbol);
  const offYahoo = exchange === 'HNX' || exchange === 'UPCOM';

  if (offYahoo) {
    // HNX/UPCOM: Yahoo KHÔNG có → VCI chart là nguồn chính
    try {
      const hist = await fetchVciChartHistory(symbol, 90);
      if (hist.close.length >= 20) {
        saveHistoryToSupabase(symbol, exchange ?? 'HNX', hist); // fire-and-forget
        return hist;
      }
    } catch (err) {
      console.error(`[fetchHistory] VCI chart failed for ${symbol}:`, err);
    }
  } else {
    // HOSE: Yahoo chạy tốt từ Vercel
    try {
      const hist = await fetchYahooHistory(`${symbol}.VN`);
      if (hist.close.length > 0) {
        saveHistoryToSupabase(symbol, exchange ?? 'HOSE', hist);
        return hist;
      }
    } catch (err) {
      console.error(`[fetchHistory] Yahoo failed for ${symbol}:`, err);
    }
    // Yahoo lỗi → thử VCI chart
    try {
      const hist = await fetchVciChartHistory(symbol, 90);
      if (hist.close.length >= 20) {
        saveHistoryToSupabase(symbol, exchange ?? 'HOSE', hist);
        return hist;
      }
    } catch (err) {
      console.error(`[fetchHistory] VCI chart fallback failed for ${symbol}:`, err);
    }
  }

  // Fallback chung: Supabase price_history (cron tích luỹ)
  try {
    const hist = await fetchSupabaseHistory(symbol, 90);
    if (hist.close.length >= 20) return hist;
  } catch { /* fallthrough */ }

  console.warn(`[fetchHistory] No history for ${symbol} (${exchange})`);
  return EMPTY_HISTORY;
}
