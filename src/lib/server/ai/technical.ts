import { fetchMarketPrices } from '@/lib/server/market';
import { clamp, roundPrice, mapWithConcurrency } from './utils';
import { fetchHistory } from './price-history';
import { fetchAllNews, calcNewsImpact, sentimentScore } from './news';
import type { PriceHistory, SignalStats, DecisionResult, TechnicalSignal } from './types';

const DEFAULT_TP_PCT = 1.05;
const DEFAULT_SL_PCT = 0.97;
const VOLATILITY_SCALE = Math.sqrt(5);
const RISK_MIN_PCT = 3;
const RISK_MAX_PCT = 8;
const SCORE_BUY_HIGH = 4;
const SCORE_BUY_MED = 2;
const SCORE_SELL_HIGH = -4;
const RSI_PERIOD = 14;
const HISTORY_CONCURRENCY = 5;

// ── RSI (Wilder) ──
function calcRSI(closes: number[], period = RSI_PERIOD): number {
  if (closes.length < period + 1) return 50;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss += Math.abs(diff);
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

// ── Momentum (linear regression slope) ──
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

// ── Signals ──
function calcSignals(history: PriceHistory, price: number, newsImpact: number): SignalStats {
  const { close: closes, volume: volumes } = history;
  if (!closes.length || price <= 0) {
    return {
      trend3mPct: 0, volatilityPct: 2, momentumPct: 0, volumeTrendPct: 0, rsi14: 50,
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
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) returns.push((closes[i] - prev) / prev);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  const volatilityPct = Math.sqrt(Math.max(variance, 0)) * 100 * VOLATILITY_SCALE;
  const risk = clamp(volatilityPct, RISK_MIN_PCT, RISK_MAX_PCT);
  const newsBoost = clamp(newsImpact, -1, 1);
  const rsiAdj = rsi14 > 70 ? -0.3 : rsi14 < 30 ? 0.3 : 0;
  const rewardMult = trend3mPct >= 0 ? clamp(1.5 + newsBoost * 0.5 + rsiAdj, 0.8, 2.5) : 1.0;
  const suggestedTp = roundPrice(price * (1 + (risk * rewardMult) / 100));
  const suggestedSl = roundPrice(price * (1 - risk / 100));
  return { trend3mPct, volatilityPct, momentumPct, volumeTrendPct, rsi14, suggestedTp, suggestedSl };
}

// ── Decision (score-based) ──
function decideAction(
  trend3mPct: number, momentumPct: number, volumeTrendPct: number,
  newsImpact: number, volatilityPct: number, rsi14: number, relativeStrength: number,
): DecisionResult {
  let score = 0;
  if (trend3mPct > 5) score += 2; else if (trend3mPct < -5) score -= 2;
  if (momentumPct > 0.2) score += 2; else if (momentumPct < -0.2) score -= 2;
  if (volumeTrendPct > 10) score += 1;
  if (newsImpact > 0.5) score += 1; else if (newsImpact < -0.5) score -= 1;
  if (volatilityPct > 15) score -= 1;
  if (rsi14 < 30) score += 1; else if (rsi14 > 70) score -= 1;
  if (relativeStrength > 5) score += 1; else if (relativeStrength < -5) score -= 1;
  if (score >= SCORE_BUY_HIGH) {
    const rsiNote = rsi14 > 65 ? ', RSI cao — cân nhắc chờ điều chỉnh nhẹ' : '';
    return { action: 'BUY', confidence: 'HIGH', reason: `Xu hướng tăng mạnh, momentum và khối lượng xác nhận, outperform VNINDEX${rsiNote}` };
  }
  if (score >= SCORE_BUY_MED) {
    return { action: 'BUY', confidence: 'MEDIUM', reason: rsi14 < 35 ? 'Xu hướng tăng hình thành, RSI vùng oversold — cơ hội bắt đáy' : 'Xu hướng tăng đang hình thành, chờ thêm xác nhận khối lượng' };
  }
  if (score === 1 || score === 0) {
    return { action: 'HOLD', confidence: 'MEDIUM', reason: 'Tín hiệu trung tính, vị thế hiện tại ổn — theo dõi thêm' };
  }
  if (score === -1) {
    return { action: 'WATCH', confidence: 'LOW', reason: relativeStrength < -5 ? 'Tín hiệu yếu, underperform VNINDEX — chưa nên vào mới' : 'Tín hiệu yếu, chưa rõ xu hướng — chờ xác nhận' };
  }
  if (score <= SCORE_SELL_HIGH) {
    return { action: 'SELL', confidence: 'HIGH', reason: `Xu hướng giảm mạnh${rsi14 < 35 ? ', RSI oversold — nếu gồng thì đặt SL chặt' : ', momentum và dòng tiền đều xác nhận'}` };
  }
  return { action: 'SELL', confidence: 'MEDIUM', reason: rsi14 > 60 ? 'Xu hướng yếu, RSI chưa về vùng hỗ trợ — cân nhắc cắt lỗ một phần' : 'Xu hướng yếu, cân nhắc cắt lỗ hoặc chờ tín hiệu đảo chiều' };
}

// ── MAIN ──
export async function buildTechnicalSignals(symbols: string[]): Promise<TechnicalSignal[]> {
  const allSymbols = symbols.includes('VNINDEX') ? symbols : [...symbols, 'VNINDEX'];
  const payload = await fetchMarketPrices(allSymbols);
  const vnindexHistory = await fetchHistory('VNINDEX');
  const vnindexTrend = vnindexHistory.close.length >= 2
    ? ((vnindexHistory.close.at(-1)! - vnindexHistory.close[0]) / vnindexHistory.close[0]) * 100
    : 0;
  const results = await mapWithConcurrency(
    symbols,
    HISTORY_CONCURRENCY,
    async (symbol): Promise<TechnicalSignal> => {
      const price = Number(payload.prices[symbol] ?? 0);
      const [history, news] = await Promise.all([fetchHistory(symbol), fetchAllNews(symbol)]);
      const symbolTrend = history.close.length >= 2
        ? ((history.close.at(-1)! - history.close[0]) / history.close[0]) * 100
        : 0;
      const relativeStrength = symbolTrend - vnindexTrend;
      const newsImpact = calcNewsImpact(news);
      const stats = calcSignals(history, price, newsImpact);
      const decision = decideAction(
        stats.trend3mPct, stats.momentumPct, stats.volumeTrendPct,
        newsImpact, stats.volatilityPct, stats.rsi14, relativeStrength,
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

// ── Test exports (chỉ dùng cho unit test) ──
export const _test = {
  sentimentScore: (title: string) => sentimentScore(title),
  calcRSI: (closes: number[], period?: number) => calcRSI(closes, period),
  calcMomentumSlope: (closes: number[], period?: number) => calcMomentumSlope(closes, period),
  decideAction: (
    trend3mPct: number, momentumPct: number, volumeTrendPct: number,
    newsImpact: number, volatilityPct: number, rsi14: number, relativeStrength: number,
  ) => decideAction(trend3mPct, momentumPct, volumeTrendPct, newsImpact, volatilityPct, rsi14, relativeStrength),
};
