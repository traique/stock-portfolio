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

const SSI_BASE = 'https://iboard-query.ssi.com.vn/v2';
const SSI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Origin': 'https://iboard.ssi.com.vn',
  'Referer': 'https://iboard.ssi.com.vn/',
};

type SSIForeignItem = {
  sym:        string;
  fNetBuyVol: number;  // foreign net buy volume
  fNetBuyVal: number;  // foreign net buy value (nghìn đồng)
  fBuyVol:    number;
  fSellVol:   number;
};

/**
 * Lấy dữ liệu khối ngoại từ SSI cho một mã.
 * Endpoint: /stock-price/{symbol} — trả về current trading session data.
 *
 * Nếu cần lịch sử 5-20 phiên, gọi nhiều lần hoặc dùng endpoint khác:
 * /intraday/his/investor/{symbol}?limit=20
 */
async function fetchSSIForeignCurrent(symbol: string): Promise<SSIForeignItem | null> {
  try {
    const url = `${SSI_BASE}/stock-price/${symbol}`;
    const res = await fetch(url, {
      headers: SSI_HEADERS,
      next: { revalidate: 900 }, // cache 15 phút
    });

    if (!res.ok) return null;

    const json = await res.json();
    const data = json?.data ?? json;

    if (!data || typeof data !== 'object') return null;

    return {
      sym:        symbol,
      fNetBuyVol: Number(data.fNetBuyVol ?? data.foreignNetBuyVol ?? 0),
      fNetBuyVal: Number(data.fNetBuyVal ?? data.foreignNetBuyVal ?? 0),
      fBuyVol:    Number(data.fBuyVol ?? data.foreignBuyVol ?? 0),
      fSellVol:   Number(data.fSellVol ?? data.foreignSellVol ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Lấy lịch sử dòng tiền ngoại qua SSI investor endpoint.
 * Trả về mảng net buy value (triệu VND) theo từng phiên gần nhất.
 */
async function fetchSSIForeignHistory(symbol: string, limit = 20): Promise<number[]> {
  try {
    const url = `${SSI_BASE}/intraday/his/investor/${symbol}?limit=${limit}`;
    const res = await fetch(url, {
      headers: SSI_HEADERS,
      next: { revalidate: 3600 },
    });

    if (!res.ok) return [];

    const json = await res.json();
    const items: Array<Record<string, unknown>> = json?.data ?? [];

    if (!Array.isArray(items) || items.length === 0) return [];

    // Mỗi item có fNetBuyVal tính bằng nghìn đồng → đổi sang triệu VND
    return items
      .map(item => Number(item.fNetBuyVal ?? item.foreignNetBuyVal ?? 0) / 1000)
      .filter(v => v !== 0);
  } catch {
    return [];
  }
}

// ─── Foreign Flow Analysis ────────────────────────────────────────────────────

export async function analyzeForeignFlow(symbol: string): Promise<ForeignFlow | null> {
  const history = await fetchSSIForeignHistory(symbol, 20);

  if (history.length < 3) {
    // Thử current-session fallback
    const current = await fetchSSIForeignCurrent(symbol);
    if (!current) return null;

    const netVal = current.fNetBuyVal / 1000; // nghìn → triệu VND
    return buildForeignFlowResult([netVal], [netVal]);
  }

  const last5  = history.slice(0, 5);
  const last20 = history.slice(0, 20);

  return buildForeignFlowResult(last5, last20);
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
