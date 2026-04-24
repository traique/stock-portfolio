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
const VOLATILITY_SCALE = Math.sqrt(5); // annualise weekly
const RISK_MIN_PCT = 3;
const RISK_MAX_PCT = 8;
const SCORE_BUY_HIGH = 4;
const SCORE_BUY_MED = 2;
const SCORE_SELL_HIGH = -4;
const SCORE_SELL_MED = -2;
const NEWS_RECENT_DAYS = 30;
const NEWS_MAX_PER_SOURCE = 10;

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

function isRelevant(symbol: string, title: string): boolean {
  return title.toLowerCase().includes(symbol.toLowerCase());
}

// ================= SENTIMENT =================

const POS_WORDS = ['tăng', 'lãi', 'mua', 'tích cực', 'kỷ lục', 'phục hồi', 'tăng trưởng'];
const NEG_WORDS = ['giảm', 'lỗ', 'bán', 'rủi ro', 'phạt', 'vi phạm', 'sụt'];

function sentimentScore(title: string): number {
  const t = title.toLowerCase();
  let score = 0;
  for (const p of POS_WORDS) if (t.includes(p)) score++;
  for (const n of NEG_WORDS) if (t.includes(n)) score--;
  return clamp(score / 3, -1, 1);
}

function calcNewsImpact(news: NewsHeadline[]): number {
  if (!news.length) return 0;
  const avg = news.reduce((s, n) => s + (n.sentiment ?? 0), 0) / news.length;
  // Log-scale so a flood of similar headlines doesn't dominate
  return clamp(avg * Math.log(news.length + 1), -2, 2);
}

// ================= FETCH NEWS =================
// Strategy: Google News RSS — reliable, no scraping fragility.
// CafeF/Vietstock scraping was returning empty due to JS rendering + anti-bot.

async function fetchGoogleNewsRSS(symbol: string): Promise<NewsHeadline[]> {
  const query = encodeURIComponent(`${symbol} cổ phiếu`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=vi&gl=VN&ceid=VN:vi`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 600 },
    });

    if (!res.ok) return [];

    const text = await res.text();

    const extractTag = (xml: string, tag: string): string => {
      const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (!m) return '';
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };

    const items = text.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

    const news: NewsHeadline[] = [];
    for (const item of items.slice(0, NEWS_MAX_PER_SOURCE)) {
      const rawTitle = extractTag(item, 'title');
      // Google News titles are "Headline - Source Name"
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
  // Extend here with more reliable sources (e.g. VNDIRECT public API, SSI feed)
  const raw = await fetchGoogleNewsRSS(symbol);

  const news = dedupe(
    filterRecent(
      raw.filter(n => isValidNews(n.title) && n.title.length > 5),
      NEWS_RECENT_DAYS,
    ),
  );

  // isRelevant is a soft filter — Google already scopes by query, so we keep
  // items even if the exact ticker isn't in the title (company name may differ)
  return news.map(n => ({ ...n, sentiment: sentimentScore(n.title) }));
}

// ================= HISTORY =================

async function fetchHistory(symbol: string): Promise<PriceHistory> {
  const ticker = symbol === 'VNINDEX' ? '^VNINDEX' : `${symbol}.VN`;

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=3mo`,
      { cache: 'no-store' },
    );

    if (!res.ok) return { close: [], volume: [] };

    const json = await res.json();
    const q = json?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};

    const close: number[] = (q.close ?? [])
      .map(Number)
      .filter((v: number) => Number.isFinite(v) && v > 0);

    const volume: number[] = (q.volume ?? [])
      .map(Number)
      .filter((v: number) => Number.isFinite(v) && v > 0);

    return { close, volume };
  } catch (err) {
    console.error(`[fetchHistory] ${symbol}:`, err);
    return { close: [], volume: [] };
  }
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

  // slope as % of last price per day
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

  // Volume trend
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volumeTrendPct = avgVol > 0 ? ((recentVol - avgVol) / avgVol) * 100 : 0;

  // Volatility — correct sample variance: Var(X) = E[(X - mean)²]
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const volatilityPct = Math.sqrt(Math.max(variance, 0)) * 100 * VOLATILITY_SCALE;

  // TP / SL
  const risk = clamp(volatilityPct, RISK_MIN_PCT, RISK_MAX_PCT);
  const newsBoost = clamp(newsImpact, -1, 1);
  const rewardMult = trend3mPct >= 0 ? 1.5 + newsBoost * 0.5 : 1.0;

  const suggestedTp = roundPrice(price * (1 + (risk * rewardMult) / 100));
  const suggestedSl = roundPrice(price * (1 - risk / 100));

  return {
    trend3mPct,
    volatilityPct,
    momentumPct,
    volumeTrendPct,
    suggestedTp,
    suggestedSl,
  };
}

