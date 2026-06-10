import { fetchMarketPrices } from '@/lib/server/market';
import { getExchange } from '@/lib/server/exchanges/exchange';

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
  closes: number[]; // ✨ Phase 1 — enhanced indicators
  volumes: number[]; // ✨ Phase 2B — OBV/MFI
  highs: number[]; // ✨ mozy lesson 2 — support/resistance
  lows: number[]; // ✨ mozy lesson 2 — support/resistance
};

type PriceHistory = {
  close: number[];
  volume: number[];
  high: number[];
  low: number[];
  dates?: string[]; // ✨ ISO YYYY-MM-DD song song với close (nếu nguồn có)
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
const HISTORY_CACHE_SECS = 900; // 15 min
const NEWS_CACHE_SECS = 600; // 10 min

// Yahoo Finance hosts — query1 primary, query2 fallback
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'] as const;

// ✨ Network robustness cho history fetch
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HISTORY_TIMEOUT_MS = 8_000;
const HISTORY_MAX_RETRIES = 2;
const HISTORY_CONCURRENCY = 5;

// ✨ VCI chart (HOSE + HNX + UPCOM) — endpoint chuẩn theo source vnstock (vci/const.py)
//   POST {timeFrame:'ONE_DAY', symbols:[sym], to:<unix>, countBack:<n>}
//   Response: list block, mỗi block có t/o/h/l/c/v là mảng song song.
const VCI_CHART_URL = 'https://trading.vietcap.com.vn/api/chart/OHLCChart/gap-chart';
const VCI_CHART_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Referer: 'https://trading.vietcap.com.vn/',
  Origin: 'https://trading.vietcap.com.vn',
  'User-Agent': USER_AGENT,
};

const EMPTY_HISTORY: PriceHistory = { close: [], volume: [], high: [], low: [], dates: [] };

// ================= UTILS =================

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const roundPrice = (v: number) => Math.round(v / 10) * 10;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

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

