import { fetchMarketPrices } from '@/lib/server/market';

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
  rsi14: number;               // RSI 14 phiên — thêm mới
  relativeStrength: number;    // % so với VNINDEX cùng kỳ — thêm mới
  suggestedTp: number;
  suggestedSl: number;
  newsImpact: number;
  news: NewsHeadline[];
  action: DecisionAction;
  confidence: ConfidenceLevel;
  reason: string;
};

type PriceHistory = {
  close: number[];
  volume: number[];
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

const DEFAULT_TP_PCT     = 1.05;
const DEFAULT_SL_PCT     = 0.97;
const VOLATILITY_SCALE   = Math.sqrt(5);   // weekly → annualised approx
const RISK_MIN_PCT       = 3;
const RISK_MAX_PCT       = 8;
const SCORE_BUY_HIGH     = 4;
const SCORE_BUY_MED      = 2;
const SCORE_SELL_HIGH    = -4;
const SCORE_SELL_MED     = -2;
const NEWS_RECENT_DAYS   = 30;
const NEWS_MAX_ITEMS     = 10;             // renamed from NEWS_MAX_PER_SOURCE
const RSI_PERIOD         = 14;
const HISTORY_CACHE_SECS = 900;           // 15 min — price history is slow-changing
const NEWS_CACHE_SECS    = 600;           // 10 min

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
//     "thay vì giảm" → +1 thay vì -1  (tin tốt hơn dự kiến)

const NEGATION_WORDS = ['không', 'chưa', 'chẳng', 'chớ', 'đừng', 'thay vì', 'ngoại trừ'];
const POS_WORDS      = ['tăng', 'lãi', 'mua', 'tích cực', 'kỷ lục', 'phục hồi', 'tăng trưởng', 'bứt phá', 'vượt', 'khởi sắc'];
const NEG_WORDS      = ['giảm', 'lỗ', 'bán', 'rủi ro', 'phạt', 'vi phạm', 'sụt', 'bán tháo', 'tụt', 'hạ', 'yếu'];

function hasNegationBefore(words: string[], keywordIdx: number): boolean {
  // Check window of 2 words before the keyword position
  const window = words.slice(Math.max(0, keywordIdx - 2), keywordIdx).join(' ');
  return NEGATION_WORDS.some(neg => window.includes(neg));
}

function sentimentScore(title: string): number {
  const t     = title.toLowerCase();
  const words = t.split(/\s+/);
  let score   = 0;

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
  const url   = `https://news.google.com/rss/search?q=${query}&hl=vi&gl=VN&ceid=VN:vi`;

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
      const title   = rawTitle.split(' - ')[0].trim();
      const source  = extractTag(item, 'source') || rawTitle.split(' - ').at(-1)?.trim() || '';
      const pubDate = extractTag(item, 'pubDate');
      const link    = extractTag(item, 'link');
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

// ================= HISTORY (WITH YAHOO FALLBACK) =================

async function fetchYahooHistory(ticker: string): Promise<PriceHistory> {
  let lastError: unknown;

  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3mo`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
        next: { revalidate: HISTORY_CACHE_SECS },
      });

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${host}`);
        continue; // try next host
      }

      const json = await res.json();
      const q    = json?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};

      const close: number[] = (q.close ?? [])
        .map(Number)
        .filter((v: number) => Number.isFinite(v) && v > 0);

      const volume: number[] = (q.volume ?? [])
        .map(Number)
        .filter((v: number) => Number.isFinite(v) && v > 0);

      if (close.length === 0) {
        lastError = new Error(`Empty close data from ${host}`);
        continue;
      }

      return { close, volume };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error(`All Yahoo hosts failed for ${ticker}`);
}

async function fetchHistory(symbol: string): Promise<PriceHistory> {
  const ticker = symbol === 'VNINDEX' ? '^VNINDEX' : `${symbol}.VN`;
  try {
    return await fetchYahooHistory(ticker);
  } catch (err) {
    console.error(`[fetchHistory] ${symbol}:`, err);
    return { close: [], volume: [] };
  }
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
      trend3mPct:    0,
      volatilityPct: 2,
      momentumPct:   0,
      volumeTrendPct: 0,
      rsi14:         50,
      suggestedTp:   roundPrice(price * DEFAULT_TP_PCT),
      suggestedSl:   roundPrice(price * DEFAULT_SL_PCT),
    };
  }

  // Trend
  const first      = closes[0];
  const last       = closes[closes.length - 1];
  const trend3mPct = ((last - first) / first) * 100;

  // Momentum
  const momentumPct = calcMomentumSlope(closes);

  // RSI
  const rsi14 = calcRSI(closes);

  // Volume trend — guard against empty volumes array
  let volumeTrendPct = 0;
  if (volumes.length >= 5) {
    const avgVol    = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    volumeTrendPct  = avgVol > 0 ? ((recentVol - avgVol) / avgVol) * 100 : 0;
  }

  // Volatility — correct sample variance: Var(X) = E[(X - mean)²] / (n-1)
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) returns.push((closes[i] - prev) / prev);
  }
  const mean        = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance    = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const volatilityPct = Math.sqrt(Math.max(variance, 0)) * 100 * VOLATILITY_SCALE;

  // TP / SL — adjusted by news and RSI
  const risk       = clamp(volatilityPct, RISK_MIN_PCT, RISK_MAX_PCT);
  const newsBoost  = clamp(newsImpact, -1, 1);
  // RSI overbought → tighten TP multiplier; oversold → widen it
  const rsiAdj     = rsi14 > 70 ? -0.3 : rsi14 < 30 ? 0.3 : 0;
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
 *   Trend 3m      ±2   (> +5% or < -5%)
 *   Momentum      ±2   (slope > 0.2 or < -0.2)
 *   Volume        +1   (recent vol > avg by 10%)
 *   News          ±1
 *   Volatility    -1   (annualised > 15%)
 *   RSI           ±1   (oversold <30 = +1, overbought >70 = -1)
 *   Rel. strength ±1   (outperform/underperform VNINDEX)
 */
