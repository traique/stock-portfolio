// src/lib/server/money-flow.ts
//
// Phase 2B — Dòng tiền (Money Flow)
//
// 3 nguồn dữ liệu, theo thứ tự ưu tiên:
//   1. SSI iBoard API (free, no key) — foreign net, prop trading
//   2. Tính từ Yahoo price+volume nếu SSI fail — proxy dòng tiền
//   3. Fallback neutral nếu cả 2 fail
//
// Lý do chọn SSI iBoard: public endpoint, không cần API key, được dùng
// rộng rãi trong cộng đồng dev VN, data update gần realtime.

import { getExchange } from './exchanges/exchange';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ForeignFlow = {
  netBuyValue5d:  number;  // Triệu VND, ngoại tệ mua ròng 5 phiên
  netBuyValue20d: number;  // Triệu VND, 20 phiên
  avgDailyNet:    number;  // Triệu VND/phiên trung bình
  signal:         'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  note:           string;
};

export type MarketBreadth = {
  advancing:      number;  // số mã tăng trong watchlist
  declining:      number;  // số mã giảm
  unchanged:      number;
  advanceRatio:   number;  // advancing / total (%)
  aboveSMA20Pct:  number;  // % mã đang trên SMA20
  breadthSignal:  'strong' | 'moderate' | 'weak' | 'bear'; // sức rộng thị trường
  note:           string;
};

export type MoneyFlowData = {
  foreign:  ForeignFlow | null;
  breadth:  MarketBreadth | null;
  source:   'ssi' | 'calculated' | 'unavailable';
  fetchedAt: string;
};

// ─── SSI iBoard API ───────────────────────────────────────────────────────────
//
// Endpoint công khai, không cần auth.
// Docs không chính thức — reverse từ iboard.ssi.com.vn

// ─── Yahoo Finance volume-based proxy ────────────────────────────────────────
//
// SSI iBoard endpoint không available trong môi trường Vercel.
// Thay thế: dùng Yahoo Finance volume + price để tính accumulation/distribution proxy.
//
// Logic: Nếu volume spike (> 1.5x MA20) khi giá tăng → accumulation
//        Nếu volume spike khi giá giảm → distribution
//        Tính "net accumulation score" 20 phiên → proxy foreign flow

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const YAHOO_UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

type YahooOHLCV = {
  closes:  number[];
  volumes: number[];
  highs:   number[];
  lows:    number[];
};

async function fetchVciEdgeOHLCV(symbol: string): Promise<YahooOHLCV | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) return null;

    const edgeUrl = `${supabaseUrl.replace(/\/\/$/, '')}/functions/v1/vci-prices`;
    const res = await fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({ mode: 'history', symbols: [symbol], days: 66 }),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hist = (data.history ?? []).find((h: { symbol: string }) => h.symbol === symbol);
    if (!hist || !hist.closes.length) return null;
    return { closes: hist.closes, volumes: hist.volumes, highs: hist.highs, lows: hist.lows };
  } catch { return null; }
}

async function fetchYahooOHLCV(symbol: string, range = '3mo'): Promise<YahooOHLCV | null> {
  // HNX/UPCOM → VCI Edge (Yahoo không có data)
  const exchange = getExchange(symbol);
  if (exchange === 'HNX' || exchange === 'UPCOM') {
    return fetchVciEdgeOHLCV(symbol);
  }

  const ticker = `${symbol}.VN`;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': YAHOO_UA, Accept: '*/*' },
        next: { revalidate: 900 },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const q    = json?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
      const closes  = (q.close  ?? []).map(Number).filter((v: number) => isFinite(v) && v > 0);
      const volumes = (q.volume ?? []).map(Number).filter((v: number) => isFinite(v) && v >= 0);
      const highs   = (q.high   ?? []).map(Number).filter((v: number) => isFinite(v) && v > 0);
      const lows    = (q.low    ?? []).map(Number).filter((v: number) => isFinite(v) && v > 0);
      if (closes.length > 10) return { closes, volumes, highs, lows };
    } catch { /* try next host */ }
  }
  return null;
}

/**
 * Volume accumulation/distribution proxy — thay thế SSI foreign flow.
 *
 * Chaikin Money Flow (CMF-20):
 *   MF_multiplier = ((close - low) - (high - close)) / (high - low)
 *   MF_volume     = MF_multiplier × volume
 *   CMF           = sum(MF_volume, 20) / sum(volume, 20)
 *
 * CMF > +0.1 → accumulation (tiền vào)
 * CMF < -0.1 → distribution (tiền ra)
 */