const toFiniteNum = (v: unknown, fallback = NaN): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ── Fetch với timeout (AbortController) ──────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = HISTORY_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ── Fetch JSON với retry (exp backoff + jitter); 429/5xx mới retry ───────────
async function fetchJsonWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { label?: string; maxRetries?: number; timeoutMs?: number } = {},
): Promise<any> {
  const {
    label = url,
    maxRetries = HISTORY_MAX_RETRIES,
    timeoutMs = HISTORY_TIMEOUT_MS,
  } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);

      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const backoff =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : 300 * 2 ** attempt + Math.random() * 200;
          await sleep(backoff);
          continue;
        }
        throw new Error(`${label}: HTTP ${res.status}`);
      }

      if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`); // 4xx khác → không retry
      return await res.json();
    } catch (err) {
      lastErr = err;
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (attempt < maxRetries) {
        await sleep(300 * 2 ** attempt + Math.random() * 200);
        continue;
      }
      throw aborted ? new Error(`${label}: timeout sau ${timeoutMs}ms`) : err;
    }
  }
  throw lastErr ?? new Error(`${label}: failed`);
}

// ── Map có giới hạn đồng thời, trả PromiseSettledResult theo đúng thứ tự ─────
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));

  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

// ================= NEWS FILTER =================

const NOISE_KEYWORDS = ['cw', 'chứng quyền', 'cmw'];

function isValidNews(title: string): boolean {
  const t = title.toLowerCase();
  return !NOISE_KEYWORDS.some(k => t.includes(k));
}

// ================= SENTIMENT (WITH NEGATION) =================
//
// Xử lý phủ định tiếng Việt: nếu một từ phủ định xuất hiện trong cửa sổ 2 từ
// TRƯỚC keyword thì đảo dấu của keyword đó.
//   "không tăng" → -1 ; "chưa phục hồi" → -1 ; "thay vì giảm" → +1

const NEGATION_WORDS = ['không', 'chưa', 'chẳng', 'chớ', 'đừng', 'thay vì', 'ngoại trừ'];
const POS_WORDS = ['tăng', 'lãi', 'mua', 'tích cực', 'kỷ lục', 'phục hồi', 'tăng trưởng', 'bứt phá', 'vượt', 'khởi sắc'];
const NEG_WORDS = ['giảm', 'lỗ', 'bán', 'rủi ro', 'phạt', 'vi phạm', 'sụt', 'bán tháo', 'tụt', 'hạ', 'yếu'];

function hasNegationBefore(words: string[], keywordIdx: number): boolean {
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
  return clamp(avg * Math.log(news.length + 1), -2, 2);
}

// ================= FETCH NEWS =================
// Google News RSS — ổn định, không bị anti-bot như CafeF/Vietstock.

async function fetchGoogleNewsRSS(symbol: string): Promise<NewsHeadline[]> {
  const query = encodeURIComponent(`${symbol} cổ phiếu`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=vi&gl=VN&ceid=VN:vi`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      next: { revalidate: NEWS_CACHE_SECS },
    });

    if (!res.ok) {
      console.warn(`[fetchGoogleNewsRSS] ${symbol}: HTTP ${res.status}`);
      return [];
    }

    const text = await res.text();

    const decodeEntities = (s: string) =>
      s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');

    const extractTag = (xml: string, tag: string): string => {
      const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (!m) return '';
      const inner = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      return decodeEntities(inner).trim();
    };

    const items = text.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

    if (items.length === 0) {
      console.warn(`[fetchGoogleNewsRSS] ${symbol}: 0 items — có thể bị block hoặc feed rỗng`);
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

// ================= HISTORY =================

// ─── Yahoo (HOSE + VNINDEX) — align từng cây nến theo timestamp + dates thật ──
async function fetchYahooHistory(ticker: string): Promise<PriceHistory> {
  let lastError: unknown;

  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3mo`;
      const json = await fetchJsonWithRetry(
        url,
        { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }, cache: 'no-store' },
        { label: `Yahoo ${ticker}@${host}`, maxRetries: 1 },
      );

      const result = json?.chart?.result?.[0];
      const q = result?.indicators?.quote?.[0] ?? {};
      const ts: unknown[] = result?.timestamp ?? [];
      const rawClose: unknown[] = q.close ?? [];
      const rawHigh: unknown[] = q.high ?? [];
      const rawLow: unknown[] = q.low ?? [];
      const rawVol: unknown[] = q.volume ?? [];

      const close: number[] = [];
      const high: number[] = [];
      const low: number[] = [];
      const volume: number[] = [];
      const dates: string[] = [];

      for (let i = 0; i < rawClose.length; i++) {
        const c = toFiniteNum(rawClose[i]);
        if (!Number.isFinite(c) || c <= 0) continue; // bỏ NGUYÊN cây nến nếu close hỏng → giữ các mảng thẳng hàng
        const h = toFiniteNum(rawHigh[i], c);
        const l = toFiniteNum(rawLow[i], c);
        const v = toFiniteNum(rawVol[i], 0);
        const t = toFiniteNum(ts[i]);
        close.push(c);
        high.push(h > 0 ? h : c);
        low.push(l > 0 ? l : c);
        volume.push(v >= 0 ? v : 0);
        dates.push(Number.isFinite(t) ? new Date(t * 1000).toISOString().slice(0, 10) : '');
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

// ─── VCI chart (HOSE + HNX + UPCOM) ──────────────────────────────────────────
async function fetchVciChartHistory(symbol: string, days = 90): Promise<PriceHistory> {
  const to = Math.floor(Date.now() / 1000) + 86_400; // +1 ngày để chắc gồm phiên mới nhất
  const countBack = Math.ceil((days * 5) / 7) + 5; // số phiên ≈ ngày làm việc + buffer

  const json = await fetchJsonWithRetry(
    VCI_CHART_URL,
    {
      method: 'POST',
      headers: VCI_CHART_HEADERS,
      body: JSON.stringify({ timeFrame: 'ONE_DAY', symbols: [symbol], to, countBack }),
      cache: 'no-store',
    },
    { label: `VCI chart ${symbol}` },
  );

  // Response có thể là list, hoặc { data: [...] }
  const list: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
  const block =
    list.find(b => String(b?.symbol).toUpperCase() === symbol.toUpperCase()) ?? list[0];

  const t: unknown[] = block?.t ?? [];
  const cArr: unknown[] = block?.c ?? [];
  const hArr: unknown[] = block?.h ?? [];
  const lArr: unknown[] = block?.l ?? [];
  const vArr: unknown[] = block?.v ?? [];

  const close: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const volume: number[] = [];
  const dates: string[] = [];

  for (let i = 0; i < cArr.length; i++) {
    const c = toFiniteNum(cArr[i]);
    if (!Number.isFinite(c) || c <= 0) continue;
    const h = toFiniteNum(hArr[i], c);
    const l = toFiniteNum(lArr[i], c);
    const v = toFiniteNum(vArr[i], 0);
    const ts = toFiniteNum(t[i]);
    close.push(c);
    high.push(h > 0 ? h : c);
    low.push(l > 0 ? l : c);
    volume.push(v >= 0 ? v : 0);
    dates.push(Number.isFinite(ts) ? new Date(ts * 1000).toISOString().slice(0, 10) : '');
  }

  if (close.length === 0) throw new Error(`VCI chart empty for ${symbol}`);
  return { close, volume, high, low, dates };
}

// ─── Chuẩn hoá đơn vị giá VCI về cùng scale với giá realtime ─────────────────
// VCI có thể trả giá theo nghìn đồng (vd 27.5) trong khi realtime/Yahoo theo VND.
// Chỉ điều chỉnh khi lệch rõ ràng ~1000 lần → an toàn, không đụng case thường.
function alignPriceScale(hist: PriceHistory, refPrice?: number): PriceHistory {
  if (!refPrice || refPrice <= 0 || hist.close.length === 0) return hist;
  const last = hist.close[hist.close.length - 1];
  if (last <= 0) return hist;

  const ratio = refPrice / last;
  let factor = 1;
  if (ratio >= 500 && ratio <= 2000) factor = 1000;
  else if (ratio >= 1 / 2000 && ratio <= 1 / 500) factor = 1 / 1000;
  if (factor === 1) return hist;

  return {
    close: hist.close.map(v => v * factor),
    high: hist.high.map(v => v * factor),
    low: hist.low.map(v => v * factor),
    volume: hist.volume,
    dates: hist.dates,
  };
}

// ─── Supabase price_history (fallback mọi sàn) ───────────────────────────────
async function fetchSupabaseHistory(symbol: string, days = 90): Promise<PriceHistory> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) throw new Error('Missing Supabase env');

  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const apiUrl =
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/price_history` +
    `?symbol=eq.${encodeURIComponent(symbol)}&trade_date=gte.${from}` +
    `&order=trade_date.asc&select=trade_date,close,high,low,volume`;

  const rows: Array<{ trade_date: string; close: number; high: number; low: number; volume: number }> =
    await fetchJsonWithRetry(
      apiUrl,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, cache: 'no-store' },
      { label: `price_history ${symbol}` },
    );

  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`price_history empty for ${symbol}`);

  const close: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const volume: number[] = [];
  const dates: string[] = [];

  for (const r of rows) {
    const c = toFiniteNum(r.close);
    if (!Number.isFinite(c) || c <= 0) continue;
    close.push(c);
    high.push(toFiniteNum(r.high, c) > 0 ? toFiniteNum(r.high, c) : c);
    low.push(toFiniteNum(r.low, c) > 0 ? toFiniteNum(r.low, c) : c);
    volume.push(toFiniteNum(r.volume, 0) >= 0 ? toFiniteNum(r.volume, 0) : 0);
    dates.push(typeof r.trade_date === 'string' ? r.trade_date.slice(0, 10) : '');
  }

  if (close.length === 0) throw new Error(`price_history no valid rows for ${symbol}`);
  return { close, volume, high, low, dates };
}

