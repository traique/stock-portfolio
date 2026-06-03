// src/lib/server/technical-indicators.ts
//
// Phase 1 — Technical indicators nâng cao
// Tất cả hàm tính toán thuần TypeScript từ close[] / volume[]
// Không phụ thuộc API bên ngoài.
//
// Bổ sung so với ai-insights.ts cũ:
//   • SMA (n)
//   • EMA (n)
//   • MACD (12, 26, 9) + histogram
//   • Bollinger Bands (20, 2σ) + BB Width + %B
//   • Multi-timeframe trend (1W, 1M, 3M)
//   • Golden/Death cross detector
//   • ADX (14) — Average Directional Index, đo độ mạnh xu hướng

// ─── Types ──────────────────────────────────────────────────────────────────

export type MACDResult = {
  macdLine:  number;   // EMA12 - EMA26
  signalLine: number;  // EMA9 của macdLine
  histogram:  number;  // macdLine - signalLine
  crossover:  'bullish' | 'bearish' | 'none'; // histogram vừa cắt 0
};

export type BollingerResult = {
  upper:   number;
  middle:  number; // SMA20
  lower:   number;
  width:   number; // (upper - lower) / middle * 100  — BB Width %
  pctB:    number; // (price - lower) / (upper - lower) * 100 — vị trí giá trong BB
  squeeze: boolean; // width < 5% → sắp breakout
};

export type MultiTimeframeTrend = {
  trend1wPct:  number; // 5 phiên gần nhất
  trend1mPct:  number; // 22 phiên
  trend3mPct:  number; // 66 phiên
  alignment:   'bullish' | 'bearish' | 'mixed'; // cả 3 khung cùng chiều?
};

export type CrossSignal = {
  goldenCross: boolean; // SMA20 vừa cắt lên trên SMA50 (trong 3 phiên)
  deathCross:  boolean; // SMA20 vừa cắt xuống dưới SMA50 (trong 3 phiên)
  aboveSMA20:  boolean; // giá hiện tại > SMA20
  aboveSMA50:  boolean; // giá hiện tại > SMA50
};

export type ADXResult = {
  adx:    number; // 0-100: >25 = xu hướng mạnh, <20 = sideway
  diPlus:  number; // +DI
  diMinus: number; // -DI
  trending: boolean; // adx > 25
};

export type EnhancedIndicators = {
  macd:           MACDResult;
  bollinger:      BollingerResult;
  multiTimeframe: MultiTimeframeTrend;
  crossSignal:    CrossSignal;
  adx:            ADXResult;
  sma20:          number;
  sma50:          number;
  ema9:           number;
};

// ─── Core Math ───────────────────────────────────────────────────────────────

/** Simple Moving Average */
export function calcSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes.at(-1) ?? 0;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Exponential Moving Average — Wilder's smoothing (α = 2/(n+1)) */
export function calcEMA(closes: number[], period: number): number {
  if (closes.length === 0) return 0;
  if (closes.length < period) return calcSMA(closes, closes.length);

  const alpha = 2 / (period + 1);
  // Seed = SMA của `period` phiên đầu
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * alpha + ema * (1 - alpha);
  }
  return ema;
}

/** EMA series — trả về toàn bộ mảng (dùng cho MACD signal) */
function calcEMASeries(closes: number[], period: number): number[] {
  if (closes.length === 0) return [];
  const alpha = 2 / (period + 1);
  const result: number[] = new Array(closes.length).fill(0);

  // Seed từ phiên thứ `period`
  if (closes.length < period) {
    const seed = closes.reduce((a, b) => a + b, 0) / closes.length;
    result.fill(seed);
    return result;
  }

  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period; i++) result[i] = ema;

  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * alpha + ema * (1 - alpha);
    result[i] = ema;
  }
  return result;
}

// ─── MACD ────────────────────────────────────────────────────────────────────

/**
 * MACD(12, 26, 9)
 * Cần ít nhất 35 phiên để kết quả ổn định.
 * Trả về neutral nếu insufficient data.
 */
