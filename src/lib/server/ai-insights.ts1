import { fetchMarketPrices } from '@/lib/server/market';
import { getExchange } from '@/lib/server/exchanges/exchange';
import { getVciChartOHLCV } from '@/lib/server/providers/vci-chart'; // ✨ Phase 3 — nguồn DNSE Entrade

// ================= TYPES =================

type NewsHeadline = {
  title: string;
  source: string;
  pubDate: string;
  url?: string;
  sentiment?: number;
};

export type DecisionAction = 'BUY' | 'HOLD' | 'SELL' | 'WATCH';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type TechnicalSignal = {
  symbol: string;
  currentPrice: number;
  trend3mPct: number;
  volatilityPct: number;
  momentumPct: number;
  volumeTrendPct: number;
  rsi14: number; // RSI 14 phiên
  relativeStrength: number; // % so với VNINDEX cùng kỳ
  suggestedTp: number;
  suggestedSl: number;
  newsImpact: number;
  news: NewsHeadline[];
  action: DecisionAction;
  confidence: ConfidenceLevel;
  reason: string;
  closes: number[]; // ✨ Phase 1 — expose để tính enhanced indicators
  volumes: number[]; // ✨ Phase 2B — expose để tính OBV/MFI
  highs: number[]; // ✨ mozy lesson 2 — support/resistance
  lows: number[]; // ✨ mozy lesson 2 — support/resistance
};

type PriceHistory = {
  close: number[];
  volume: number[];
  high: number[]; // ✨ mozy lesson 2 — support/resistance
  low: number[]; // ✨ mozy lesson 2 — support/resistance
  dates?: string[]; // ngày thật của từng nến (để lưu Supabase chuẩn)
};

type SignalStats = {
  trend3mPct: number;
  volatilityPct: number;
  momentumPct: number;
  volumeTrendPct: number;
  rsi14: number;
  suggestedTp: number;
  suggestedSl: number;
};

type DecisionResult = {
  action: DecisionAction;
  confidence: ConfidenceLevel;
  reason: string;
};

// ================= CONSTANTS =================

const DEFAULT_TP_PCT = 1.05;
const DEFAULT_SL_PCT = 0.97;
const VOLATILITY_SCALE = Math.sqrt(5); // weekly → annualised approx
const RISK_MIN_PCT = 3;
const RISK_MAX_PCT = 8;
const SCORE_BUY_HIGH = 4;
const SCORE_BUY_MED = 2;
const SCORE_SELL_HIGH = -4;
const SCORE_SELL_MED = -2;
const NEWS_RECENT_DAYS = 30;
const NEWS_MAX_ITEMS = 10;
const RSI_PERIOD = 14;
const HISTORY_CACHE_SECS = 900; // 15 min — price history is slow-changing
const NEWS_CACHE_SECS = 600; // 10 min

// Yahoo Finance hosts — query1 is primary, query2 is fallback
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'] as const;

// ================= UTILS =================

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const roundPrice = (v: number) => Math.round(v / 10) * 10;

function normalizeDate(input: string): number {
  const t = new Date(input).getTime();
  return isNaN(t) ? 0 : t;
}

function filterRecent(news: NewsHeadline[], days = NEWS_RECENT_DAYS) {
  const cutoff = Date.now() - days * 86_400_000;
  return news.filter(n => normalizeDate(n.pubDate) >= cutoff);
}

function dedupe(news: NewsHeadline[]): NewsHeadline[] {
  const seen = new Map<string, NewsHeadline>();
  for (const n of news) {
    const key = n.title.toLowerCase().trim();
    if (key && !seen.has(key)) seen.set(key, n);
  }
  return Array.from(seen.values());
}

// ================= NEWS FILTER =================

const NOISE_KEYWORDS = ['cw', 'chứng quyền', 'cmw'];

function isValidNews(title: string): boolean {
  const t = title.toLowerCase();
  return !NOISE_KEYWORDS.some(k => t.includes(k));
}

