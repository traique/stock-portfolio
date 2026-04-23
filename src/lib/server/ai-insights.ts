import { fetchMarketPrices } from '@/lib/server/market';

// ================= TYPES =================

type NewsHeadline = {
  title: string;
  source: string;
  pubDate: string;
  sentiment?: number;
};

export type DecisionAction = 'BUY' | 'HOLD' | 'SELL' | 'WATCH';

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

  // 🔥 NEW
  action: DecisionAction;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
};

// ================= UTILS =================

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function roundPrice(v: number) {
  return Math.round(v / 10) * 10;
}

// ================= FETCH =================

async function fetchWithTimeout(
  url: string,
  timeoutMs = 5000
): Promise<Response | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(id);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

// ================= HISTORY =================

async function fetchHistory(symbol: string) {
  const ticker = symbol === 'VNINDEX' ? '^VNINDEX' : `${symbol}.VN`;

  const res = await fetchWithTimeout(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`
  );

  if (!res) return { close: [], volume: [] };

  const json = await res.json();
  const quote = json?.chart?.result?.[0]?.indicators?.quote?.[0] || {};

  return {
    close: (quote.close || []).filter((v: number) => v > 0),
    volume: (quote.volume || []).filter((v: number) => v > 0),
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

function isValidNews(title: string) {
  const t = title.toLowerCase();
  if (t.includes('cw ')) return false;
  if (t.includes('cmw')) return false;
  if (t.includes('chứng quyền')) return false;
  return true;
}

function sentimentScore(title: string) {
  const pos = ['tăng', 'lãi', 'mua', 'tích cực'];
  const neg = ['giảm', 'lỗ', 'bán', 'rủi ro'];

  let score = 0;
  for (const p of pos) if (title.includes(p)) score++;
  for (const n of neg) if (title.includes(n)) score--;

  return clamp(score / 3, -1, 1);
}

function calcNewsImpact(news: NewsHeadline[]) {
  if (!news.length) return 0;

  const sentiment =
    news.reduce((s, n) => s + (n.sentiment || 0), 0) / news.length;

  return sentiment * Math.log(news.length + 1);
}

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

  news = news.filter(n => isValidNews(n.title));

  return news.map(n => ({
    ...n,
    sentiment: sentimentScore(n.title),
  }));
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

  const avgVol = volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length;
  const recentVol = volumes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;

  const volumeTrendPct = ((recentVol - avgVol) / avgVol) * 100;

  const returns = closes.slice(1).map((c: number, i: number) => (c - closes[i]) / closes[i]);
  const variance =
    returns.reduce((a: number, b: number) => a + b * b, 0) / returns.length;

  const volatilityPct = Math.sqrt(variance) * 100 * Math.sqrt(5);

  const risk = clamp(volatilityPct, 3, 8);
  const newsBoost = clamp(newsImpact, -1, 1);

  let tp = price * (1 + (risk * (1.5 + newsBoost * 0.5)) / 100);
  let sl = price * (1 - risk / 100);

  if (trend3mPct < 0) {
    tp = price * (1 + risk / 100);
  }

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

// ================= DECISION ENGINE =================

function decideAction(sig: TechnicalSignal) {
  const { trend3mPct, momentumPct, volumeTrendPct, newsImpact } = sig;

  let score = 0;

  if (trend3mPct > 5) score += 2;
  if (trend3mPct < -5) score -= 2;

  if (momentumPct > 0) score += 2;
  if (momentumPct < 0) score -= 2;

  if (volumeTrendPct > 10) score += 1;

  if (newsImpact > 0.5) score += 1;
  if (newsImpact < -0.5) score -= 1;

  if (score >= 4)
    return { action: 'BUY', confidence: 'HIGH', reason: 'Strong trend + momentum + volume' };

  if (score >= 2)
    return { action: 'BUY', confidence: 'MEDIUM', reason: 'Uptrend forming' };

  if (score <= -4)
    return { action: 'SELL', confidence: 'HIGH', reason: 'Downtrend confirmed' };

  if (score <= -2)
    return { action: 'REDUCE', confidence: 'MEDIUM', reason: 'Weak trend' };

  return { action: 'WATCH', confidence: 'LOW', reason: 'No clear signal' };
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

      const decision = decideAction(base as TechnicalSignal);

      return {
        ...base,
        ...decision,
      };
    })
  );
}

// ================= AI =================

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
    return JSON.parse(json?.choices?.[0]?.message?.content || '{}');
  } catch {
    return fallback;
  }
                          }
