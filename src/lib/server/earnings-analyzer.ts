// src/lib/server/earnings-analyzer.ts
//
// Phase 3A — Earnings / KQKD (Kết quả kinh doanh)
//
// Nguồn dữ liệu theo thứ tự ưu tiên:
//   1. VCI API (đã dùng trong project) — có endpoint financials
//   2. CafeF scrape — backup nếu VCI fail
//   3. Estimated earnings window — dựa theo lịch sử mùa BCTC VN
//
// Output cho AI:
//   "HPG Q1/2025: Doanh thu +12% YoY, LNST +45% YoY.
//    Lịch công bố Q2 dự kiến: 15-20/7. Còn 25 ngày.
//    Pre-earnings window — biến động tăng thường xuất hiện T-10."

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuarterlyResult = {
  period:      string;   // 'Q1/2025', 'Q4/2024', ...
  revenue:     number;   // tỷ VND
  netIncome:   number;   // tỷ VND
  eps:         number;   // đồng/cổ phiếu
  revenueYoY:  number;   // % thay đổi so cùng kỳ
  netIncYoY:   number;   // %
  epsYoY:      number;   // %
};

export type EarningsCalendar = {
  symbol:           string;
  latestResult:     QuarterlyResult | null;
  nextEarningsDate: string | null;  // ISO string estimate
  daysToEarnings:   number | null;
  preEarningsAlert: boolean;        // true nếu < 15 ngày
  trend:            'beat' | 'miss' | 'inline' | 'unknown'; // so với kỳ trước
};

// ─── Mùa BCTC VN ─────────────────────────────────────────────────────────────
//
// Lịch công bố BCTC tại Việt Nam khá cố định theo quý:
//   Q4 (cả năm): 1/3 - 31/3 (BCTC kiểm toán chậm hơn)
//   Q1:          15/4 - 15/5
//   Q2 (6 tháng): 15/7 - 15/8
//   Q3:          15/10 - 15/11
//
// Dùng để estimate "next earnings date" khi không có data chính xác.

type EarningsWindow = {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  startMd: [number, number]; // [month, day]
  endMd:   [number, number];
};

const VN_EARNINGS_WINDOWS: EarningsWindow[] = [
  { quarter: 'Q4', startMd: [3,  1], endMd: [3, 31] },
  { quarter: 'Q1', startMd: [4, 15], endMd: [5, 15] },
  { quarter: 'Q2', startMd: [7, 15], endMd: [8, 15] },
  { quarter: 'Q3', startMd: [10,15], endMd: [11,15] },
];

function estimateNextEarningsDate(today = new Date()): { date: string; quarter: string; daysTo: number } {
  const year  = today.getFullYear();
  const month = today.getMonth() + 1;
  const day   = today.getDate();

  for (const w of VN_EARNINGS_WINDOWS) {
    const startDate = new Date(year, w.startMd[0] - 1, w.startMd[1]);
    const endDate   = new Date(year, w.endMd[0]   - 1, w.endMd[1]);
    const midDate   = new Date((startDate.getTime() + endDate.getTime()) / 2);

    // Nếu chưa đến giữa window này
    if (today <= midDate) {
      const daysTo = Math.round((midDate.getTime() - today.getTime()) / 86_400_000);
      return {
        date:    midDate.toISOString().slice(0, 10),
        quarter: `${w.quarter}/${year}`,
        daysTo,
      };
    }
  }

  // Đã qua Q3 → Q4 năm sau
  const nextQ4 = new Date(year + 1, 2, 15); // 15/3 năm sau
  const daysTo = Math.round((nextQ4.getTime() - today.getTime()) / 86_400_000);
  return { date: nextQ4.toISOString().slice(0, 10), quarter: `Q4/${year}`, daysTo };
}

// ─── VCI Financial API ────────────────────────────────────────────────────────
//
// VCI/Vietcap đã được dùng trong project (Edge Function).
// Endpoint financials là public, trả về BCTC theo quý.

const VCI_BASE = 'https://mt.vietcap.com.vn/api/price/v1';

type VCIFinancialPeriod = {
  period:    string;   // 'Q1.2025', 'Q4.2024', ...
  revenue:   number;
  netIncome: number;
  eps:       number;
};

async function fetchVCIFinancials(symbol: string): Promise<VCIFinancialPeriod[]> {
  try {
    const url = `${VCI_BASE}/ticker-info/financial-summary?tickers=${symbol}&language=vi`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 86400 }, // cache 24h — BCTC không thay đổi thường xuyên
    });

    if (!res.ok) return [];

    const json = await res.json();
    // Cấu trúc VCI: { data: { [symbol]: { quarterlyFinancials: [...] } } }
    const symbolData = json?.data?.[symbol] ?? json?.data?.[symbol.toLowerCase()];
    if (!symbolData) return [];

    const quarterly: Array<Record<string, unknown>> = symbolData.quarterlyFinancials ?? symbolData.quarterly ?? [];
    if (!Array.isArray(quarterly)) return [];

    return quarterly.slice(0, 8).map(q => ({
      period:    String(q.period ?? q.quarter ?? ''),
      revenue:   Number(q.revenue ?? q.netSale ?? 0) / 1_000_000,    // đồng → tỷ
      netIncome: Number(q.netIncome ?? q.netProfit ?? 0) / 1_000_000,
      eps:       Number(q.eps ?? q.EPS ?? 0),
    }));
  } catch {
    return [];
  }
}