// ================= SENTIMENT (WITH NEGATION) =================
//
// Xử lý phủ định tiếng Việt: nếu một trong các từ phủ định xuất hiện
// trong cửa sổ 2 từ TRƯỚC keyword thì đảo dấu của keyword đó.
// VD: "không tăng" → -1 thay vì +1
//     "chưa phục hồi" → -1 thay vì +1
//     "thay vì giảm" → +1 thay vì -1 (tin tốt hơn dự kiến)

const NEGATION_WORDS = ['không', 'chưa', 'chẳng', 'chớ', 'đừng', 'thay vì', 'ngoại trừ'];
const POS_WORDS = ['tăng', 'lãi', 'mua', 'tích cực', 'kỷ lục', 'phục hồi', 'tăng trưởng', 'bứt phá', 'vượt', 'khởi sắc'];
const NEG_WORDS = ['giảm', 'lỗ', 'bán', 'rủi ro', 'phạt', 'vi phạm', 'sụt', 'bán tháo', 'tụt', 'hạ', 'yếu'];

function hasNegationBefore(words: string[], keywordIdx: number): boolean {
  // Check window of 2 words before the keyword position
  const window = words.slice(Math.max(0, keywordIdx - 2), keywordIdx).join(' ');
  return NEGATION_WORDS.some(neg => window.includes(neg));
}

function sentimentScore(title: string): number {
  const t = title.toLowerCase();
  const words = t.split(/\s+/);
  let score = 0;

  for (const pos of POS_WORDS) {
    const idx = words.findIndex((_, i) => words.slice(i).join(' ').startsWith(pos));
    if (idx === -1) continue;
    score += hasNegationBefore(words, idx) ? -1 : 1;
  }

  for (const neg of NEG_WORDS) {
    const idx = words.findIndex((_, i) => words.slice(i).join(' ').startsWith(neg));
    if (idx === -1) continue;
    score += hasNegationBefore(words, idx) ? 1 : -1;
  }

  return clamp(score / 3, -1, 1);
}

function calcNewsImpact(news: NewsHeadline[]): number {
  if (!news.length) return 0;
  const avg = news.reduce((s, n) => s + (n.sentiment ?? 0), 0) / news.length;
  // Log-scale: tránh flood headlines cùng nội dung thống trị score
  return clamp(avg * Math.log(news.length + 1), -2, 2);
}

// ================= FETCH NEWS =================
// Strategy: Google News RSS — reliable, no scraping fragility.
// CafeF/Vietstock trả về empty do JS rendering + anti-bot.

async function fetchGoogleNewsRSS(symbol: string): Promise<NewsHeadline[]> {
  const query = encodeURIComponent(`${symbol} cổ phiếu`);
  // URL viết dạng nối chuỗi để tránh editor làm hỏng literal https://
  const url =
    'https://' + 'news.google.com/rss/search?q=' + query + '&hl=vi&gl=VN&ceid=VN:vi';

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: NEWS_CACHE_SECS },
    });

    if (!res.ok) {
      console.warn(`[fetchGoogleNewsRSS] ${symbol}: HTTP ${res.status}`);
      return [];
    }

    const text = await res.text();

    const extractTag = (xml: string, tag: string): string => {
      const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (!m) return '';
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };

    const items = text.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

    if (items.length === 0) {
      console.warn(`[fetchGoogleNewsRSS] ${symbol}: 0 items — possible datacenter block or empty feed`);
      return [];
    }

    const news: NewsHeadline[] = [];
    for (const item of items.slice(0, NEWS_MAX_ITEMS)) {
      const rawTitle = extractTag(item, 'title');
      // Google News format: "Headline - Source Name"
      const title = rawTitle.split(' - ')[0].trim();
      const source = extractTag(item, 'source') || rawTitle.split(' - ').at(-1)?.trim() || '';
      const pubDate = extractTag(item, 'pubDate');
      const link = extractTag(item, 'link');
      if (title) news.push({ title, source, pubDate, url: link });
    }

    return news;
  } catch (err) {
    console.error(`[fetchGoogleNewsRSS] ${symbol}:`, err);
    return [];
  }
}

