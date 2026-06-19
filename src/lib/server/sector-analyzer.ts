// src/lib/server/sector-analyzer.ts
//
// Phase 2A — Phân tích ngành (Sector Rotation)
//
// Không cần API trả phí. Tính sector performance hoàn toàn từ:
//   • Yahoo Finance history (cùng endpoint range=3mo đã dùng)
//   • SECTOR_MAP — phân loại thủ công các mã VN theo ngành
//
// Output cho AI prompt:
//   "Ngành Thép: -8.2% (1M), underperform VNINDEX -3.1%.
//    HPG, HSG, NKG đều trong vùng giảm. Rủi ro ngành cao."

// ─── Sector Map ───────────────────────────────────────────────────────────────
// SECTOR_MAP, SectorKey, SectorMeta, getSymbolSectors đã chuyển sang module dùng
// chung '@/lib/sector-map' để cả client (dashboard) lẫn server dùng chung,
// tránh lặp danh sách mã ở nhiều nơi.

import {
  SECTOR_MAP,
  getSymbolSectors,
  getPrimarySectorLabel,
  type SectorKey,
  type SectorMeta,
} from '@/lib/sector-map';

// Re-export để các file đang import từ sector-analyzer không bị gãy.
export { SECTOR_MAP, getSymbolSectors, getPrimarySectorLabel };
export type { SectorKey, SectorMeta };

// ─── Types ────────────────────────────────────────────────────────────────────

export type SectorPerformance = {
  key:           SectorKey;
  label:         string;
  trend1mPct:    number;   // avg 1M của các mã đại diện
  trend3mPct:    number;   // avg 3M
  vsVnindex1m:   number;   // so sánh vs VNINDEX 1M (relative performance)
  momentum:      'hot' | 'warm' | 'cold' | 'dump'; // phân loại nhanh
  topMovers:     string[]; // top 2 mã tăng/giảm mạnh nhất
};

export type SectorContext = {
  sectors:        SectorPerformance[];
  rotationSignal: string; // mô tả dòng tiền đang chảy vào đâu
  riskySectors:   string[]; // ngành đang yếu → cảnh báo
  strongSectors:  string[]; // ngành đang mạnh → cơ hội
};

// ─── Fetching ─────────────────────────────────────────────────────────────────

const YAHOO_HOSTS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function fetchCloseHistory(symbol: string): Promise<number[]> {
  const ticker = symbol === 'VNINDEX' ? '^VNINDEX' : `${symbol}.VN`;

  for (const host of YAHOO_HOSTS) {
    try {
      // Lưu ý: nối chuỗi thay vì template URL để tránh editor hiểu nhầm placeholder.
      const yahooUrl =
        'https://' + host +
        '/v8/finance/chart/' + encodeURIComponent(ticker) +
        '?interval=1d&range=3mo';
      const res = await fetch(yahooUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
        next: { revalidate: 3600 }, // cache 1 giờ — sector không thay đổi trong ngày
      });
      if (!res.ok) continue;

      const json = await res.json();
      const closes: number[] = (
        json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
      )
        .map(Number)
        .filter((v: number) => Number.isFinite(v) && v > 0);

      if (closes.length > 10) return closes;
    } catch {
      // try next host
    }
  }
  return [];
}

function trendPct(closes: number[], lookback: number): number {
  if (closes.length < lookback + 1) return 0;
  const past = closes[closes.length - 1 - Math.min(lookback, closes.length - 1)];
  const curr = closes.at(-1)!;
  return past > 0 ? Number(((curr - past) / past * 100).toFixed(2)) : 0;
}

// ─── Core analysis ────────────────────────────────────────────────────────────

/**
 * Tính performance của một sector từ lịch sử giá các mã đại diện.
 * Dùng equal-weight average (đơn giản, không cần market cap data).
 */