function calcCMF(closes: number[], highs: number[], lows: number[], volumes: number[], period = 20): number {
  const len = Math.min(closes.length, highs.length, lows.length, volumes.length, period);
  if (len < 5) return 0;

  const start = closes.length - len;
  let sumMFV = 0, sumVol = 0;

  for (let i = start; i < closes.length; i++) {
    const h = highs[i], l = lows[i], c = closes[i], v = volumes[i];
    const hl = h - l;
    if (hl > 0 && v > 0) {
      const mfm = ((c - l) - (h - c)) / hl;
      sumMFV += mfm * v;
      sumVol += v;
    }
  }

  return sumVol > 0 ? Number((sumMFV / sumVol).toFixed(3)) : 0;
}

/**
 * Volume spike detection — phát hiện ngày khối lượng bất thường.
 * Trả về số ngày volume spike tăng giá vs spike giảm giá trong 10 phiên gần nhất.
 */
function detectVolumeSpikes(closes: number[], volumes: number[]): { bullish: number; bearish: number } {
  if (closes.length < 21 || volumes.length < 21) return { bullish: 0, bearish: 0 };

  const ma20vol = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  let bullish = 0, bearish = 0;

  const lookback = Math.min(10, closes.length - 1);
  for (let i = closes.length - lookback; i < closes.length; i++) {
    if (volumes[i] > ma20vol * 1.5) {
      if (closes[i] >= closes[i - 1]) bullish++;
      else                             bearish++;
    }
  }
  return { bullish, bearish };
}

// SSI fetch giữ lại nhưng wrapper → dùng Yahoo fallback nếu fail
async function fetchSSIForeignHistory(_symbol: string, _limit = 20): Promise<number[]> {
  // SSI endpoint không available trong Vercel production
  // → trả về empty để trigger Yahoo fallback
  return [];
}

// ─── Foreign Flow Analysis ────────────────────────────────────────────────────

export async function analyzeForeignFlow(symbol: string): Promise<ForeignFlow | null> {
  // Thử SSI trước (nếu có)
  const ssiHistory = await fetchSSIForeignHistory(symbol, 20);
  if (ssiHistory.length >= 3) {
    return buildForeignFlowResult(ssiHistory.slice(0, 5), ssiHistory.slice(0, 20));
  }

  // Fallback: Yahoo Finance CMF + volume spike proxy
  const ohlcv = await fetchYahooOHLCV(symbol);
  if (!ohlcv) return null;

  const { closes, highs, lows, volumes } = ohlcv;
  const cmf    = calcCMF(closes, highs, lows, volumes, 20);
  const spikes = detectVolumeSpikes(closes, volumes);

  // Convert CMF (-1 đến +1) sang proxy "net buy value" (triệu VND giả định)
  // Scale: CMF 0.1 ≈ 50 tỷ VND net buy (rough estimate cho mid-cap VN)
  const scaleFactor = 500_000; // triệu VND
  const proxyNetVal = Math.round(cmf * scaleFactor);
  const proxyDaily  = [proxyNetVal / 5, proxyNetVal / 5, proxyNetVal / 5, proxyNetVal / 5, proxyNetVal / 5];

  // Override signal dựa trên CMF thực tế thay vì formula tiền
  let signal: ForeignFlow['signal'];
  let note: string;

  if (cmf > 0.15) {
    signal = 'strong_buy';
    note   = `Tích lũy mạnh — CMF ${cmf} (${spikes.bullish} phiên vol spike tăng giá)`;
  } else if (cmf > 0.05) {
    signal = 'buy';
    note   = `Tích lũy nhẹ — CMF ${cmf} (volume vào khi giá tăng)`;
  } else if (cmf > -0.05) {
    signal = 'neutral';
    note   = `Trung tính — CMF ${cmf} (volume cân bằng)`;
  } else if (cmf > -0.15) {
    signal = 'sell';
    note   = `Phân phối nhẹ — CMF ${cmf} (${spikes.bearish} phiên vol spike giảm giá)`;
  } else {
    signal = 'strong_sell';
    note   = `Phân phối mạnh — CMF ${cmf} (xả hàng trên volume cao)`;
  }

  return {
    netBuyValue5d:  proxyNetVal,
    netBuyValue20d: proxyNetVal * 4,
    avgDailyNet:    Math.round(proxyNetVal / 5),
    signal,
    note: `[Volume proxy] ${note}`,
  };
}