// ================= DECISION =================

function decideAction(
  trend3mPct: number,
  momentumPct: number,
  volumeTrendPct: number,
  newsImpact: number,
  volatilityPct: number,
): DecisionResult {
  let score = 0;

  // Trend (±2)
  if (trend3mPct > 5) score += 2;
  else if (trend3mPct < -5) score -= 2;

  // Momentum (±2)
  if (momentumPct > 0.2) score += 2;
  else if (momentumPct < -0.2) score -= 2;

  // Volume confirmation (+1)
  if (volumeTrendPct > 10) score += 1;

  // News sentiment (±1)
  if (newsImpact > 0.5) score += 1;
  else if (newsImpact < -0.5) score -= 1;

  // High volatility penalty — penalise uncertain conditions
  if (volatilityPct > 15) score -= 1;

  if (score >= SCORE_BUY_HIGH)
    return { action: 'BUY', confidence: 'HIGH', reason: 'Xu hướng tăng mạnh, momentum và khối lượng xác nhận' };
  if (score >= SCORE_BUY_MED)
    return { action: 'BUY', confidence: 'MEDIUM', reason: 'Xu hướng tăng đang hình thành' };
  if (score === 1 || score === 0)
    return { action: 'HOLD', confidence: 'MEDIUM', reason: 'Tín hiệu trung tính, theo dõi thêm' };
  if (score === -1)
    return { action: 'WATCH', confidence: 'LOW', reason: 'Tín hiệu yếu, chưa rõ xu hướng' };
  if (score <= SCORE_SELL_HIGH)
    return { action: 'SELL', confidence: 'HIGH', reason: 'Xu hướng giảm mạnh' };
  // score <= SCORE_SELL_MED
  return { action: 'SELL', confidence: 'MEDIUM', reason: 'Xu hướng yếu, cân nhắc cắt lỗ' };
}

// ================= MAIN =================

export async function buildTechnicalSignals(
  symbols: string[],
): Promise<TechnicalSignal[]> {
  const payload = await fetchMarketPrices(symbols, true);

  const results = await Promise.allSettled(
    symbols.map(async (symbol): Promise<TechnicalSignal> => {
      const price = Number(payload.prices[symbol] ?? 0);

      const [history, news] = await Promise.all([
        fetchHistory(symbol),
        fetchAllNews(symbol),
      ]);

      const newsImpact = calcNewsImpact(news);
      const stats = calcSignals(history, price, newsImpact);
      const decision = decideAction(
        stats.trend3mPct,
        stats.momentumPct,
        stats.volumeTrendPct,
        newsImpact,
        stats.volatilityPct,
      );

      return {
        symbol,
        currentPrice: price,
        ...stats,
        newsImpact,
        news,
        ...decision,
      };
    }),
  );

  // Log failures but don't crash the whole batch
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
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        cache: 'no-store',
      });

      // Rate-limit: back off and retry
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

      // Strip accidental markdown fences
      const clean = text.replace(/```(?:json)?|```/g, '').trim();
      return JSON.parse(clean) as T;
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES;
      if (isLastAttempt) {
        console.error('[callOpenRouterJson] failed after retries:', err);
        return fallback;
      }
      // Brief pause before next attempt on unexpected errors
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return fallback;
}