export function calcMACD(closes: number[]): MACDResult {
  const neutral: MACDResult = {
    macdLine: 0, signalLine: 0, histogram: 0, crossover: 'none',
  };

  if (closes.length < 26) return neutral;

  const ema12Series = calcEMASeries(closes, 12);
  const ema26Series = calcEMASeries(closes, 26);

  // MACD line series
  const macdSeries = ema12Series.map((v, i) => v - ema26Series[i]);

  // Signal = EMA9 của MACD series (tính từ vị trí 26 trở đi)
  const validMacd = macdSeries.slice(26);
  const signalSeries = calcEMASeries(validMacd, 9);

  const macdLine   = macdSeries.at(-1) ?? 0;
  const signalLine = signalSeries.at(-1) ?? 0;
  const histogram  = macdLine - signalLine;

  // Crossover detection: histogram đổi dấu trong 2 phiên gần nhất
  let crossover: MACDResult['crossover'] = 'none';
  if (signalSeries.length >= 2) {
    const prevHist = macdSeries.at(-2)! - signalSeries.at(-2)!;
    if (prevHist < 0 && histogram > 0) crossover = 'bullish';
    if (prevHist > 0 && histogram < 0) crossover = 'bearish';
  }

  return {
    macdLine:   Number(macdLine.toFixed(2)),
    signalLine: Number(signalLine.toFixed(2)),
    histogram:  Number(histogram.toFixed(2)),
    crossover,
  };
}

// ─── Bollinger Bands ─────────────────────────────────────────────────────────

/**
 * Bollinger Bands(20, 2σ)
 * Width < 5% → squeeze → sắp breakout
 */
export function calcBollinger(closes: number[], price: number): BollingerResult {
  const period = 20;
  const defaultResult: BollingerResult = {
    upper: price * 1.05, middle: price, lower: price * 0.95,
    width: 5, pctB: 50, squeeze: false,
  };

  if (closes.length < period) return defaultResult;

  const slice  = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + 2 * stdDev;
  const lower = middle - 2 * stdDev;
  const width = middle > 0 ? ((upper - lower) / middle) * 100 : 5;
  const pctB  = upper !== lower
    ? ((price - lower) / (upper - lower)) * 100
    : 50;

  return {
    upper:   Number(upper.toFixed(0)),
    middle:  Number(middle.toFixed(0)),
    lower:   Number(lower.toFixed(0)),
    width:   Number(width.toFixed(2)),
    pctB:    Number(Math.min(100, Math.max(0, pctB)).toFixed(1)),
    squeeze: width < 5,
  };
}

// ─── Multi-Timeframe Trend ────────────────────────────────────────────────────

/**
 * Tính trend theo 3 khung thời gian từ cùng 1 mảng close[].
 * 1W ≈ 5 phiên, 1M ≈ 22 phiên, 3M ≈ 66 phiên.
 */
export function calcMultiTimeframe(closes: number[]): MultiTimeframeTrend {
  const pct = (n: number): number => {
    if (closes.length < n + 1) return 0;
    const past = closes[closes.length - 1 - n];
    const curr = closes.at(-1)!;
    return past > 0 ? ((curr - past) / past) * 100 : 0;
  };

  const trend1wPct = pct(5);
  const trend1mPct = pct(22);
  const trend3mPct = pct(Math.min(closes.length - 1, 65));

  const positives = [trend1wPct, trend1mPct, trend3mPct].filter(v => v > 0).length;
  const negatives = [trend1wPct, trend1mPct, trend3mPct].filter(v => v < 0).length;

  let alignment: MultiTimeframeTrend['alignment'] = 'mixed';
  if (positives === 3) alignment = 'bullish';
  if (negatives === 3) alignment = 'bearish';

  return {
    trend1wPct:  Number(trend1wPct.toFixed(2)),
    trend1mPct:  Number(trend1mPct.toFixed(2)),
    trend3mPct:  Number(trend3mPct.toFixed(2)),
    alignment,
  };
}

// ─── SMA Cross ───────────────────────────────────────────────────────────────

/**
 * Golden/Death cross và vị trí giá vs SMA20/50.
 * Cross phát hiện trong cửa sổ 3 phiên để tránh bỏ sót.
 */
export function calcCrossSignal(closes: number[]): CrossSignal {
  const price = closes.at(-1) ?? 0;

  if (closes.length < 52) {
    return { goldenCross: false, deathCross: false, aboveSMA20: false, aboveSMA50: false };
  }

  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);

  // Check cross trong 3 phiên gần nhất
  const window = 3;
  let goldenCross = false;
  let deathCross  = false;

  for (let i = closes.length - window; i < closes.length - 1; i++) {
    const s20prev = calcSMA(closes.slice(0, i + 1), 20);
    const s50prev = calcSMA(closes.slice(0, i + 1), 50);
    const s20curr = calcSMA(closes.slice(0, i + 2), 20);
    const s50curr = calcSMA(closes.slice(0, i + 2), 50);

    if (s20prev <= s50prev && s20curr > s50curr) goldenCross = true;
    if (s20prev >= s50prev && s20curr < s50curr) deathCross  = true;
  }

  return {
    goldenCross,
    deathCross,
    aboveSMA20: price > sma20,
    aboveSMA50: price > sma50,
  };
}