// ─── CafeF fallback ───────────────────────────────────────────────────────────
//
// Scrape đơn giản từ CafeF nếu VCI fail.
// Endpoint JSON ẩn của CafeF (reverse từ browser DevTools).

async function fetchCafeFFundamentals(symbol: string): Promise<VCIFinancialPeriod[]> {
  try {
    const url = `https://s.cafef.vn/Ajax/PageNew/DataFinancial/NetProfit.ashx?symbol=${symbol}&type=2&pageindex=1&pagesize=8`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': `https://cafef.vn/du-lieu-chung-khoan/bao-cao-tai-chinh/${symbol.toLowerCase()}/`,
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return [];

    const json = await res.json();
    const rows: Array<Record<string, unknown>> = json?.Data?.Data ?? [];
    if (!Array.isArray(rows)) return [];

    return rows.map(row => ({
      period:    String(row.YearPeriod ?? row.Period ?? ''),
      revenue:   Number(row.Revenue ?? 0),
      netIncome: Number(row.NetProfit ?? row.ProfitAfterTax ?? 0),
      eps:       Number(row.EPS ?? 0),
    }));
  } catch {
    return [];
  }
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function normalizeQuarterLabel(raw: string): string {
  // VCI: 'Q1.2025' → 'Q1/2025'
  // CafeF: 'Q1/2025' hoặc '2025Q1' v.v.
  const m = raw.match(/Q([1-4])[./]?(\d{4})/i) ?? raw.match(/(\d{4})[./]?Q([1-4])/i);
  if (!m) return raw;
  return raw.includes('.') || raw.match(/^Q/) ? raw.replace('.', '/') : `Q${m[2]}/${m[1]}`;
}

function toQuarterlyResult(curr: VCIFinancialPeriod, prev: VCIFinancialPeriod | undefined): QuarterlyResult {
  const yoyPct = (a: number, b: number): number => {
    if (!b || b === 0) return 0;
    return Number(((a - b) / Math.abs(b) * 100).toFixed(1));
  };

  return {
    period:     normalizeQuarterLabel(curr.period),
    revenue:    Number(curr.revenue.toFixed(1)),
    netIncome:  Number(curr.netIncome.toFixed(1)),
    eps:        curr.eps,
    revenueYoY: prev ? yoyPct(curr.revenue, prev.revenue)     : 0,
    netIncYoY:  prev ? yoyPct(curr.netIncome, prev.netIncome) : 0,
    epsYoY:     prev ? yoyPct(curr.eps, prev.eps)             : 0,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function buildEarningsCalendar(symbol: string): Promise<EarningsCalendar> {
  const blank: EarningsCalendar = {
    symbol,
    latestResult:     null,
    nextEarningsDate: null,
    daysToEarnings:   null,
    preEarningsAlert: false,
    trend:            'unknown',
  };

  // Thử VCI trước, CafeF làm fallback
  let financials = await fetchVCIFinancials(symbol);
  if (financials.length === 0) {
    financials = await fetchCafeFFundamentals(symbol);
  }

  // Estimate next earnings date dù có hay không có financials
  const nextEst = estimateNextEarningsDate();
  blank.nextEarningsDate = nextEst.date;
  blank.daysToEarnings   = nextEst.daysTo;
  blank.preEarningsAlert = nextEst.daysTo <= 15;

  if (financials.length === 0) return blank;

  // Lấy quý mới nhất và quý cùng kỳ năm trước (index +4)
  const latest   = financials[0];
  const sameQtrY = financials.length >= 5 ? financials[4] : undefined;
  const latestResult = toQuarterlyResult(latest, sameQtrY);

  // Xu hướng EPS
  let trend: EarningsCalendar['trend'] = 'unknown';
  if (latestResult.epsYoY > 10)       trend = 'beat';
  else if (latestResult.epsYoY > -5)  trend = 'inline';
  else                                 trend = 'miss';

  return {
    ...blank,
    latestResult,
    trend,
  };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildEarningsPromptSection(data: EarningsCalendar): string {
  const lines: string[] = [`[KQKD — ${data.symbol}]`];

  if (data.latestResult) {
    const r = data.latestResult;
    const trendEmoji = r.epsYoY > 10 ? '✅' : r.epsYoY < -10 ? '❌' : '➖';
    lines.push(
      `${trendEmoji} ${r.period}: Doanh thu ${r.revenue}tỷ (${r.revenueYoY > 0 ? '+' : ''}${r.revenueYoY}% YoY) | ` +
      `LNST ${r.netIncome}tỷ (${r.netIncYoY > 0 ? '+' : ''}${r.netIncYoY}% YoY) | ` +
      `EPS ${r.eps.toLocaleString('vi-VN')}đ (${r.epsYoY > 0 ? '+' : ''}${r.epsYoY}% YoY)`
    );
  } else {
    lines.push(`⚪ Chưa có dữ liệu BCTC gần nhất`);
  }

  if (data.nextEarningsDate && data.daysToEarnings !== null) {
    const alertEmoji = data.preEarningsAlert ? '⚠️' : '📅';
    lines.push(
      `${alertEmoji} BCTC kỳ tiếp ước: ${data.nextEarningsDate} (còn ${data.daysToEarnings} ngày)` +
      (data.preEarningsAlert ? ' — PRE-EARNINGS WINDOW: biến động cao' : '')
    );
  }

  return lines.join('\n');
}
