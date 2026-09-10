import { describe, expect, it } from 'vitest'
import { calcPortfolioRisk } from '../calculations'

// ─────────────────────────────────────────────────────────────────────────────
// calcPortfolioRisk — risk parity/covariance của danh mục.
//
// Chú ý when xây dữ liệu closes:
// - calculateDailyReturns chỉ tính biến thiên %, nên giá trị tuyệt đối của
//   closes không quan trọng — quan trọng là CHUỖI lợi suất.
// - sampleVariance dùng (n-1) → cần ≥ 2 lợi suất (≥ 3 closes) mới có phân bố.
// ─────────────────────────────────────────────────────────────────────────────

/** Closes sinh chuỗi lợi suất +x%/-x% xen kẽ — biến động đều đặn, dễ đoán. */
function alternatingCloses(start: number, pct: number, n: number): number[] {
  const closes = [start]
  for (let i = 1; i < n; i++) {
    const factor = i % 2 === 1 ? 1 + pct : 1 - pct
    closes.push(closes[i - 1] * factor)
  }
  return closes
}

describe('calcPortfolioRisk — đầu vào rỗng / không hợp lệ', () => {
  it('danh mục rỗng → kết quả bằng 0 toàn bộ', () => {
    const r = calcPortfolioRisk([])
    expect(r).toEqual({
      annualVolatility: 0,
      diversificationScore: 0,
      concentration: 0,
      volatilityPct: 0,
      weightedAvgVolatility: 0,
      diversificationBenefit: 0,
      topWeightSymbol: '',
      topWeightPct: 0,
      effectiveHoldings: 0,
      basis: 0,
    })
  })

  it('lọc bỏ mã weight <= 0, thiếu symbol, hoặc closes <= 2 điểm', () => {
    const r = calcPortfolioRisk([
      { symbol: 'OK',  weight: 1, closes: alternatingCloses(100, 0.01, 10) },
      { symbol: 'ZEROW', weight: 0, closes: alternatingCloses(100, 0.01, 10) },
      { symbol: 'NEGW',  weight: -1, closes: alternatingCloses(100, 0.01, 10) },
      { symbol: '',      weight: 1, closes: alternatingCloses(100, 0.01, 10) },
      { symbol: 'SHORT', weight: 1, closes: [100, 101] }, // chỉ 2 điểm → 1 lợi suất → bị loại
    ])
    // Chỉ còn 1 mã hợp lệ → tập trung hoàn toàn
    expect(r.concentration).toBe(1)
    expect(r.diversificationScore).toBe(0)
    expect(r.topWeightSymbol).toBe('OK')
    expect(r.basis).toBe(0) // không truyền value → basis 0
  })

  it('closes chứa giá trị không hợp lệ (0, NaN, âm) bị lọc trước khi tính', () => {
    const good = alternatingCloses(100, 0.02, 8)
    const noisy = [0, NaN, -5, ...good] // rác ở đầu, phần đuôi vẫn là chuỗi hợp lệ
    const r = calcPortfolioRisk([{ symbol: 'HPG', weight: 1, closes: noisy }])
    expect(r.concentration).toBe(1)
    expect(r.annualVolatility).toBeGreaterThan(0)
  })

  it('symbol được chuẩn hoá in hoa + trim', () => {
    const r = calcPortfolioRisk([{ symbol: '  hpg ', weight: 1, closes: alternatingCloses(100, 0.02, 8) }])
    expect(r.topWeightSymbol).toBe('HPG')
  })

  it('closes không phải mảng (null/undefined) → mã bị loại, không ném lỗi', () => {
    const r = calcPortfolioRisk([
      { symbol: 'BAD', weight: 1, closes: null as unknown as number[] },
      { symbol: 'OK', weight: 1, closes: alternatingCloses(100, 0.02, 8) },
    ])
    expect(r.topWeightSymbol).toBe('OK')
    expect(r.concentration).toBe(1)
  })
})

