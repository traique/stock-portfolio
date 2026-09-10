// Kiểu dùng chung cho toàn bộ pipeline AI insights.

export type NewsHeadline = {
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
  rsi14: number;
  relativeStrength: number;
  suggestedTp: number;
  suggestedSl: number;
  newsImpact: number;
  news: NewsHeadline[];
  action: DecisionAction;
  confidence: ConfidenceLevel;
  reason: string;
  closes: number[];
  volumes: number[];
  highs: number[];
  lows: number[];
};

export type PriceHistory = {
  close: number[];
  volume: number[];
  high: number[];
  low: number[];
  dates?: string[];
};

export type SignalStats = {
  trend3mPct: number;
  volatilityPct: number;
  momentumPct: number;
  volumeTrendPct: number;
  rsi14: number;
  suggestedTp: number;
  suggestedSl: number;
};

export type DecisionResult = {
  action: DecisionAction;
  confidence: ConfidenceLevel;
  reason: string;
};

export type AiCallResult<T> = {
  data: T;
  modelUsed: string;
  providerUsed: 'gemini' | 'groq';
  fallbackUsed: boolean;
  fallbackReason?: string;
};
