import { describe, it, expect } from 'vitest';
import { _test } from '../server/ai-insights';

const { sentimentScore, calcRSI, calcMomentumSlope, decideAction } = _test;

// ─────────────────────────────────────────────────────────────────────────────
// sentimentScore
// ─────────────────────────────────────────────────────────────────────────────

describe('sentimentScore', () => {
  it('trả về score dương khi tiêu đề chứa từ tích cực', () => {
    expect(sentimentScore('cổ phiếu FPT tăng mạnh')).toBeGreaterThan(0);
  });

  it('trả về score âm khi tiêu đề chứa từ tiêu cực', () => {
    expect(sentimentScore('HPG giảm sâu, nhà đầu tư lo lắng')).toBeLessThan(0);
  });

  it('xử lý phủ định đúng — "không tăng" → score không dương', () => {
    const withNegation    = sentimentScore('cổ phiếu không tăng trong quý này');
    const withoutNegation = sentimentScore('cổ phiếu tăng trong quý này');
    expect(withNegation).toBeLessThan(withoutNegation);
  });

  it('xử lý phủ định từ tiêu cực — "không giảm" → score cao hơn "giảm"', () => {
    const withNegation    = sentimentScore('giá không giảm trong phiên hôm nay');
    const withoutNegation = sentimentScore('giá giảm trong phiên hôm nay');
    expect(withNegation).toBeGreaterThan(withoutNegation);
  });

  it('trả về 0 với tiêu đề trung tính', () => {
    expect(sentimentScore('họp đại hội cổ đông thường niên 2025')).toBe(0);
  });

  it('clamp kết quả trong [-1, 1]', () => {
    // Nhiều từ tích cực
    const high = sentimentScore('tăng lãi tích cực kỷ lục phục hồi tăng trưởng bứt phá');
    expect(high).toBeLessThanOrEqual(1);
    expect(high).toBeGreaterThanOrEqual(-1);

    // Nhiều từ tiêu cực
    const low = sentimentScore('giảm lỗ rủi ro sụt bán tháo tụt hạ yếu phạt vi phạm');
    expect(low).toBeGreaterThanOrEqual(-1);
    expect(low).toBeLessThanOrEqual(1);
  });

  it('không phân biệt hoa thường', () => {
    expect(sentimentScore('FPT TĂNG MẠNH')).toEqual(sentimentScore('fpt tăng mạnh'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcRSI
// ─────────────────────────────────────────────────────────────────────────────

describe('calcRSI', () => {
  it('trả về 50 khi không đủ dữ liệu (< period + 1)', () => {
    expect(calcRSI([100, 101, 102], 14)).toBe(50);
    expect(calcRSI([])).toBe(50);
  });

  it('trả về 100 khi tất cả phiên đều tăng (không có avgLoss)', () => {
    const allUp = Array.from({ length: 20 }, (_, i) => 100 + i);
    expect(calcRSI(allUp)).toBe(100);
  });

  it('trả về giá trị gần 0 khi tất cả phiên đều giảm', () => {
    const allDown = Array.from({ length: 20 }, (_, i) => 100 - i);
    expect(calcRSI(allDown)).toBeLessThan(5);
  });

  it('RSI quanh 50 với chuỗi giá ngẫu nhiên cân bằng', () => {
    // Xen kẽ tăng/giảm đều nhau → RSI ≈ 50
    const balanced = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    const rsi = calcRSI(balanced);
    expect(rsi).toBeGreaterThan(40);
    expect(rsi).toBeLessThan(60);
  });

  it('kết quả trong [0, 100]', () => {
    const prices = [50, 52, 48, 53, 55, 51, 49, 54, 56, 58, 55, 53, 57, 60, 58, 56, 59, 62];
    const rsi = calcRSI(prices);
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  it('RSI > 70 khi giá tăng liên tục sau giai đoạn ổn định', () => {
    const stable = Array(14).fill(100);
    const surge  = Array.from({ length: 10 }, (_, i) => 100 + (i + 1) * 3);
    const rsi = calcRSI([...stable, ...surge]);
    expect(rsi).toBeGreaterThan(70);
  });

  it('RSI < 30 khi giá giảm liên tục sau giai đoạn ổn định', () => {
    const stable = Array(14).fill(100);
    const drop   = Array.from({ length: 10 }, (_, i) => 100 - (i + 1) * 3);
    const rsi = calcRSI([...stable, ...drop]);
    expect(rsi).toBeLessThan(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcMomentumSlope
// ─────────────────────────────────────────────────────────────────────────────

describe('calcMomentumSlope', () => {
  it('trả về 0 khi không đủ dữ liệu', () => {
    expect(calcMomentumSlope([], 10)).toBe(0);
    expect(calcMomentumSlope([100], 10)).toBe(0);
  });

  it('trả về giá trị dương khi giá tăng đều', () => {
    const rising = Array.from({ length: 15 }, (_, i) => 100 + i * 2);
    expect(calcMomentumSlope(rising)).toBeGreaterThan(0);
  });

  it('trả về giá trị âm khi giá giảm đều', () => {
    const falling = Array.from({ length: 15 }, (_, i) => 100 - i * 2);
    expect(calcMomentumSlope(falling)).toBeLessThan(0);
  });

  it('trả về ~0 với giá phẳng', () => {
    const flat = Array(15).fill(100);
    expect(Math.abs(calcMomentumSlope(flat))).toBeLessThan(0.001);
  });

  it('chỉ dùng `period` nến cuối cùng', () => {
    // Flat trước, sau đó tăng mạnh
    const prices = [...Array(50).fill(100), ...Array.from({ length: 10 }, (_, i) => 100 + i * 5)];
    const slope  = calcMomentumSlope(prices, 10);
    expect(slope).toBeGreaterThan(0);
  });

  it('độ dốc lớn hơn khi giá tăng nhanh hơn', () => {
    const slow = Array.from({ length: 10 }, (_, i) => 100 + i);
    const fast = Array.from({ length: 10 }, (_, i) => 100 + i * 3);
    expect(calcMomentumSlope(fast)).toBeGreaterThan(calcMomentumSlope(slow));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// decideAction
// ─────────────────────────────────────────────────────────────────────────────

describe('decideAction', () => {
  // Helpers để gọi hàm với tham số rõ ràng hơn
  const decide = (overrides: {
    trend3mPct?:      number;
    momentumPct?:     number;
    volumeTrendPct?:  number;
    newsImpact?:      number;
    volatilityPct?:   number;
    rsi14?:           number;
    relativeStrength?: number;
  }) => decideAction(
    overrides.trend3mPct      ?? 0,
    overrides.momentumPct     ?? 0,
    overrides.volumeTrendPct  ?? 0,
    overrides.newsImpact      ?? 0,
    overrides.volatilityPct   ?? 5,
    overrides.rsi14           ?? 50,
    overrides.relativeStrength ?? 0,
  );

  it('trả về BUY HIGH khi tất cả tín hiệu tích cực', () => {
    const result = decide({
      trend3mPct:       10,   // +2
      momentumPct:      0.5,  // +2
      volumeTrendPct:   15,   // +1
      newsImpact:       1,    // +1
      volatilityPct:    5,    // không bị trừ
      rsi14:            25,   // +1 (oversold)
      relativeStrength: 5,    // +1 (borderline, >5 triggers +1)
    });
    expect(result.action).toBe('BUY');
    expect(result.confidence).toBe('HIGH');
  });

  it('trả về SELL HIGH khi tất cả tín hiệu tiêu cực', () => {
    const result = decide({
      trend3mPct:       -10,  // -2
      momentumPct:      -0.5, // -2
      volumeTrendPct:   0,
      newsImpact:       -1,   // -1
      volatilityPct:    20,   // -1
      rsi14:            75,   // -1 (overbought)
      relativeStrength: -10,  // -1
    });
    expect(result.action).toBe('SELL');
    expect(result.confidence).toBe('HIGH');
  });

  it('trả về HOLD khi tín hiệu trung tính (score = 0)', () => {
    const result = decide({ trend3mPct: 0, momentumPct: 0, newsImpact: 0, rsi14: 50 });
    expect(result.action).toBe('HOLD');
  });

  it('trả về WATCH khi tín hiệu nhẹ tiêu cực (score = -1)', () => {
    // volatility -1, tất cả còn lại = 0 → score = -1 → WATCH
    const result = decide({ trend3mPct: 0, momentumPct: 0, volatilityPct: 20 });
    expect(result.action).toBe('WATCH');
  });

  it('BUY LOW khi trend tích cực nhưng chưa đủ điểm HIGH', () => {
    // trend +2, không có tín hiệu nào khác → score = 2 = SCORE_BUY_MED → BUY MEDIUM hoặc LOW
    const result = decide({ trend3mPct: 6 });
    expect(result.action).toBe('BUY');
    expect(['LOW', 'MEDIUM']).toContain(result.confidence);
  });

  it('RSI oversold đẩy action lên BUY khi tín hiệu tương đối tích cực', () => {
    // score trước: trend +2, rsi oversold +1 = 3 → BUY MED/HIGH
    const result = decide({ trend3mPct: 6, rsi14: 25 });
    expect(result.action).toBe('BUY');
  });

  it('RSI overbought ngăn BUY HIGH — confidence giảm', () => {
    // trend +2, momentum +2, volume +1, rsi overbought -1 = 4 → vẫn BUY HIGH
    // Nhưng nếu overbought và score thấp hơn thì down
    const withOverbought    = decide({ trend3mPct: 6, rsi14: 75 });
    const withoutOverbought = decide({ trend3mPct: 6, rsi14: 50 });
    // Cả 2 vẫn BUY nhưng overbought version confidence thấp hơn hoặc bằng
    const confidenceOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    expect(confidenceOrder[withOverbought.confidence]).toBeLessThanOrEqual(
      confidenceOrder[withoutOverbought.confidence],
    );
  });

  it('volatility cao kéo confidence xuống hoặc action đổi', () => {
    // trend +2, momentum +2 = 4 → BUY HIGH; thêm volatility -1 = 3 → BUY MED
    const highVol = decide({ trend3mPct: 6, momentumPct: 0.5, volatilityPct: 20 });
    const lowVol  = decide({ trend3mPct: 6, momentumPct: 0.5, volatilityPct: 5  });
    const confidenceOrder = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    expect(confidenceOrder[highVol.confidence]).toBeLessThanOrEqual(
      confidenceOrder[lowVol.confidence],
    );
  });

  it('relativeStrength > 5 cho thêm tín hiệu tích cực', () => {
    const withOutperform  = decide({ trend3mPct: 6, relativeStrength:  6 });
    const withUnderperform = decide({ trend3mPct: 6, relativeStrength: -6 });
    // outperform nên có action ít nhất bằng hoặc tốt hơn underperform
    const actionOrder = { SELL: 0, WATCH: 1, HOLD: 2, BUY: 3 };
    expect(actionOrder[withOutperform.action]).toBeGreaterThanOrEqual(
      actionOrder[withUnderperform.action],
    );
  });

  it('trả về object có đầy đủ fields action, confidence, reason', () => {
    const result = decide({});
    expect(result).toHaveProperty('action');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reason');
    expect(['BUY', 'HOLD', 'SELL', 'WATCH']).toContain(result.action);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.confidence);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
