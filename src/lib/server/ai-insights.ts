import { fetchMarketPrices } from '@/lib/server/market';

type PriceHistory = {
  close: number[];
  high: number[];
  low: number[];
};

export type TechnicalSignal = {
  symbol: string;
  currentPrice: number;
  trend3mPct: number;
  volatilityPct: number;
  momentum5dPct: number;
  suggestedTp: number;
  suggestedSl: number;
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

async function fetchHistory(symbol: string): Promise<PriceHistory> {
  const ticker = symbol === 'VNINDEX' ? '^VNINDEX' : `${symbol}.VN`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?interval=1d&range=3mo`;

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return { close: [], high: [], low: [] };
  }

  const payload = await response.json();
  const quote = payload?.chart?.result?.[0]?.indicators?.quote?.[0] || {};

  return {
    close: toNumberArray(quote.close),
    high: toNumberArray(quote.high),
    low: toNumberArray(quote.low),
  };
}

function calcVolatilityFromCloses(closes: number[]) {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0 && curr > 0) returns.push((curr - prev) / prev);
  }

  if (!returns.length) return 2;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance =
    returns.length > 1
      ? returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1)
      : 0;

  return Math.sqrt(Math.max(variance, 0)) * 100;
}

function calcAtrPct(highs: number[], lows: number[], closes: number[]) {
  const length = Math.min(highs.length, lows.length, closes.length);
  if (length < 2) return 2.5;

  const trueRanges: number[] = [];
  for (let i = 1; i < length; i += 1) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];

    if (high <= 0 || low <= 0 || prevClose <= 0) continue;

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  if (!trueRanges.length) return 2.5;
  const lookback = Math.min(14, trueRanges.length);
  const atr = trueRanges.slice(-lookback).reduce((s, v) => s + v, 0) / lookback;
  const lastClose = closes[length - 1];
  if (lastClose <= 0) return 2.5;

  return (atr / lastClose) * 100;
}

function calcSignalsFromHistory(history: PriceHistory, currentPrice: number) {
  const closes = history.close;

  if (!closes.length || currentPrice <= 0) {
    return {
      trend3mPct: 0,
      volatilityPct: 2,
      momentum5dPct: 0,
      suggestedTp: roundPrice(currentPrice * 1.08),
      suggestedSl: roundPrice(currentPrice * 0.95),
    };
  }

  const first = closes[0];
  const last = closes[closes.length - 1];
  const trend3mPct = first > 0 ? ((last - first) / first) * 100 : 0;

  const lookback = Math.min(5, closes.length - 1);
  const momentumBase = closes[Math.max(0, closes.length - 1 - lookback)] || last;
  const momentum5dPct = momentumBase > 0 ? ((last - momentumBase) / momentumBase) * 100 : 0;

  const volatilityPct = calcVolatilityFromCloses(closes);
  const atrPct = calcAtrPct(history.high, history.low, closes);

  const regimeBoost = trend3mPct > 0 && momentum5dPct > 0 ? 0.9 : trend3mPct < 0 ? 1.15 : 1;
  const baseRiskPct = clamp(
    Math.max(atrPct * 1.35, volatilityPct * 1.05, 2.8) * regimeBoost,
    2.8,
    10.5
  );

  const rewardMultiplier =
    trend3mPct > 6 && momentum5dPct > 1
      ? 2.5
      : trend3mPct < -4 || momentum5dPct < -2
      ? 1.5
      : 2.05;

  const rewardPct = clamp(baseRiskPct * rewardMultiplier, 6.5, 24);

  return {
    trend3mPct,
    volatilityPct,
    momentum5dPct,
    suggestedTp: roundPrice(currentPrice * (1 + rewardPct / 100)),
    suggestedSl: roundPrice(currentPrice * (1 - baseRiskPct / 100)),
  };
}

export async function buildTechnicalSignals(symbols: string[]) {
  const payload = await fetchMarketPrices(symbols, true);
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const currentPrice = Number(payload.prices[symbol] || 0);
      const history = await fetchHistory(symbol);
      const stats = calcSignalsFromHistory(history, currentPrice);

      return {
        symbol,
        currentPrice,
        trend3mPct: stats.trend3mPct,
        volatilityPct: stats.volatilityPct,
        momentum5dPct: stats.momentum5dPct,
        suggestedTp: stats.suggestedTp,
        suggestedSl: stats.suggestedSl,
      } satisfies TechnicalSignal;
    })
  );

  return entries;
}

// Hàm trích xuất JSON thông minh, tóm gọn lõi JSON và bỏ qua mọi chữ rác AI tự thêm vào
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
  if (!apiKey) {
    console.error("Chưa có API Key!");
    return fallback;
  }

  const strictSystemPrompt = `${systemPrompt}
  
YÊU CẦU TỐI THƯỢNG: 
1. BẠN CHỈ ĐƯỢC PHÉP TRẢ VỀ ĐÚNG MỘT OBJECT JSON. TUYỆT ĐỐI KHÔNG TRẢ LỜI THÊM BẤT KỲ CÂU CHÀO HỎI, GIẢI THÍCH NÀO KHÁC (như "Đây là kết quả...").
2. Sử dụng tiếng Việt chuẩn, thuật ngữ chứng khoán chuyên nghiệp (Cạn cung, hỗ trợ, kháng cự, tích lũy, bùng nổ, rũ bỏ...). KHÔNG dùng tiếng Anh lóng hay dịch word-by-word.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1, // Hạ nhiệt độ xuống thấp nhất để AI bớt bay bổng, tập trung xuất JSON
        messages: [
          { role: 'system', content: strictSystemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error("Lỗi HTTP từ OpenRouter:", response.status, await response.text());
      return fallback;
    }
    
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    
    if (typeof text !== 'string' || !text.trim()) {
      console.error("OpenRouter trả về kết quả rỗng");
      return fallback;
    }

    // Dùng máy quét thông minh để lọc JSON
    const jsonString = extractJsonFromText(text);
    return JSON.parse(jsonString) as T;

  } catch (error) {
    console.error("Lỗi Parse JSON! Có thể AI trả về sai cấu trúc. Lỗi chi tiết:", error);
    return fallback;
  }
}
