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
  momentum5dPct: number;
  volumeTrendPct: number;
  suggestedTp: number;
  suggestedSl: number;
  newsImpact: number;
  news: NewsHeadline[];
  action: DecisionAction;
  confidence: ConfidenceLevel;
  reason: string;
};

// ================= UTILS =================

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const roundPrice = (v: number) => Math.round(v / 10) * 10;

function normalizeDate(input: string): number {
  const t = new Date(input).getTime();
  return isNaN(t) ? 0 : t;
}

function filterRecent(news: NewsHeadline[], days = 30) {
  const cutoff = Date.now() - days * 86400000;
  return news.filter(n => normalizeDate(n.pubDate) >= cutoff);
}

function dedupe(news: NewsHeadline[]) {
  const map = new Map<string, NewsHeadline>();
  for (const n of news) {
    const key = n.title.toLowerCase();
    if (!map.has(key)) map.set(key, n);
  }
  return Array.from(map.values());
}

// ================= NEWS FILTER =================

function isValidNews(title: string) {
  const t = title.toLowerCase();
  if (t.includes('cw')) return false;
  if (t.includes('chứng quyền')) return false;
  if (t.includes('cmw')) return false;
  return true;
}

function isRelevant(symbol: string, title: string) {
  return title.toLowerCase().includes(symbol.toLowerCase());
}

// ================= SENTIMENT =================

function sentimentScore(title: string) {
  const pos = ['tăng', 'lãi', 'mua', 'tích cực', 'kỷ lục'];
  const neg = ['giảm', 'lỗ', 'bán', 'rủi ro', 'phạt'];

  let score = 0;
  for (const p of pos) if (title.includes(p)) score++;
  for (const n of neg) if (title.includes(n)) score--;

  return clamp(score / 3, -1, 1);
}

function calcNewsImpact(news: NewsHeadline[]) {
  if (!news.length) return 0;
  const avg =
    news.reduce((s, n) => s + (n.sentiment || 0), 0) / news.length;
  return avg * Math.log(news.length + 1);
}

// ================= FETCH NEWS =================

async function fetchCafeF(symbol: string): Promise<NewsHeadline[]> {
  try {
    const res = await fetch(
      `https://cafef.vn/tim-kiem.chn?keywords=${symbol}`,
      { cache: 'no-store' }
    );

    const html = await res.text();

    const items =
      html.match(/<li class="tlitem">[\s\S]*?<\/li>/g) || [];

    return items.slice(0, 10).map(item => ({
      title: item.match(/title="([^"]+)"/)?.[1] || '',
      source: 'CafeF',
      pubDate: item.match(/class="time">([^<]+)</)?.[1] || '',
      url: `https://cafef.vn${
        item.match(/href="([^"]+)"/)?.[1] || ''
      }`,
    }));
  } catch {
    return [];
  }
}

async function fetchVietstock(symbol: string): Promise<NewsHeadline[]> {
  try {
    const res = await fetch(
      `https://vietstock.vn/tim-kiem.htm?keyword=${symbol}`,
      { cache: 'no-store' }
    );

    const html = await res.text();

    const items =
      html.match(/article-item[\s\S]*?<\/div>/g) || [];

    return items.slice(0, 10).map(item => ({
      title: item.match(/title="([^"]+)"/)?.[1] || '',
      source: 'Vietstock',
      pubDate: item.match(/time[^>]*>([^<]+)</)?.[1] || '',
      url: `https://vietstock.vn${
        item.match(/href="([^"]+)"/)?.[1] || ''
      }`,
    }));
  } catch {
    return [];
  }
}

async function fetchAllNews(symbol: string): Promise<NewsHeadline[]> {
  const [cafef, vietstock] = await Promise.all([
    fetchCafeF(symbol),
    fetchVietstock(symbol),
  ]);

  let news = [...cafef, ...vietstock];

  news = news.filter(n => isValidNews(n.title));
  news = news.filter(n => isRelevant(symbol, n.title));
  news = filterRecent(news, 30);
  news = dedupe(news);

  return news.map(n => ({
    ...n,
    sentiment: sentimentScore(n.title),
  }));
}

// ================= HISTORY =================

