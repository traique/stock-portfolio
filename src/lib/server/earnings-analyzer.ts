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

import { getExchange } from './exchanges/exchange';

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

// ─── Yahoo Finance quoteSummary ───────────────────────────────────────────────
//
// VCI financial-summary và CafeF đều không available trong Vercel (network block).
// Thay thế: Yahoo Finance quoteSummary — available, trả về EPS, PE, và earnings history.

const YAHOO_HOSTS_E = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const YAHOO_UA_E    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

type VCIFinancialPeriod = {
  period:    string;
  revenue:   number;
  netIncome: number;
  eps:       number;
};

async function fetchYahooFinancials(symbol: string): Promise<VCIFinancialPeriod[]> {
  // Yahoo Finance không có financials cho HNX/UPCOM — skip, dùng earnings estimate
  const exchange = getExchange(symbol);
  if (exchange === 'HNX' || exchange === 'UPCOM') return [];

  const ticker = `${symbol}.VN`;
  const modules = 'earnings,incomeStatementHistoryQuarterly,defaultKeyStatistics';

  for (const host of YAHOO_HOSTS_E) {
    try {
      const url = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': YAHOO_UA_E, Accept: '*/*' },
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;

      const json  = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (!result) continue;

      // Ưu tiên quarterly income statement
      const quarterly: Array<Record<string, unknown>> =
        ((result as Record<string,unknown>)?.incomeStatementHistoryQuarterly as Record<string,unknown>)?.incomeStatementHistory as Array<Record<string,unknown>> ?? [];

      if (quarterly.length > 0) {
        return quarterly.slice(0, 8).map((q, i) => {
          const endDate = String((q?.endDate as Record<string,unknown>)?.fmt ?? (q?.endDate as Record<string,unknown>)?.raw ?? '');
          // Parse period từ endDate: "2025-03-31" → "Q1/2025"
          const period = parsePeriodFromDate(endDate) ?? `Q${4 - i}/2024`;
          return {
            period,
            revenue:   Number(((q as Record<string,unknown>)?.totalRevenue as Record<string,unknown>)?.raw ?? 0) / 1e9,
            netIncome: Number(((q as Record<string,unknown>)?.netIncome    as Record<string,unknown>)?.raw ?? 0) / 1e9,
            eps:       Number(((q as Record<string,unknown>)?.netIncome    as Record<string,unknown>)?.raw ?? 0) /
                       Number(((result?.defaultKeyStatistics as Record<string,unknown>)?.sharesOutstanding as Record<string,unknown>)?.raw ?? 1e9),
          };
        });
      }

      // Fallback: earnings history từ Yahoo earnings module
      const earningsQ: Array<Record<string, unknown>> =
        (((result as Record<string,unknown>)?.earnings as Record<string,unknown>)?.earningsChart as Record<string,unknown>)?.quarterly as Array<Record<string,unknown>> ?? [];

      if (earningsQ.length > 0) {
        return earningsQ.slice(0, 8).map(q => ({
          period:    String((q as Record<string,unknown>)?.date ?? ''),
          revenue:   0,
          netIncome: 0,
          eps:       Number(((q as Record<string,unknown>)?.actual as Record<string,unknown>)?.raw ?? 0),
        })).filter(q => q.eps !== 0);
      }
    } catch { /* try next host */ }
  }
  return [];
}

function parsePeriodFromDate(dateStr: string): string | null {
  const m = dateStr.match(/(\d{4})-(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1]), month = parseInt(m[2]);
  const quarter = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `Q${quarter}/${year}`;
}

// Alias để giữ compatibility với code dưới
const fetchVCIFinancials    = fetchYahooFinancials;
const fetchCafeFFundamentals = async (_symbol: string): Promise<VCIFinancialPeriod[]> => [];

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
