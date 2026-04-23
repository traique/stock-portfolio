import { fetchMarketPrices } from '@/lib/server/market';

// ================= TYPES =================

type NewsHeadline = {
  title: string;
  source: string;
  pubDate: string;
  sentiment?: number;
};

type PriceHistory = {
  close: number[];
  high: number[];
  low: number[];
  volume: number[];
};

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
};

// ================= UTILS =================

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function roundPrice(v: number) {
  return Math.round(v / 10) * 10;
}

function toNumberArray(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.map(Number).filter(v => Number.isFinite(v) && v > 0);
}

// ================= FETCH WITH TIMEOUT =================

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 5000,
  retries = 2
): Promise<Response | null> {
  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(id);

      if (res.ok) return res;
      if (res.status >= 500) continue;

      return null;
    } catch {
      if (i === retries) return null;
    }
  }
  return null;
}

// ================= HISTORY =================

async function fetchHistory(symbol: string): Promise<PriceHistory> {
  const ticker = symbol === 'VNINDEX' ? '^VNINDEX' : `${symbol}.VN`;

  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`
  );

  if (!res) return { close: [], high: [], low: [], volume: [] };

  const json = await res.json();
  const quote = json?.chart?.result?.[0]?.indicators?.quote?.[0] || {};

  return {
    close: toNumberArray(quote.close),
    high: toNumberArray(quote.high),
    low: toNumberArray(quote.low),
    volume: toNumberArray(quote.volume),
  };
}

// ================= MOMENTUM =================

function calcMomentumSlope(closes: number[], period = 10) {
  const slice = closes.slice(-period);
  const n = slice.length;
  if (n < 2) return 0;

  const xMean = (n - 1) / 2;
  const yMean = slice.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;

  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (slice[i] - yMean);
    den += (i - xMean) ** 2;
  }

  return den ? (num / den / yMean) * 100 : 0;
}

// ================= NEWS =================

function sentimentScore(title: string) {
  const pos = ['tăng', 'lãi', 'mua', 'tích cực'];
  const neg = ['giảm', 'lỗ', 'bán', 'rủi ro'];

  let score = 0;
  for (const p of pos) if (title.includes(p)) score++;
  for (const n of neg) if (title.includes(n)) score--;

  return clamp(score / 3, -1, 1);
}

function normalizeDate(s: string) {
  const t = new Date(s).getTime();
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

function extractKeyword(title: string) {
  const keys = ['lợi nhuận', 'lỗ', 'nợ', 'trái phiếu', 'dự án'];
  return keys.find(k => title.includes(k)) || 'other';
}

function calcNewsImpact(news: NewsHeadline[]) {
  const clusters: Record<string, NewsHeadline[]> = {};

  for (const n of news) {
    const key = extractKeyword(n.title);
    if (!clusters[key]) clusters[key] = [];
    clusters[key].push(n);
  }

  let total = 0;

  for (const group of Object.values(clusters)) {
    const sentiment =
      group.reduce((s, n) => s + (n.sentiment || 0), 0) / group.length;

    const recency =
      group.reduce((s, n) => {
        const d = (Date.now() - normalizeDate(n.pubDate)) / 86400000;
        return s + Math.max(0, 1 - d / 30);
      }, 0) / group.length;

    total += sentiment * recency * Math.log(group.length + 1);
  }

  return total;
}

// ================= SIGNAL =================

function calcSignals(
  history: PriceHistory,
  price: number,
  newsImpact: number
) {
  const closes = history.close;
  const volumes = history.volume;

  if (!closes.length) {
    return {
      trend3mPct: 0,
      volatilityPct: 2,
      momentumPct: 0,
      volumeTrendPct: 0,
      suggestedTp: roundPrice(price * 1.08),
      suggestedSl: roundPrice(price * 0.95),
    };
  }

  const first = closes[0];
  const last = closes[closes.length - 1];

  const trend3mPct = ((last - first) / first) * 100;
  const momentumPct = calcMomentumSlope(closes, 10);

  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;

  const volumeTrendPct = ((recentVol - avgVol) / avgVol) * 100;

  const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;

  const variance =
    returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;

  const dailyVol = Math.sqrt(variance) * 100;
  const volatilityPct = dailyVol * Math.sqrt(5);

  const baseRisk = clamp(volatilityPct * 1.2, 3, 12);
  const newsBoost = clamp(newsImpact, -1, 1);

  let trendBoost = 1;
  if (trend3mPct > 10) trendBoost = 1.2;
  if (trend3mPct < -10) trendBoost = 0.8;

  return {
    trend3mPct,
    volatilityPct,
    momentumPct,
    volumeTrendPct,
    suggestedTp: roundPrice(
      price * (1 + baseRisk * trendBoost * (2 + newsBoost) / 100)
    ),
    suggestedSl: roundPrice(
      price * (1 - baseRisk * (1.2 - newsBoost * 0.5) / 100)
    ),
  };
}

// ================= NEWS FETCH =================

async function fetchAllNews(symbol: string): Promise<NewsHeadline[]> {
  const res = await fetchWithTimeout(
    `https://news.google.com/rss/search?q=${symbol}%20chung%20khoan`
  );

  if (!res) return [];

  const text = await res.text();
  const items = text.match(/<item>[\s\S]*?<\/item>/gi) || [];

  let news = items.slice(0, 10).map(item => ({
    title:
      item.match(/<title>(.*?)<\/title>/)?.[1]
        ?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || '',
    source: 'Google',
    pubDate: item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '',
  }));

  news = filterRecent(news, 30);
  news = dedupe(news);

  return news.map(n => ({
    ...n,
    sentiment: sentimentScore(n.title),
  }));
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

      return {
        symbol,
        currentPrice: price,
        ...stats,
        newsImpact,
        news,
      };
    })
  );
}

// ================= AI CALL (RESTORED FIX) =================

export async function callOpenRouterJson<T>(
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T
): Promise<T> {
  if (!apiKey) return fallback;

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

    if (!res.ok) return fallback;

    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;

    if (!text) return fallback;

    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