async function fetchHistory(symbol: string) {
  const ticker = symbol === 'VNINDEX' ? '^VNINDEX' : `${symbol}.VN`;

  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`,
    { cache: 'no-store' }
  );

  if (!res.ok) return { close: [], volume: [] };

  const json = await res.json();
  const q = json?.chart?.result?.[0]?.indicators?.quote?.[0] || {};

  return {
    close: (q.close || []).filter((v: number) => v > 0),
    volume: (q.volume || []).filter((v: number) => v > 0),
  };
}

// ================= MOMENTUM =================

function calcMomentumSlope(closes: number[], period = 10) {
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

  return den ? (num / den / yMean) * 100 : 0;
}

// ================= SIGNAL =================

function calcSignals(history: any, price: number, newsImpact: number) {
  const closes = history.close;
  const volumes = history.volume;

  if (!closes.length) {
    return {
      trend3mPct: 0,
      volatilityPct: 2,
      momentumPct: 0,
      momentum5dPct: 0,
      volumeTrendPct: 0,
      suggestedTp: roundPrice(price * 1.05),
      suggestedSl: roundPrice(price * 0.97),
    };
  }

  const first = closes[0];
  const last = closes[closes.length - 1];

  const trend3mPct = ((last - first) / first) * 100;
  const momentumPct = calcMomentumSlope(closes);

  const avgVol =
    volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length;

  const recentVol =
    volumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;

  const volumeTrendPct = ((recentVol - avgVol) / avgVol) * 100;

  const returns = closes.slice(1).map(
    (c: number, i: number) => (c - closes[i]) / closes[i]
  );

  const variance =
    returns.reduce((a: number, b: number) => a + b * b, 0) /
    returns.length;

  const volatilityPct = Math.sqrt(variance) * 100 * Math.sqrt(5);

  const risk = clamp(volatilityPct, 3, 8);
  const newsBoost = clamp(newsImpact, -1, 1);

  let tp = price * (1 + (risk * (1.5 + newsBoost * 0.5)) / 100);
  let sl = price * (1 - risk / 100);

  if (trend3mPct < 0) tp = price * (1 + risk / 100);

  return {
    trend3mPct,
    volatilityPct,
    momentumPct,
    momentum5dPct: momentumPct,
    volumeTrendPct,
    suggestedTp: roundPrice(tp),
    suggestedSl: roundPrice(sl),
  };
}

// ================= DECISION =================

function decideAction(base: any) {
  const { trend3mPct, momentumPct, volumeTrendPct, newsImpact } = base;

  let score = 0;

  if (trend3mPct > 5) score += 2;
  if (trend3mPct < -5) score -= 2;

  if (momentumPct > 0) score += 2;
  if (momentumPct < 0) score -= 2;

  if (volumeTrendPct > 10) score += 1;

  if (newsImpact > 0.5) score += 1;
  if (newsImpact < -0.5) score -= 1;

  if (score >= 4)
    return { action: 'BUY', confidence: 'HIGH', reason: 'Strong uptrend' };

  if (score >= 2)
    return { action: 'BUY', confidence: 'MEDIUM', reason: 'Uptrend forming' };

  if (score <= -4)
    return { action: 'SELL', confidence: 'HIGH', reason: 'Downtrend' };

  if (score <= -2)
    return { action: 'SELL', confidence: 'MEDIUM', reason: 'Weak trend' };

  return { action: 'WATCH', confidence: 'LOW', reason: 'No signal' };
}

// ================= MAIN =================

export async function buildTechnicalSignals(
  symbols: string[]
): Promise<TechnicalSignal[]> {
  const payload = await fetchMarketPrices(symbols, true);

  return Promise.all(
    symbols.map(async symbol => {
      const price = Number(payload.prices[symbol] || 0);

      const [history, news] = await Promise.all([
        fetchHistory(symbol),
        fetchAllNews(symbol),
      ]);

      const newsImpact = calcNewsImpact(news);
      const stats = calcSignals(history, price, newsImpact);

      const base = {
        symbol,
        currentPrice: price,
        ...stats,
        newsImpact,
        news,
      };

      const decision = decideAction(base);

      return {
        ...base,
        ...decision,
      } as TechnicalSignal;
    })
  );
     }