describe('calcPortfolioRisk — tập trung & phân tán', () => {
  it('1 mã duy nhất → concentration = 1, không có lợi thế đa dạng hoá', () => {
    const r = calcPortfolioRisk([
      { symbol: 'VCB', weight: 2, closes: alternatingCloses(100, 0.02, 10) },
    ])
    expect(r.concentration).toBeCloseTo(1, 10)
    expect(r.diversificationScore).toBe(0)
    expect(r.topWeightPct).toBeCloseTo(100, 6)
    expect(r.effectiveHoldings).toBe(1)
    // Benefit: chỉ 1 mã → weightedAvg = portfolioVol → benefit = 0
    expect(r.diversificationBenefit).toBe(0)
  })

  it('weight không chuẩn hoá vẫn được tự chuẩn hoá (2 mã 1:1 → 50/50)', () => {
    const closes = alternatingCloses(100, 0.02, 10)
    const r = calcPortfolioRisk([
      { symbol: 'A', weight: 3, closes },
      { symbol: 'B', weight: 7, closes },
    ])
    expect(r.topWeightSymbol).toBe('B')
    expect(r.topWeightPct).toBeCloseTo(70, 6)
    expect(r.concentration).toBeCloseTo(0.09 + 0.49, 10) // 0.58
    expect(r.effectiveHoldings).toBe(2)
  })

  it('2 mã biến động GIỐNG HỆT nhau (tương quan hoàn hảo) → không có lợi thế đa dạng hoá', () => {
    const a = alternatingCloses(100, 0.03, 12)
    const b = alternatingCloses(200, 0.03, 12) // cùng chuỗi lợi suất %
    const r = calcPortfolioRisk([
      { symbol: 'A', weight: 1, closes: a },
      { symbol: 'B', weight: 1, closes: b },
    ])
    expect(r.diversificationBenefit).toBeCloseTo(0, 6)
    // Vol danh mục (50/50 của 2 mã y hệt) = vol từng mã
    expect(r.annualVolatility).toBeGreaterThan(0)
    expect(r.weightedAvgVolatility).toBeCloseTo(r.annualVolatility * 100, 6)
  })

  it('2 mã biến động NGƯỢC nhau (tương quan âm) → có lợi thế đa dạng hoá rõ rệt', () => {
    const a = alternatingCloses(100, 0.03, 12)
    // B đi ngược pha A: khi A +3% thì B -3%
    const b = alternatingCloses(100, 0.03, 12).map((c, i) => (i % 2 === 1 ? c * (1 - 0.06) : c))
    const r = calcPortfolioRisk([
      { symbol: 'A', weight: 1, closes: a },
      { symbol: 'B', weight: 1, closes: b },
    ])
    expect(r.diversificationBenefit).toBeGreaterThan(30) // giảm volatility rõ rệt
    expect(r.annualVolatility).toBeLessThan(r.weightedAvgVolatility)
  })

  it('annualVolatility = volatilityPct / 100', () => {
    const r = calcPortfolioRisk([
      { symbol: 'A', weight: 1, closes: alternatingCloses(100, 0.02, 10) },
      { symbol: 'B', weight: 2, closes: alternatingCloses(50, 0.04, 10) },
    ])
    expect(r.volatilityPct).toBeCloseTo(r.annualVolatility * 100, 10)
  })

  it('closes ngắn hơn 3 điểm sau align (minLen < 2) → volatility 0 nhưng vẫn tính tập trung', () => {
    // A có 10 điểm, B chỉ có 3 điểm (2 lợi suất) → minLen = 2 → vẫn tính được
    const r = calcPortfolioRisk([
      { symbol: 'A', weight: 1, closes: alternatingCloses(100, 0.02, 10) },
      { symbol: 'B', weight: 1, closes: [100, 103, 100] },
    ])
    expect(r.annualVolatility).toBeGreaterThan(0)
    expect(r.concentration).toBeCloseTo(0.5, 10)
  })

  it('basis = tổng value các mã hợp lệ', () => {
    const closes = alternatingCloses(100, 0.02, 8)
    const r = calcPortfolioRisk([
      { symbol: 'A', weight: 1, closes, value: 12_000_000 },
      { symbol: 'B', weight: 1, closes, value: 8_000_000 },
      { symbol: 'SKIP', weight: 0, closes, value: 999 }, // bị loại
    ])
    expect(r.basis).toBe(20_000_000)
  })
})