function decideAction(
  trend3mPct:      number,
  momentumPct:     number,
  volumeTrendPct:  number,
  newsImpact:      number,
  volatilityPct:   number,
  rsi14:           number,
  relativeStrength: number,
): DecisionResult {
  let score = 0;

  // Trend (±2)
  if (trend3mPct > 5)  score += 2;
  else if (trend3mPct < -5) score -= 2;

  // Momentum (±2)
  if (momentumPct > 0.2)  score += 2;
  else if (momentumPct < -0.2) score -= 2;

  // Volume confirmation (+1) — dòng tiền vào xác nhận xu hướng
  if (volumeTrendPct > 10) score += 1;

  // News sentiment (±1)
  if (newsImpact > 0.5)  score += 1;
  else if (newsImpact < -0.5) score -= 1;

  // Volatility penalty (-1) — tín hiệu không đáng tin khi biến động quá cao
  if (volatilityPct > 15) score -= 1;

  // RSI (±1) — oversold có thể bounce, overbought cẩn thận
  if (rsi14 < 30) score += 1;
  else if (rsi14 > 70) score -= 1;

  // Relative strength vs VNINDEX (±1)
  // Dương = outperform (tốt hơn thị trường), âm = underperform
  if (relativeStrength > 5)  score += 1;
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
  const allSymbols   = symbols.includes('VNINDEX') ? symbols : [...symbols, 'VNINDEX'];
  const payload      = await fetchMarketPrices(allSymbols, true);

  // Fetch VNINDEX history một lần — dùng chung cho tất cả symbols
  const vnindexHistory = await fetchHistory('VNINDEX');
  const vnindexTrend   = vnindexHistory.close.length >= 2
    ? ((vnindexHistory.close.at(-1)! - vnindexHistory.close[0]) / vnindexHistory.close[0]) * 100
    : 0;

  const results = await Promise.allSettled(
    symbols.map(async (symbol): Promise<TechnicalSignal> => {
      const price = Number(payload.prices[symbol] ?? 0);

      const [history, news] = await Promise.all([
        fetchHistory(symbol),
        fetchAllNews(symbol),
      ]);

      // Relative strength: mã outperform hay underperform VNINDEX cùng kỳ 3 tháng
      const symbolTrend      = history.close.length >= 2
        ? ((history.close.at(-1)! - history.close[0]) / history.close[0]) * 100
        : 0;
      const relativeStrength = symbolTrend - vnindexTrend;

      const newsImpact = calcNewsImpact(news);
      const stats      = calcSignals(history, price, newsImpact);
      const decision   = decideAction(
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
        currentPrice:    price,
        ...stats,
        relativeStrength: Number(relativeStrength.toFixed(2)),
        newsImpact,
        news,
        ...decision,
      };
    }),
  );

  return results.flatMap(r => {
    if (r.status === 'fulfilled') return [r.value];
    console.error('[buildTechnicalSignals] symbol failed:', r.reason);
    return [];
  });
}

// ================= AI CALL =================

export async function callOpenRouterJson<T>(
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
): Promise<T> {
  if (!apiKey) return fallback;

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model:           model || 'llama-3.3-70b-versatile',
          temperature:     0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
          ],
        }),
        cache: 'no-store',
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 2);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (!res.ok) {
        console.error(`[callOpenRouterJson] HTTP ${res.status}`);
        return fallback;
      }

      const json = await res.json();
      const text: string | undefined = json?.choices?.[0]?.message?.content;
      if (!text) return fallback;

      const clean = text.replace(/```(?:json)?|```/g, '').trim();
      return JSON.parse(clean) as T;
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES;
      if (isLastAttempt) {
        console.error('[callOpenRouterJson] failed after retries:', err);
        return fallback;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return fallback;
  }