async function fetchAllNews(symbol: string): Promise<NewsHeadline[]> {
  const raw = await fetchGoogleNewsRSS(symbol);

  const news = dedupe(
    filterRecent(
      raw.filter(n => isValidNews(n.title) && n.title.length > 5),
      NEWS_RECENT_DAYS,
    ),
  );

  return news.map(n => ({ ...n, sentiment: sentimentScore(n.title) }));
}

// ================= NETWORK HELPERS =================

const HISTORY_TIMEOUT_MS = 8000;
const HISTORY_MAX_RETRIES = 2;
const HISTORY_CONCURRENCY = 5; // tránh fire hàng chục mã song song → 429/block

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

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

// ================= HISTORY (DNSE-first; Yahoo cho HOSE, VCI cho HNX/UPCOM) =================

const EMPTY_HISTORY: PriceHistory = { close: [], volume: [], high: [], low: [], dates: [] };

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// ─── DNSE Entrade (✨ Phase 3 — nguồn CHÍNH, đồng bộ với dashboard & /api/history) ─────
// getVciChartOHLCV gọi services.entrade.com.vn, trả OhlcvSeries (giá raw VND).
// Adapter map sang PriceHistory để toàn bộ pipeline tín hiệu dùng chung 1 bộ giá với dashboard.
async function fetchDnseHistory(symbol: string, days = 90): Promise<PriceHistory> {
  const series = await getVciChartOHLCV(symbol, days);

  const closesSrc = series?.closes ?? [];
  const highsSrc = series?.highs ?? [];
  const lowsSrc = series?.lows ?? [];
  const volsSrc = series?.volumes ?? [];
  const tsSrc = series?.timestamps ?? [];
  const tdSrc = series?.trade_dates ?? [];

  const close: number[] = [];
  const volume: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const dates: string[] = [];

  for (let i = 0; i < closesSrc.length; i++) {
    const c = Number(closesSrc[i]);
    if (!Number.isFinite(c) || c <= 0) continue;
    const h = Number(highsSrc[i]);
    const l = Number(lowsSrc[i]);
    const v = Number(volsSrc[i]);
    close.push(c);
    high.push(Number.isFinite(h) && h > 0 ? h : c);
    low.push(Number.isFinite(l) && l > 0 ? l : c);
    volume.push(Number.isFinite(v) && v >= 0 ? v : 0);

    // Ưu tiên trade_dates (chuỗi ngày thật); fallback sang timestamp epoch (giây)
    const td = tdSrc[i];
    const ts = Number(tsSrc[i]);
    const dateStr = td
      ? String(td).slice(0, 10)
      : Number.isFinite(ts)
        ? new Date(ts * 1000).toISOString().slice(0, 10)
        : '';
    dates.push(dateStr);
  }

  if (close.length === 0) throw new Error(`DNSE empty for ${symbol}`);
  return { close, volume, high, low, dates };
}