// ─── ADX ─────────────────────────────────────────────────────────────────────

/**
 * ADX(14) — Average Directional Index
 * Đo độ mạnh xu hướng (không phân biệt hướng).
 * Cần high[], low[], close[] → fallback tính từ close[] nếu không có OHLC.
 * Khi chỉ có close[]: dùng close làm proxy cho high=close, low=close*0.995
 */
export function calcADX(closes: number[], period = 14): ADXResult {
  const neutral: ADXResult = { adx: 20, diPlus: 15, diMinus: 15, trending: false };
  if (closes.length < period * 2) return neutral;

  // Proxy OHLC từ close (đơn giản hóa vì không có OHLC từ Yahoo v8 interval=1d)
  const highs  = closes.map((c, i) => i === 0 ? c : Math.max(c, closes[i - 1]));
  const lows   = closes.map((c, i) => i === 0 ? c : Math.min(c, closes[i - 1]));

  const trueRanges: number[] = [];
  const dmPlus:  number[] = [];
  const dmMinus: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const high   = highs[i];
    const low    = lows[i];
    const prevClose = closes[i - 1];
    const prevHigh  = highs[i - 1];
    const prevLow   = lows[i - 1];

    // True Range
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));

    // Directional Movement
    const upMove   = high - prevHigh;
    const downMove = prevLow - low;
    dmPlus.push(upMove  > downMove && upMove  > 0 ? upMove  : 0);
    dmMinus.push(downMove > upMove  && downMove > 0 ? downMove : 0);
  }

  // Wilder's smoothing
  const smooth = (arr: number[]): number[] => {
    const res: number[] = new Array(arr.length).fill(0);
    res[period - 1] = arr.slice(0, period).reduce((a, b) => a + b, 0);
    for (let i = period; i < arr.length; i++) {
      res[i] = res[i - 1] - res[i - 1] / period + arr[i];
    }
    return res;
  };

  const atr14    = smooth(trueRanges);
  const sdmPlus  = smooth(dmPlus);
  const sdmMinus = smooth(dmMinus);

  const diPlusSeries  = sdmPlus.map( (v, i) => atr14[i] > 0 ? (v / atr14[i]) * 100 : 0);
  const diMinusSeries = sdmMinus.map((v, i) => atr14[i] > 0 ? (v / atr14[i]) * 100 : 0);
  const dxSeries = diPlusSeries.map((v, i) => {
    const sum = v + diMinusSeries[i];
    return sum > 0 ? (Math.abs(v - diMinusSeries[i]) / sum) * 100 : 0;
  });

  // ADX = smoothed DX
  const validDx = dxSeries.slice(period - 1);
  const adx = validDx.length >= period
    ? validDx.slice(-period).reduce((a, b) => a + b, 0) / period
    : 20;

  const diPlus  = diPlusSeries.at(-1)  ?? 15;
  const diMinus = diMinusSeries.at(-1) ?? 15;

  return {
    adx:      Number(adx.toFixed(1)),
    diPlus:   Number(diPlus.toFixed(1)),
    diMinus:  Number(diMinus.toFixed(1)),
    trending: adx > 25,
  };
}

// ─── Master builder ───────────────────────────────────────────────────────────

/**
 * Tính toàn bộ indicators từ close[].
 * Gọi 1 lần duy nhất per symbol để tránh lặp vòng lặp.
 */
export function buildEnhancedIndicators(
  closes: number[],
  price: number,
): EnhancedIndicators {
  return {
    macd:           calcMACD(closes),
    bollinger:      calcBollinger(closes, price),
    multiTimeframe: calcMultiTimeframe(closes),
    crossSignal:    calcCrossSignal(closes),
    adx:            calcADX(closes),
    sma20:          Number(calcSMA(closes, 20).toFixed(0)),
    sma50:          Number(calcSMA(closes, 50).toFixed(0)),
    ema9:           Number(calcEMA(closes, 9).toFixed(0)),
  };
}