// ─── Tính trade_date xấp xỉ (bỏ T7/CN) khi nguồn không có dates ──────────────
function approximateTradeDate(total: number, index: number): string {
  const daysAgo = total - 1 - index;
  const date = new Date();
  let back = 0;
  while (back < daysAgo) {
    date.setDate(date.getDate() - 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) back++;
  }
  return date.toISOString().slice(0, 10);
}

// ─── Lưu lịch sử (chỉ dùng cho nguồn Yahoo/HOSE — scale VND nhất quán) ───────
async function saveHistoryToSupabase(
  symbol: string,
  exchange: string,
  history: PriceHistory,
): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!supabaseUrl || !anonKey || history.close.length === 0) return;

    const total = history.close.length;
    const rows = history.close
      .map((close, i) => {
        const d = history.dates?.[i];
        const tradeDate = d && d.length === 10 ? d : approximateTradeDate(total, i);
        const high = Number.isFinite(history.high[i]) && history.high[i] > 0 ? history.high[i] : close;
        const low = Number.isFinite(history.low[i]) && history.low[i] > 0 ? history.low[i] : close;
        const volume =
          Number.isFinite(history.volume[i]) && history.volume[i] >= 0 ? history.volume[i] : 0;
        return {
          symbol,
          exchange,
          trade_date: tradeDate,
          open: Math.round((high + low) / 2), // không có open riêng → midpoint(high, low)
          high,
          low,
          close,
          volume,
        };
      })
      .filter(r => r.trade_date && r.close > 0);

    if (rows.length === 0) return;

    await fetchWithTimeout(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/price_history`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
      cache: 'no-store',
    });
  } catch {
    /* non-critical — không block luồng chính */
  }
}

// ─── Định tuyến nguồn lịch sử theo sàn ───────────────────────────────────────
//   VNINDEX : Yahoo(^VNINDEX) → VCI(VNINDEX) → Supabase
//   HOSE    : Yahoo(.VN)      → VCI          → Supabase   (Yahoo lưu lại Supabase)
//   HNX/UPCOM: VCI            → Supabase                  (Yahoo KHÔNG có data)
async function fetchHistory(symbol: string, refPrice?: number): Promise<PriceHistory> {
  if (symbol === 'VNINDEX') {
    try {
      const hist = await fetchYahooHistory('^VNINDEX');
      if (hist.close.length > 0) return hist;
    } catch {
      /* fallthrough */
    }
    try {
      const hist = await fetchVciChartHistory('VNINDEX', 90);
      if (hist.close.length > 0) return hist;
    } catch {
      /* fallthrough */
    }
    try {
      return await fetchSupabaseHistory('VNINDEX', 90);
    } catch {
      return EMPTY_HISTORY;
    }
  }

  const exchange = getExchange(symbol);
  const isHnxUpcom = exchange === 'HNX' || exchange === 'UPCOM';

  // HNX/UPCOM — Yahoo không có → VCI trước
  if (isHnxUpcom) {
    try {
      const hist = alignPriceScale(await fetchVciChartHistory(symbol, 90), refPrice);
      if (hist.close.length > 0) return hist;
    } catch (err) {
      console.error(`[fetchHistory] VCI chart failed for ${symbol} (${exchange}):`, err);
    }
    try {
      const hist = await fetchSupabaseHistory(symbol, 90);
      if (hist.close.length > 0) return hist;
    } catch {
      /* fallthrough */
    }
    console.warn(`[fetchHistory] No history for ${symbol} (${exchange})`);
    return EMPTY_HISTORY;
  }

  // HOSE — Yahoo trước (đã ở scale VND), lưu lại Supabase
  try {
    const hist = await fetchYahooHistory(`${symbol}.VN`);
    if (hist.close.length > 0) {
      saveHistoryToSupabase(symbol, exchange ?? 'HOSE', hist); // fire-and-forget
      return hist;
    }
  } catch (err) {
    console.warn(`[fetchHistory] Yahoo failed for ${symbol}, thử VCI:`, err);
  }

  // HOSE fallback — VCI chart
  try {
    const hist = alignPriceScale(await fetchVciChartHistory(symbol, 90), refPrice);
    if (hist.close.length > 0) return hist;
  } catch (err) {
    console.warn(`[fetchHistory] VCI chart failed for ${symbol}:`, err);
  }

  // HOSE fallback cuối — Supabase
  try {
    const hist = await fetchSupabaseHistory(symbol, 90);
    if (hist.close.length > 0) return hist;
  } catch {
    /* fallthrough */
  }

  console.warn(`[fetchHistory] No history for ${symbol} (${exchange})`);
  return EMPTY_HISTORY;
}

// ================= RSI =================

/** Wilder's RSI-14. Trả [0,100]; 50 nếu thiếu dữ liệu. */
function calcRSI(closes: number[], period = RSI_PERIOD): number {
  if (closes.length < period + 1) return 50;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

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

/** Linear regression slope qua `period` closes, chuẩn hoá % theo giá cuối. */
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

function calcSignals(history: PriceHistory, price: number, newsImpact: number): SignalStats {
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

  const first = closes[0];
  const last = closes[closes.length - 1];
  const trend3mPct = ((last - first) / first) * 100;

  const momentumPct = calcMomentumSlope(closes);
  const rsi14 = calcRSI(closes);

  let volumeTrendPct = 0;
  if (volumes.length >= 5) {
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    volumeTrendPct = avgVol > 0 ? ((recentVol - avgVol) / avgVol) * 100 : 0;
  }

  // Volatility — sample variance: Var(X) = E[(X-mean)²] / (n-1)
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) returns.push((closes[i] - prev) / prev);
  }
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
      : 0;
  const volatilityPct = Math.sqrt(Math.max(variance, 0)) * 100 * VOLATILITY_SCALE;

  // TP / SL — điều chỉnh theo news + RSI
  const risk = clamp(volatilityPct, RISK_MIN_PCT, RISK_MAX_PCT);
  const newsBoost = clamp(newsImpact, -1, 1);
  const rsiAdj = rsi14 > 70 ? -0.3 : rsi14 < 30 ? 0.3 : 0;
  const rewardMult = trend3mPct >= 0 ? clamp(1.5 + newsBoost * 0.5 + rsiAdj, 0.8, 2.5) : 1.0;

  const suggestedTp = roundPrice(price * (1 + (risk * rewardMult) / 100));
  const suggestedSl = roundPrice(price * (1 - risk / 100));

  return { trend3mPct, volatilityPct, momentumPct, volumeTrendPct, rsi14, suggestedTp, suggestedSl };
}

// ================= DECISION =================

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

  if (trend3mPct > 5) score += 2;
  else if (trend3mPct < -5) score -= 2;

  if (momentumPct > 0.2) score += 2;
  else if (momentumPct < -0.2) score -= 2;

  if (volumeTrendPct > 10) score += 1;

  if (newsImpact > 0.5) score += 1;
  else if (newsImpact < -0.5) score -= 1;

  if (volatilityPct > 15) score -= 1;

  if (rsi14 < 30) score += 1;
  else if (rsi14 > 70) score -= 1;

  if (relativeStrength > 5) score += 1;
  else if (relativeStrength < -5) score -= 1;

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
      reason:
        rsi14 < 35
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
      reason:
        relativeStrength < -5
          ? 'Tín hiệu yếu, underperform VNINDEX — chưa nên vào mới'
          : 'Tín hiệu yếu, chưa rõ xu hướng — chờ xác nhận',
    };
  }
  if (score <= SCORE_SELL_HIGH) {
    return {
      action: 'SELL',
      confidence: 'HIGH',
      reason: `Xu hướng giảm mạnh${
        rsi14 < 35 ? ', RSI oversold — nếu gồng thì đặt SL chặt' : ', momentum và dòng tiền đều xác nhận'
      }`,
    };
  }
  // score -2 hoặc -3
  return {
    action: 'SELL',
    confidence: 'MEDIUM',
    reason:
      rsi14 > 60
        ? 'Xu hướng yếu, RSI chưa về vùng hỗ trợ — cân nhắc cắt lỗ một phần'
        : 'Xu hướng yếu, cân nhắc cắt lỗ hoặc chờ tín hiệu đảo chiều',
  };
}

// ================= MAIN =================

export async function buildTechnicalSignals(symbols: string[]): Promise<TechnicalSignal[]> {
  const allSymbols = symbols.includes('VNINDEX') ? symbols : [...symbols, 'VNINDEX'];
  const payload = await fetchMarketPrices(allSymbols);

  // VNINDEX history dùng chung cho relative strength
  const vnindexHistory = await fetchHistory('VNINDEX');
  const vnindexTrend =
    vnindexHistory.close.length >= 2
      ? ((vnindexHistory.close.at(-1)! - vnindexHistory.close[0]) / vnindexHistory.close[0]) * 100
      : 0;

  const results = await mapWithConcurrency(
    symbols,
    HISTORY_CONCURRENCY,
    async (symbol): Promise<TechnicalSignal> => {
      const price = Number(payload.prices[symbol] ?? 0);

      const [history, news] = await Promise.all([
        fetchHistory(symbol, price), // ✨ truyền giá realtime để chuẩn hoá scale VCI
        fetchAllNews(symbol),
      ]);

      const symbolTrend =
        history.close.length >= 2
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
        closes: history.close,
        volumes: history.volume,
        highs: history.high,
        lows: history.low,
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
// Gemini (Google AI Studio) + Groq (OpenAI-compatible).
// callAiWithFallback thử model người dùng chọn trước; lỗi/quota → tự fallback Groq.

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
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
        await sleep(after * 1000);
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
      await sleep(500);
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
    cache: 'no-store',
  });

  if (res.status === 429) throw new Error('GEMINI_QUOTA_EXCEEDED');

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GEMINI_HTTP_${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;

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

  // --- Model được chọn ---
  if (meta.provider === 'gemini') {
    try {
      const data = await callGemini<T>(key, systemPrompt, userPrompt, fallback);
      return { data, modelUsed: key, providerUsed: 'gemini', fallbackUsed: false };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Unknown error';
      const isQuota = reason.includes('QUOTA_EXCEEDED');

      console.warn(`[callAiWithFallback] Gemini failed (${reason}), falling back to Groq`);

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
// Giữ cho code cũ còn import callOpenRouterJson trực tiếp.

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

// ── Test exports — chỉ dùng cho unit test, KHÔNG import trong app code ────────
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
  ) =>
    decideAction(trend3mPct, momentumPct, volumeTrendPct, newsImpact, volatilityPct, rsi14, relativeStrength),
};