// ─── Yahoo (HOSE + VNINDEX) ─────────────────────────────────────────────────
async function fetchYahooHistory(ticker: string): Promise<PriceHistory> {
  let lastError: unknown;

  for (const host of YAHOO_HOSTS) {
    try {
      const url =
        'https://' + host + '/v8/finance/chart/' +
        encodeURIComponent(ticker) + '?interval=1d&range=3mo';
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
const VCI_CHART_URL = 'https://' + 'trading.vietcap.com.vn/api/chart/OHLCChart/gap';
const VCI_CHART_HEADERS = {
  'Content-Type': 'application/json',
  Referer: 'https://' + 'trading.vietcap.com.vn/',
  Origin: 'https://' + 'trading.vietcap.com.vn',
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
// price_history được populate bởi cron + VCI Edge Function sau 15:20 VN.
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
    close: rows.map(r => toNum(r.close)),
    volume: rows.map(r => toNum(r.volume)),
    high: rows.map(r => toNum(r.high)),
    low: rows.map(r => toNum(r.low)),
    dates: rows.map(r => String(r.trade_date ?? '').slice(0, 10)),
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
    const rows = history.close
      .map((close, i) => {
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
      })
      .filter(r => r.trade_date); // bỏ row không xác định được ngày

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
    /* non-critical, không block */
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

// ─── Định tuyến chính (✨ Phase 3 — DNSE-first) ─────────────────────────────
async function fetchHistory(symbol: string): Promise<PriceHistory> {
  // ✨ Phase 3 — ƯU TIÊN DNSE Entrade trước (cùng nguồn với dashboard & /api/history/[symbol])
  // → AI và dashboard nhìn CÙNG một bộ giá. getVciChartOHLCV xử lý cả VNINDEX qua isVnIndexSymbol.
  try {
    const hist = await fetchDnseHistory(symbol, 90);
    if (hist.close.length >= 20) {
      if (symbol !== 'VNINDEX') {
        const exch = getExchange(symbol) ?? 'HOSE';
        saveHistoryToSupabase(symbol, exch, hist); // fire-and-forget
      }
      return hist;
    }
  } catch (err) {
    console.error(`[fetchHistory] DNSE failed for ${symbol}:`, err);
  }

  // VNINDEX: DNSE lỗi → Yahoo → Supabase
  if (symbol === 'VNINDEX') {
    try { return await fetchYahooHistory('^VNINDEX'); } catch { /* fallthrough */ }
    try { return await fetchSupabaseHistory('VNINDEX', 90); } catch { /* */ }
    return EMPTY_HISTORY;
  }

  const exchange = getExchange(symbol);
  const offYahoo = exchange === 'HNX' || exchange === 'UPCOM';

  if (offYahoo) {
    // HNX/UPCOM: Yahoo KHÔNG có → VCI chart là nguồn dự phòng chính
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

// ================= RSI =================

/**
 * Wilder's RSI-14.
 * Returns value in [0, 100]. Returns 50 (neutral) if insufficient data.
 */
function calcRSI(closes: number[], period = RSI_PERIOD): number {
  if (closes.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;

  // Seed: first `period` changes
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining candles
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ================= MOMENTUM =================

/**
 * Linear regression slope over `period` closes, normalised as % of last price.
 * More robust than simple point-to-point comparison.
 */
function calcMomentumSlope(closes: number[], period = 10): number {
  const s = closes.slice(-period);
  const n = s.length;
  if (n < 2) return 0;

  const xMean = (n - 1) / 2;
  const yMean = s.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (s[i] - yMean);
    den += (i - xMean) ** 2;
  }

  return den ? (num / den / s[n - 1]) * 100 : 0;
}

// ================= SIGNALS =================

function calcSignals(
  history: PriceHistory,
  price: number,
  newsImpact: number,
): SignalStats {
  const { close: closes, volume: volumes } = history;

  if (!closes.length || price <= 0) {
    return {
      trend3mPct: 0,
      volatilityPct: 2,
      momentumPct: 0,
      volumeTrendPct: 0,
      rsi14: 50,
      suggestedTp: roundPrice(price * DEFAULT_TP_PCT),
      suggestedSl: roundPrice(price * DEFAULT_SL_PCT),
    };
  }

  // Trend
  const first = closes[0];
  const last = closes[closes.length - 1];
  const trend3mPct = ((last - first) / first) * 100;

  // Momentum
  const momentumPct = calcMomentumSlope(closes);

  // RSI
  const rsi14 = calcRSI(closes);

  // Volume trend — guard against empty volumes array
  let volumeTrendPct = 0;
  if (volumes.length >= 5) {
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    volumeTrendPct = avgVol > 0 ? ((recentVol - avgVol) / avgVol) * 100 : 0;
  }

  // Volatility — correct sample variance: Var(X) = E[(X - mean)²] / (n-1)
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) returns.push((closes[i] - prev) / prev);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const volatilityPct = Math.sqrt(Math.max(variance, 0)) * 100 * VOLATILITY_SCALE;

  // TP / SL — adjusted by news and RSI
  const risk = clamp(volatilityPct, RISK_MIN_PCT, RISK_MAX_PCT);
  const newsBoost = clamp(newsImpact, -1, 1);
  // RSI overbought → tighten TP multiplier; oversold → widen it
  const rsiAdj = rsi14 > 70 ? -0.3 : rsi14 < 30 ? 0.3 : 0;
  const rewardMult = trend3mPct >= 0 ? clamp(1.5 + newsBoost * 0.5 + rsiAdj, 0.8, 2.5) : 1.0;

  const suggestedTp = roundPrice(price * (1 + (risk * rewardMult) / 100));
  const suggestedSl = roundPrice(price * (1 - risk / 100));

  return {
    trend3mPct,
    volatilityPct,
    momentumPct,
    volumeTrendPct,
    rsi14,
    suggestedTp,
    suggestedSl,
  };
}

// ================= DECISION =================

/**
 * Score-based action decision.
 *
 * Score range: -6 to +7 (with RSI and relative strength factors)
 *
 * Scoring:
 *   Trend 3m      ±2 (> +5% or < -5%)
 *   Momentum      ±2 (slope > 0.2 or < -0.2)
 *   Volume        +1 (recent vol > avg by 10%)
 *   News          ±1
 *   Volatility    -1 (annualised > 15%)
 *   RSI           ±1 (oversold <30 = +1, overbought >70 = -1)
 *   Rel. strength ±1 (outperform/underperform VNINDEX)
 */
function decideAction(
  trend3mPct: number,
  momentumPct: number,
  volumeTrendPct: number,
  newsImpact: number,
  volatilityPct: number,
  rsi14: number,
  relativeStrength: number,
): DecisionResult {
  let score = 0;

  // Trend (±2)
  if (trend3mPct > 5) score += 2;
  else if (trend3mPct < -5) score -= 2;

  // Momentum (±2)
  if (momentumPct > 0.2) score += 2;
  else if (momentumPct < -0.2) score -= 2;

  // Volume confirmation (+1) — dòng tiền vào xác nhận xu hướng
  if (volumeTrendPct > 10) score += 1;

  // News sentiment (±1)
  if (newsImpact > 0.5) score += 1;
  else if (newsImpact < -0.5) score -= 1;

  // Volatility penalty (-1) — tín hiệu không đáng tin khi biến động quá cao
  if (volatilityPct > 15) score -= 1;

  // RSI (±1) — oversold có thể bounce, overbought cẩn thận
  if (rsi14 < 30) score += 1;
  else if (rsi14 > 70) score -= 1;

  // Relative strength vs VNINDEX (±1)
  // Dương = outperform (tốt hơn thị trường), âm = underperform
  if (relativeStrength > 5) score += 1;
  else if (relativeStrength < -5) score -= 1;

  // Map score → action + reason
  if (score >= SCORE_BUY_HIGH) {
    const rsiNote = rsi14 > 65 ? ', RSI cao — cân nhắc chờ điều chỉnh nhẹ' : '';
    return {
      action: 'BUY',
      confidence: 'HIGH',
      reason: `Xu hướng tăng mạnh, momentum và khối lượng xác nhận, outperform VNINDEX${rsiNote}`,
    };
  }
  if (score >= SCORE_BUY_MED) {
    return {
      action: 'BUY',
      confidence: 'MEDIUM',
      reason: rsi14 < 35
        ? 'Xu hướng tăng hình thành, RSI vùng oversold — cơ hội bắt đáy'
        : 'Xu hướng tăng đang hình thành, chờ thêm xác nhận khối lượng',
    };
  }
  if (score === 1 || score === 0) {
    return {
      action: 'HOLD',
      confidence: 'MEDIUM',
      reason: 'Tín hiệu trung tính, vị thế hiện tại ổn — theo dõi thêm',
    };
  }
  if (score === -1) {
    return {
      action: 'WATCH',
      confidence: 'LOW',
      reason: relativeStrength < -5
        ? 'Tín hiệu yếu, underperform VNINDEX — chưa nên vào mới'
        : 'Tín hiệu yếu, chưa rõ xu hướng — chờ xác nhận',
    };
  }
  if (score <= SCORE_SELL_HIGH) {
    return {
      action: 'SELL',
      confidence: 'HIGH',
      reason: `Xu hướng giảm mạnh${rsi14 < 35 ? ', RSI oversold — nếu gồng thì đặt SL chặt' : ', momentum và dòng tiền đều xác nhận'}`,
    };
  }
  // score -2 hoặc -3
  return {
    action: 'SELL',
    confidence: 'MEDIUM',
    reason: rsi14 > 60
      ? 'Xu hướng yếu, RSI chưa về vùng hỗ trợ — cân nhắc cắt lỗ một phần'
      : 'Xu hướng yếu, cân nhắc cắt lỗ hoặc chờ tín hiệu đảo chiều',
  };
}

// ================= MAIN =================

export async function buildTechnicalSignals(
  symbols: string[],
): Promise<TechnicalSignal[]> {
  // Fetch market prices cho tất cả symbols + VNINDEX (để tính relative strength)
  const allSymbols = symbols.includes('VNINDEX') ? symbols : [...symbols, 'VNINDEX'];
  const payload = await fetchMarketPrices(allSymbols);

  // Fetch VNINDEX history một lần — dùng chung cho tất cả symbols
  const vnindexHistory = await fetchHistory('VNINDEX');
  const vnindexTrend = vnindexHistory.close.length >= 2
    ? ((vnindexHistory.close.at(-1)! - vnindexHistory.close[0]) / vnindexHistory.close[0]) * 100
    : 0;

  // ✨ Giới hạn concurrency để tránh Yahoo/VCI 429 hoặc block
  const results = await mapWithConcurrency(
    symbols,
    HISTORY_CONCURRENCY,
    async (symbol): Promise<TechnicalSignal> => {
      const price = Number(payload.prices[symbol] ?? 0);

      const [history, news] = await Promise.all([
        fetchHistory(symbol),
        fetchAllNews(symbol),
      ]);

      // Relative strength: mã outperform hay underperform VNINDEX cùng kỳ 3 tháng
      const symbolTrend = history.close.length >= 2
        ? ((history.close.at(-1)! - history.close[0]) / history.close[0]) * 100
        : 0;
      const relativeStrength = symbolTrend - vnindexTrend;

      const newsImpact = calcNewsImpact(news);
      const stats = calcSignals(history, price, newsImpact);
      const decision = decideAction(
        stats.trend3mPct,
        stats.momentumPct,
        stats.volumeTrendPct,
        newsImpact,
        stats.volatilityPct,
        stats.rsi14,
        relativeStrength,
      );

      return {
        symbol,
        currentPrice: price,
        ...stats,
        relativeStrength: Number(relativeStrength.toFixed(2)),
        newsImpact,
        news,
        ...decision,
        closes: history.close, // ✨ Phase 1 — expose để tính enhanced indicators
        volumes: history.volume, // ✨ Phase 2B — expose để tính OBV/MFI
        highs: history.high, // ✨ mozy lesson 2
        lows: history.low, // ✨ mozy lesson 2
      };
    },
  );

  return results.flatMap(r => {
    if (r.status === 'fulfilled') return [r.value];
    console.error('[buildTechnicalSignals] symbol failed:', r.reason);
    return [];
  });
}

// ================= AI CALL =================
// Supports Gemini (Google AI Studio) and Groq (OpenAI-compatible).
// callAiWithFallback tries the user-selected model first;
// if it fails (quota/error) it automatically falls back to Groq default
// and returns a flag so the UI can notify the user.

import { getModelMeta, isValidModelKey, FALLBACK_MODEL, AiModelKey } from '@/lib/server/ai-models';
import { envServer } from '@/lib/env-server';

export type AiCallResult<T> = {
  data: T;
  modelUsed: string;
  providerUsed: 'gemini' | 'groq';
  fallbackUsed: boolean;
  fallbackReason?: string;
};

// ================= GROQ CALL =================

async function callGroq<T>(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
): Promise<T> {
  const apiKey = envServer.GROQ_API_KEY ?? envServer.OPENROUTER_API_KEY;
  if (!apiKey) return fallback;

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://' + 'api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || FALLBACK_MODEL,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        cache: 'no-store',
      });

      if (res.status === 429) {
        const after = Number(res.headers.get('retry-after') ?? 2);
        await new Promise(r => setTimeout(r, after * 1000));
        continue;
      }

      if (!res.ok) {
        console.error(`[callGroq] HTTP ${res.status}`);
        return fallback;
      }

      const json = await res.json();
      const text: string | undefined = json?.choices?.[0]?.message?.content;
      if (!text) return fallback;

      const clean = text.replace(/```(?:json)?|```/g, '').trim();
      return JSON.parse(clean) as T;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error('[callGroq] failed after retries:', err);
        return fallback;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return fallback;
}

// ================= GEMINI CALL =================

async function callGemini<T>(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
): Promise<T> {
  const apiKey = envServer.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured — set it in Vercel env vars');

  // Gemini uses a different endpoint and request format
  const url =
    'https://' + 'generativelanguage.googleapis.com/v1beta/models/' +
    model + ':generateContent?key=' + apiKey;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
    cache: 'no-store',
  });

  // 429 = quota exceeded — caller will handle fallback
  if (res.status === 429) throw new Error('GEMINI_QUOTA_EXCEEDED');

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GEMINI_HTTP_${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const text: string | undefined =
    json?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) throw new Error('GEMINI_EMPTY_RESPONSE');

  const clean = text.replace(/```(?:json)?|```/g, '').trim();
  return JSON.parse(clean) as T;
}

// ================= UNIFIED CALL WITH FALLBACK =================

export async function callAiWithFallback<T>(
  modelKey: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
): Promise<AiCallResult<T>> {
  const key = isValidModelKey(modelKey) ? modelKey : FALLBACK_MODEL;
  const meta = getModelMeta(key);

  // --- Try selected model ---
  if (meta.provider === 'gemini') {
    try {
      const data = await callGemini<T>(key, systemPrompt, userPrompt, fallback);
      return { data, modelUsed: key, providerUsed: 'gemini', fallbackUsed: false };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      const isQuota = reason.includes('QUOTA_EXCEEDED');

      console.warn(`[callAiWithFallback] Gemini failed (${reason}), falling back to Groq`);

      // Fallback to Groq
      const data = await callGroq<T>(FALLBACK_MODEL, systemPrompt, userPrompt, fallback);
      return {
        data,
        modelUsed: FALLBACK_MODEL,
        providerUsed: 'groq',
        fallbackUsed: true,
        fallbackReason: isQuota
          ? 'Gemini hết quota, đã chuyển sang Groq tự động.'
          : `Gemini lỗi, đã chuyển sang Groq. (${reason.slice(0, 80)})`,
      };
    }
  }

  // --- Groq path ---
  const data = await callGroq<T>(key, systemPrompt, userPrompt, fallback);
  return { data, modelUsed: key, providerUsed: 'groq', fallbackUsed: false };
}

// ================= BACKWARD COMPAT =================
// Kept for any code still importing callOpenRouterJson directly.

export async function callOpenRouterJson<T>(
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
): Promise<T> {
  if (!apiKey) return fallback;
  return callGroq<T>(model || FALLBACK_MODEL, systemPrompt, userPrompt, fallback);
}

// ── Test exports — only available in test environment ────────────────────────
// These internal functions are exported solely for unit testing purposes.
// Do NOT import these in application code.
export const _test = {
  sentimentScore: (title: string) => sentimentScore(title),
  calcRSI: (closes: number[], period?: number) => calcRSI(closes, period),
  calcMomentumSlope: (closes: number[], period?: number) => calcMomentumSlope(closes, period),
  decideAction: (
    trend3mPct: number,
    momentumPct: number,
    volumeTrendPct: number,
    newsImpact: number,
    volatilityPct: number,
    rsi14: number,
    relativeStrength: number,
  ) => decideAction(trend3mPct, momentumPct, volumeTrendPct, newsImpact, volatilityPct, rsi14, relativeStrength),
};