async function analyzeSector(
  key:         SectorKey,
  meta:        SectorMeta,
  vnindex1m:   number,
): Promise<SectorPerformance | null> {
  // Chỉ lấy tối đa 4 mã đại diện để giảm request
  const sample = meta.symbols.slice(0, 4);

  const results = await Promise.allSettled(
    sample.map(async (sym) => {
      const closes = await fetchCloseHistory(sym);
      return {
        sym,
        trend1m: trendPct(closes, 22),
        trend3m: trendPct(closes, 65),
      };
    })
  );

  const valid = results
    .filter((r): r is PromiseFulfilledResult<{ sym: string; trend1m: number; trend3m: number }> =>
      r.status === 'fulfilled' && r.value.trend1m !== 0
    )
    .map(r => r.value);

  if (valid.length === 0) return null;

  const avg1m = valid.reduce((s, v) => s + v.trend1m, 0) / valid.length;
  const avg3m = valid.reduce((s, v) => s + v.trend3m, 0) / valid.length;
  const vsVnindex1m = Number((avg1m - vnindex1m).toFixed(2));

  // Phân loại momentum
  let momentum: SectorPerformance['momentum'];
  if (avg1m > 5)                          momentum = 'hot';
  else if (avg1m > 1)                     momentum = 'warm';
  else if (avg1m > -3)                    momentum = 'cold';
  else                                    momentum = 'dump';

  // Top movers (tăng hoặc giảm mạnh nhất)
  const sorted = [...valid].sort((a, b) => Math.abs(b.trend1m) - Math.abs(a.trend1m));
  const topMovers = sorted.slice(0, 2).map(v =>
    `${v.sym}(${v.trend1m > 0 ? '+' : ''}${v.trend1m}%)`
  );

  return {
    key,
    label:      meta.label,
    trend1mPct: Number(avg1m.toFixed(2)),
    trend3mPct: Number(avg3m.toFixed(2)),
    vsVnindex1m,
    momentum,
    topMovers,
  };
}

/**
 * Build toàn bộ sector context.
 * Chỉ phân tích những ngành liên quan đến watchlist/portfolio của user
 * để giảm số lượng Yahoo request.
 *
 * @param relevantSectors - các SectorKey cần phân tích (từ getSymbolSectors)
 */
export async function buildSectorContext(
  relevantSectors: SectorKey[],
): Promise<SectorContext> {
  // Lấy VNINDEX làm baseline
  const vnIndexCloses = await fetchCloseHistory('VNINDEX');
  const vnindex1m     = trendPct(vnIndexCloses, 22);

  // Chỉ phân tích sectors liên quan, dedupe
  const uniqueSectors = [...new Set(relevantSectors)];

  const results = await Promise.allSettled(
    uniqueSectors.map(key => analyzeSector(key, SECTOR_MAP[key], vnindex1m))
  );

  const sectors: SectorPerformance[] = results
    .filter((r): r is PromiseFulfilledResult<SectorPerformance> =>
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value);

  // Phân loại
  const riskySectors  = sectors.filter(s => s.momentum === 'dump' || s.vsVnindex1m < -5).map(s => s.label);
  const strongSectors = sectors.filter(s => s.momentum === 'hot'  || s.vsVnindex1m > 3).map(s => s.label);

  // Mô tả rotation signal
  let rotationSignal = 'Thị trường phân hóa, chưa rõ xu hướng dòng tiền.';
  if (strongSectors.length > 0 && riskySectors.length > 0) {
    rotationSignal =
      `Dòng tiền đang dịch chuyển vào: ${strongSectors.join(', ')}. ` +
      `Rút khỏi: ${riskySectors.join(', ')}.`;
  } else if (strongSectors.length >= 3) {
    rotationSignal = `Thị trường rộng, tiền vào đều nhiều ngành: ${strongSectors.join(', ')}.`;
  } else if (riskySectors.length >= 3) {
    rotationSignal = `Áp lực bán lan rộng nhiều ngành, thận trọng với danh mục.`;
  }

  return { sectors, rotationSignal, riskySectors, strongSectors };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Tạo đoạn text ngắn gọn về sector cho AI prompt.
 * Format dễ đọc, AI hiểu rõ context mà không bị nhiễu quá nhiều số.
 */
export function buildSectorPromptSection(
  ctx:    SectorContext,
  symbol: string,
): string {
  const symbolSectors = getSymbolSectors(symbol);
  const relevant = ctx.sectors.filter(s => symbolSectors.includes(s.key));

  if (relevant.length === 0) return '';

  const lines: string[] = [
    `[SECTOR CONTEXT — ${symbol}]`,
  ];

  for (const s of relevant) {
    const vsStr = s.vsVnindex1m >= 0 ? `+${s.vsVnindex1m}%` : `${s.vsVnindex1m}%`;
    const emoji = s.momentum === 'hot' ? '🔥' : s.momentum === 'dump' ? '🔴' : s.momentum === 'warm' ? '🟢' : '🟡';
    lines.push(
      `${emoji} ${s.label}: 1M ${s.trend1mPct > 0 ? '+' : ''}${s.trend1mPct}% | ` +
      `3M ${s.trend3mPct > 0 ? '+' : ''}${s.trend3mPct}% | ` +
      `vs VNINDEX: ${vsStr} | Top movers: ${s.topMovers.join(', ')}`
    );
  }

  lines.push(`→ ${ctx.rotationSignal}`);

  return lines.join('\n');
}
