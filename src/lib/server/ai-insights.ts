import { fetchMarketPrices } from '@/lib/server/market';

type NewsHeadline = {
  title: string;
  source: string;
  pubDate: string;
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
  momentum5dPct: number;
  volumeTrendPct: number;
  suggestedTp: number;
  suggestedSl: number;
  news: NewsHeadline[];
};

export type AiInsightResult = {
  summary: string;
  actions: Array<{
    symbol: string;
    action: 'BUY' | 'HOLD' | 'REDUCE' | 'SELL' | 'WATCH';
    reason: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    tp?: number;
    sl?: number;
  }>;
  risks: string[];
};

function roundPrice(value: number) {
  return Math.round(value / 10) * 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNumberArray(input: unknown) {
  if (!Array.isArray(input)) return [] as number[];
  return input.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
}

// HÀM CÀO TIN TỨC MỚI: Dùng Regex thay cho DOMParser để chạy được trên Server
async function fetchNewsRSS(symbol: string): Promise<NewsHeadline[]> {
  const query = encodeURIComponent(`${symbol} VN chứng khoán`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=vi&gl=VN&ceid=VN:vi`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 600 }, 
    });

    if (!response.ok) return [];
    
    const text = await response.text();
    const items = text.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const news: NewsHeadline[] = [];
    
    const extractTag = (xml: string, tag: string) => {
      const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (!match) return '';
      // Xử lý cả thẻ CDATA thường gặp trong RSS
      return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };
    
    for (let i = 0; i < Math.min(5, items.length); i += 1) {
      const itemXml = items[i];
      const title = extractTag(itemXml, 'title');
      const source = extractTag(itemXml, 'source');
      const pubDate = extractTag(itemXml, 'pubDate');
      
      if (title) {
        const cleanTitle = title.split(' - ')[0] || title;
        news.push({ title: cleanTitle.trim(), source, pubDate });
      }
    }
    return news;
  } catch (err) {
    console.error(`Lỗi cào tin tức ${symbol}:`, err);
    return [];
  }
}

async function fetchHistory(symbol: string): Promise<PriceHistory> {
  const ticker = symbol === 'VNINDEX' ? '^VNINDEX' : `${symbol}.VN`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?interval=1d&range=3mo`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
    cache: 'no-store',
  });

  if (!response.ok) return { close: [], high: [], low: [], volume: [] };

  const payload = await response.json();
  const quote = payload?.chart?.result?.[0]?.indicators?.quote?.[0] || {};

  return {
    close: toNumberArray(quote.close),
    high: toNumberArray(quote.high),
    low: toNumberArray(quote.low),
    volume: toNumberArray(quote.volume),
  };
}

function calcSignalsFromHistory(history: PriceHistory, currentPrice: number) {
  const { close: closes, volume: volumes } = history;
  if (!closes.length || currentPrice <= 0) {
    return { trend3mPct: 0, volatilityPct: 2, momentum5dPct: 0, volumeTrendPct: 0, suggestedTp: roundPrice(currentPrice * 1.08), suggestedSl: roundPrice(currentPrice * 0.95) };
  }

  const lastIdx = closes.length - 1;
  const first = closes[0];
  const last = closes[lastIdx];
  const trend3mPct = first > 0 ? ((last - first) / first) * 100 : 0;
  const lookback = Math.min(5, lastIdx);
  const momentumBase = closes[Math.max(0, lastIdx - lookback)] || last;
  const momentum5dPct = momentumBase > 0 ? ((last - momentumBase) / momentumBase) * 100 : 0;

  const avgVolume = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volumeTrendPct = avgVolume > 0 ? ((recentVolume - avgVolume) / avgVolume) * 100 : 0;

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0 && curr > 0) returns.push((curr - prev) / prev);
  }
  const mean = returns.length ? returns.reduce((s, v) => s + v, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1) : 0;
  const volatilityPct = Math.sqrt(Math.max(variance, 0)) * 100;
  
  const baseRiskPct = clamp(volatilityPct * 1.5, 3, 10);
  const rewardMultiplier = volumeTrendPct > 20 && momentum5dPct > 0 ? 3 : 2;

  return {
    trend3mPct,
    volatilityPct,
    momentum5dPct,
    volumeTrendPct,
    suggestedTp: roundPrice(currentPrice * (1 + (baseRiskPct * rewardMultiplier) / 100)),
    suggestedSl: roundPrice(currentPrice * (1 - baseRiskPct / 100)),
  };
}

export async function buildTechnicalSignals(symbols: string[]): Promise<TechnicalSignal[]> {
  const payload = await fetchMarketPrices(symbols, true);
  return await Promise.all(symbols.map(async (symbol) => {
    const currentPrice = Number(payload.prices[symbol] || 0);
    const [history, news] = await Promise.all([fetchHistory(symbol), fetchNewsRSS(symbol)]);
    const stats = calcSignalsFromHistory(history, currentPrice);
    
    return { 
      symbol, 
      currentPrice, 
      trend3mPct: stats.trend3mPct, 
      volatilityPct: stats.volatilityPct, 
      momentum5dPct: stats.momentum5dPct,
      volumeTrendPct: stats.volumeTrendPct,
      suggestedTp: stats.suggestedTp, 
      suggestedSl: stats.suggestedSl,
      news,
    } satisfies TechnicalSignal;
  }));
}

function extractJsonFromText(input: string) {
  const match = input.match(/\{[\s\S]*\}/);
  return match ? match[0] : input;
}

export async function callOpenRouterJson<T>(
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T
): Promise<T> {
  if (!apiKey) return fallback;

  let retries = 2;
  while (retries >= 0) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          temperature: 0.15,
          response_format: { type: "json_object" },
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        }),
        cache: 'no-store',
      });

      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        retries--;
        continue;
      }

      if (!response.ok) return fallback;
      const payload = await response.json();
      const text = payload?.choices?.[0]?.message?.content;
      if (!text) return fallback;

      return JSON.parse(extractJsonFromText(text)) as T;
    } catch (err) {
      return fallback;
    }
  }
  return fallback;
}