function buildForeignFlowResult(last5: number[], last20: number[]): ForeignFlow {
  const netBuyValue5d  = last5.reduce((a, b) => a + b, 0);
  const netBuyValue20d = last20.reduce((a, b) => a + b, 0);
  const avgDailyNet    = last20.length > 0 ? netBuyValue20d / last20.length : 0;

  // Phân loại: ngưỡng tham khảo với mã mid-cap VN (~200-500 tỷ/ngày)
  let signal: ForeignFlow['signal'];
  let note: string;

  if (netBuyValue5d > 100_000) {
    signal = 'strong_buy';
    note = `Khối ngoại mua ròng mạnh +${(netBuyValue5d / 1000).toFixed(0)} tỷ trong 5 phiên`;
  } else if (netBuyValue5d > 20_000) {
    signal = 'buy';
    note = `Khối ngoại mua ròng +${(netBuyValue5d / 1000).toFixed(0)} tỷ trong 5 phiên`;
  } else if (netBuyValue5d > -20_000) {
    signal = 'neutral';
    note = 'Khối ngoại giao dịch cân bằng';
  } else if (netBuyValue5d > -100_000) {
    signal = 'sell';
    note = `Khối ngoại bán ròng ${(netBuyValue5d / 1000).toFixed(0)} tỷ trong 5 phiên`;
  } else {
    signal = 'strong_sell';
    note = `Khối ngoại xả mạnh ${(netBuyValue5d / 1000).toFixed(0)} tỷ trong 5 phiên — áp lực lớn`;
  }

  return {
    netBuyValue5d:  Math.round(netBuyValue5d),
    netBuyValue20d: Math.round(netBuyValue20d),
    avgDailyNet:    Math.round(avgDailyNet),
    signal,
    note,
  };
}

// ─── Market Breadth ───────────────────────────────────────────────────────────

/**
 * Tính độ rộng thị trường từ danh sách mã và giá hiện tại.
 * Không cần API ngoài — dùng dữ liệu giá đã có trong watchlist.
 *
 * @param symbols     Danh sách mã trong watchlist/portfolio
 * @param pctChanges  Map symbol → % thay đổi ngày hôm nay
 * @param closesMap   Map symbol → close[] (lịch sử để tính SMA20)
 */
export function calcMarketBreadth(
  symbols:    string[],
  pctChanges: Record<string, number>,
  closesMap:  Record<string, number[]>,
): MarketBreadth {
  if (symbols.length === 0) {
    return {
      advancing: 0, declining: 0, unchanged: 0,
      advanceRatio: 50, aboveSMA20Pct: 50,
      breadthSignal: 'moderate',
      note: 'Không đủ dữ liệu',
    };
  }

  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let aboveSMA20Count = 0;
  let validSMA20 = 0;

  for (const sym of symbols) {
    const pct = pctChanges[sym] ?? 0;
    if (pct > 0.5)        advancing++;
    else if (pct < -0.5)  declining++;
    else                  unchanged++;

    const closes = closesMap[sym];
    if (closes && closes.length >= 20) {
      const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const price = closes.at(-1)!;
      if (price > sma20) aboveSMA20Count++;
      validSMA20++;
    }
  }

  const total         = advancing + declining + unchanged;
  const advanceRatio  = total > 0 ? Math.round((advancing / total) * 100) : 50;
  const aboveSMA20Pct = validSMA20 > 0 ? Math.round((aboveSMA20Count / validSMA20) * 100) : 50;

  // Phân loại breadth
  let breadthSignal: MarketBreadth['breadthSignal'];
  if (advanceRatio >= 65 && aboveSMA20Pct >= 60)      breadthSignal = 'strong';
  else if (advanceRatio >= 50 && aboveSMA20Pct >= 45) breadthSignal = 'moderate';
  else if (advanceRatio >= 35)                         breadthSignal = 'weak';
  else                                                 breadthSignal = 'bear';

  const notes: Record<MarketBreadth['breadthSignal'], string> = {
    strong:   `Thị trường rộng: ${advanceRatio}% mã tăng, ${aboveSMA20Pct}% trên SMA20 — nền tốt để mở vị thế mới`,
    moderate: `Thị trường phân hóa: ${advanceRatio}% mã tăng — chọn lọc kỹ trước khi vào`,
    weak:     `Sức rộng yếu: chỉ ${advanceRatio}% mã tăng — tránh mua đuổi`,
    bear:     `Thị trường đỏ diện rộng: ${advanceRatio}% mã tăng, ${100 - aboveSMA20Pct}% dưới SMA20 — ưu tiên phòng thủ`,
  };

  return {
    advancing,
    declining,
    unchanged,
    advanceRatio,
    aboveSMA20Pct,
    breadthSignal,
    note: notes[breadthSignal],
  };
}

