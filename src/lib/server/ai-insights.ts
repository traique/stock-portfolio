// BARREL: giữ nguyên đường import `@/lib/server/ai-insights` cho mọi nơi đang dùng.
// Toàn bộ logic đã tách sang các module con để dễ bảo trì.

export type {
  NewsHeadline,
  DecisionAction,
  ConfidenceLevel,
  TechnicalSignal,
  PriceHistory,
  SignalStats,
  DecisionResult,
  AiCallResult,
} from './ai/types';

export { fetchAllNews, calcNewsImpact, sentimentScore } from './ai/news';
export { fetchHistory } from './ai/price-history';
export { buildTechnicalSignals, _test } from './ai/technical';
export { callAiWithFallback, callOpenRouterJson } from './ai/providers';