// ─── Scoring contribution ─────────────────────────────────────────────────────

/**
 * Chuyển enhanced indicators → điểm bổ sung cho decideAction().
 * Range: -4 đến +5
 *
 * Breakdown:
 *   MACD crossover      ±2
 *   BB position         ±1
 *   Multi-timeframe     ±1
 *   Cross signal (SMA)  ±1
 *   ADX trending bonus  +1 (khuếch đại tín hiệu chiều đang mạnh)
 */
export function scoreEnhancedIndicators(ind: EnhancedIndicators): number {
  let score = 0;

  // MACD — crossover mạnh nhất
  if (ind.macd.crossover === 'bullish')  score += 2;
  if (ind.macd.crossover === 'bearish')  score -= 2;
  // Histogram dương/âm bền vững (không crossover nhưng vẫn rõ chiều)
  else if (ind.macd.histogram > 0)  score += 1;
  else if (ind.macd.histogram < 0)  score -= 1;

  // Bollinger — %B
  if (ind.bollinger.pctB < 10)  score += 1;  // giá gần lower band → oversold
  if (ind.bollinger.pctB > 90)  score -= 1;  // giá gần upper band → overbought
  // Squeeze: thị trường tích lũy, cộng nhẹ nếu MACD đang tăng
  if (ind.bollinger.squeeze && ind.macd.histogram > 0) score += 1;

  // Multi-timeframe alignment
  if (ind.multiTimeframe.alignment === 'bullish') score += 1;
  if (ind.multiTimeframe.alignment === 'bearish') score -= 1;

  // Golden/Death cross
  if (ind.crossSignal.goldenCross) score += 1;
  if (ind.crossSignal.deathCross)  score -= 1;

  // ADX — nếu xu hướng mạnh (>25) thì khuếch đại chiều hiện tại 1 điểm
  if (ind.adx.trending) {
    if (ind.adx.diPlus > ind.adx.diMinus) score += 1;
    else                                   score -= 1;
  }

  return score;
}

/**
 * Tạo phần mô tả kỹ thuật để đưa vào AI prompt.
 * Viết tắt nhưng đủ thông tin để AI hiểu bức tranh tổng thể.
 */
export function buildIndicatorSummary(ind: EnhancedIndicators, symbol: string): string {
  const tf   = ind.multiTimeframe;
  const macd = ind.macd;
  const bb   = ind.bollinger;
  const cross = ind.crossSignal;
  const adx  = ind.adx;

  const parts: string[] = [];

  // Multi-timeframe
  parts.push(
    `Multi-TF [${symbol}]: 1W ${tf.trend1wPct > 0 ? '+' : ''}${tf.trend1wPct}% | ` +
    `1M ${tf.trend1mPct > 0 ? '+' : ''}${tf.trend1mPct}% | ` +
    `3M ${tf.trend3mPct > 0 ? '+' : ''}${tf.trend3mPct}% → ${tf.alignment.toUpperCase()}`
  );

  // MACD
  const crossNote = macd.crossover !== 'none' ? ` ⚡ ${macd.crossover.toUpperCase()} CROSSOVER` : '';
  parts.push(
    `MACD: line ${macd.macdLine > 0 ? '+' : ''}${macd.macdLine} | ` +
    `hist ${macd.histogram > 0 ? '+' : ''}${macd.histogram}${crossNote}`
  );

  // Bollinger
  const bbNote = bb.squeeze ? ' 🔥 SQUEEZE (sắp breakout)' : '';
  parts.push(`BB: %B=${bb.pctB}% | width=${bb.width}%${bbNote}`);

  // SMA cross
  const crossStr: string[] = [];
  if (cross.goldenCross)    crossStr.push('⭐ GOLDEN CROSS');
  if (cross.deathCross)     crossStr.push('💀 DEATH CROSS');
  if (cross.aboveSMA20)     crossStr.push('above SMA20');
  else                      crossStr.push('below SMA20');
  if (cross.aboveSMA50)     crossStr.push('above SMA50');
  else                      crossStr.push('below SMA50');
  parts.push(`SMA: ${crossStr.join(' | ')}`);

  // ADX
  parts.push(
    `ADX: ${adx.adx} (${adx.trending ? 'xu hướng mạnh' : 'sideway'}) | +DI ${adx.diPlus} vs -DI ${adx.diMinus}`
  );

  return parts.join('\n');
}