// ─── Volume-based money flow proxy ───────────────────────────────────────────
//
// Khi SSI không available, dùng On-Balance Volume (OBV) và
// Money Flow Index (MFI) từ close+volume để proxy dòng tiền.

/**
 * On-Balance Volume — tích lũy volume theo chiều giá.
 * Dương và tăng = tiền đang vào. Âm và giảm = tiền đang ra.
 */
export function calcOBV(closes: number[], volumes: number[]): number {
  if (closes.length < 2 || volumes.length < 2) return 0;

  const len = Math.min(closes.length, volumes.length);
  let obv = 0;

  for (let i = 1; i < len; i++) {
    if (closes[i] > closes[i - 1])      obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    // unchanged: OBV không thay đổi
  }

  return obv;
}

/**
 * OBV trend: so sánh OBV hiện tại vs 10 phiên trước.
 * Trả về % thay đổi OBV — dương = accumulation, âm = distribution.
 */
export function calcOBVTrend(closes: number[], volumes: number[], lookback = 10): number {
  if (closes.length < lookback + 2) return 0;

  const recentObv = calcOBV(closes, volumes);
  const pastObv   = calcOBV(
    closes.slice(0, closes.length - lookback),
    volumes.slice(0, volumes.length - lookback),
  );

  if (pastObv === 0) return 0;
  return Number(((recentObv - pastObv) / Math.abs(pastObv) * 100).toFixed(1));
}

/**
 * Money Flow Index (MFI-14) — RSI nhưng có weight theo volume.
 * > 80: overbought (tiền ra). < 20: oversold (tiền vào).
 */
export function calcMFI(closes: number[], volumes: number[], period = 14): number {
  if (closes.length < period + 1 || volumes.length < period + 1) return 50;

  const len = Math.min(closes.length, volumes.length);
  let posFlow = 0;
  let negFlow = 0;

  for (let i = len - period; i < len; i++) {
    // Typical price proxy từ close (không có high/low)
    const tp     = closes[i];
    const tpPrev = closes[i - 1];
    const mf     = tp * (volumes[i] || 1);

    if (tp > tpPrev)      posFlow += mf;
    else if (tp < tpPrev) negFlow += mf;
  }

  if (negFlow === 0) return 100;
  if (posFlow === 0) return 0;

  const mfr = posFlow / negFlow;
  return Number((100 - 100 / (1 + mfr)).toFixed(1));
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildMoneyFlowPromptSection(
  foreign:  ForeignFlow | null,
  breadth:  MarketBreadth | null,
  obvTrend: number,
  mfi:      number,
  symbol:   string,
): string {
  const lines: string[] = [`[DÒNG TIỀN — ${symbol}]`];

  // Foreign
  if (foreign) {
    const emoji = foreign.signal.includes('buy') ? '🟢' : foreign.signal.includes('sell') ? '🔴' : '🟡';
    lines.push(`${emoji} Khối ngoại: ${foreign.note} (avg ${(foreign.avgDailyNet / 1000).toFixed(1)} tỷ/phiên)`);
  } else {
    lines.push(`⚪ Khối ngoại: không có dữ liệu`);
  }

  // OBV + MFI từ price/volume
  const obvNote = obvTrend > 10 ? `OBV tăng ${obvTrend}% → tích lũy` :
                  obvTrend < -10 ? `OBV giảm ${obvTrend}% → phân phối` :
                  `OBV ổn định (${obvTrend}%)`;
  const mfiNote = mfi > 75 ? `MFI ${mfi} (overbought)` :
                  mfi < 25 ? `MFI ${mfi} (oversold — tiền chưa vào hết)` :
                  `MFI ${mfi} (trung tính)`;
  lines.push(`📊 Volume flow: ${obvNote} | ${mfiNote}`);

  // Market breadth
  if (breadth) {
    const bEmoji = breadth.breadthSignal === 'strong' ? '🟢' :
                   breadth.breadthSignal === 'bear'   ? '🔴' : '🟡';
    lines.push(`${bEmoji} Breadth: ${breadth.note}`);
  }

  return lines.join('\n');
  }
