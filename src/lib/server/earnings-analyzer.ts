// src/lib/server/earnings-analyzer.ts
//
// Earnings / KQKD (Kết quả kinh doanh)
//
// Nguồn dữ liệu:
// - Yahoo Finance quoteSummary — nguồn DUY NHẤT đang hoạt động trên Vercel.
//   (VCI financial-summary & CafeF đều bị block network / chặn bot nên đã bỏ.)
// - Khi không có BCTC (HNX/UPCOM hoặc Yahoo thiếu data) → vẫn trả về lịch
//   công bố BCTC ƯỚC TÍNH theo mùa BCTC Việt Nam.

import { getExchange } from './exchanges/exchange';

// ─── Types ────────────────────────

export type QuarterlyResult = {
  period: string;
  revenue: number;        // tỷ VND
  netIncome: number;      // tỷ VND
  eps: number | null;     // đồng/cp — ✨ 2.4: null nếu thiếu số CP lưu hành
  revenueYoY: number;
  netIncYoY: number;
  epsYoY: number | null;  // ✨ 2.4: null nếu không tính được YoY
};

export type EarningsCalendar = {
  symbol: string;
  latestResult: QuarterlyResult | null;
  nextEarningsDate: string | null;
  daysToEarnings: number | null;
  preEarningsAlert: boolean;
  trend: 'beat' | 'miss' | 'inline' | 'unknown';
};

// ─── Mùa BCTC VN ───────────────────────
//   Q4: 1/3-31/3 · Q1: 15/4-15/5 · Q2: 15/7-15/8 · Q3: 15/10-15/11

type EarningsWindow = {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  startMd: [number, number];
  endMd: [number, number];
};

const VN_EARNINGS_WINDOWS: EarningsWindow[] = [
  { quarter: 'Q4', startMd: [3, 1], endMd: [3, 31] },
  { quarter: 'Q1', startMd: [4, 15], endMd: [5, 15] },
  { quarter: 'Q2', startMd: [7, 15], endMd: [8, 15] },
  { quarter: 'Q3', startMd: [10, 15], endMd: [11, 15] },
];

function estimateNextEarningsDate(today = new Date()): { date: string; quarter: string; daysTo: number } {
  const year = today.getFullYear();

  for (const w of VN_EARNINGS_WINDOWS) {
    const startDate = new Date(year, w.startMd[0] - 1, w.startMd[1]);
    const endDate = new Date(year, w.endMd[0] - 1, w.endMd[1]);
    const midDate = new Date((startDate.getTime() + endDate.getTime()) / 2);

    if (today <= midDate) {
      const daysTo = Math.round((midDate.getTime() - today.getTime()) / 86_400_000);
      return { date: midDate.toISOString().slice(0, 10), quarter: `${w.quarter}/${year}`, daysTo };
    }
  }

  // Đã qua Q3 → Q4 năm sau (15/3 năm sau)
  const nextQ4 = new Date(year + 1, 2, 15);
  const daysTo = Math.round((nextQ4.getTime() - today.getTime()) / 86_400_000);
  return { date: nextQ4.toISOString().slice(0, 10), quarter: `Q4/${year}`, daysTo };
}

// ✨ 2.3: nhãn quý ĐỘNG — lùi `i` quý so với quý hoàn tất gần nhất.
// Thay cho hardcode `Q${4 - i}/2024` (sai năm + sinh Q0/Q-1 khi i > 3).
function recentQuarterLabel(i: number, today = new Date()): string {
  const curQ = Math.floor(today.getMonth() / 3) + 1;                // 1..4 quý hiện tại
  const latestCompleted = today.getFullYear() * 4 + (curQ - 1) - 1; // quý vừa hoàn tất
  const abs = latestCompleted - i;
  const year = Math.floor(abs / 4);
  const quarter = (abs % 4) + 1;
  return `Q${quarter}/${year}`;
}

// ─── Yahoo Finance quoteSummary ────────────────────

const YAHOO_HOSTS_E = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const YAHOO_UA_E = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const FIN_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = FIN_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type FinancialPeriod = {
  period: string;
  revenue: number;
  netIncome: number;
  eps: number | null;   // ✨ 2.4
};

async function fetchYahooFinancials(symbol: string): Promise<FinancialPeriod[]> {
  const exchange = getExchange(symbol);
  if (exchange === 'HNX' || exchange === 'UPCOM') return [];

  const ticker = `${symbol}.VN`;
  const modules = 'earnings,incomeStatementHistoryQuarterly,defaultKeyStatistics';

  for (const host of YAHOO_HOSTS_E) {
    try {
      const url = 'https://' + host + '/v10/finance/quoteSummary/' + encodeURIComponent(ticker) + '?modules=' + modules;
      const res = await fetchWithTimeout(url, {
        headers: { 'User-Agent': YAHOO_UA_E, Accept: '*/*' },
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (!result) continue;

      const quarterly: Array<Record<string, unknown>> =
        ((result as Record<string, unknown>)?.incomeStatementHistoryQuarterly as Record<string, unknown>)?.incomeStatementHistory as Array<Record<string, unknown>> ?? [];

      if (quarterly.length > 0) {
        return quarterly.slice(0, 8).map((q, i) => {
          const endDate = String((q?.endDate as Record<string, unknown>)?.fmt ?? (q?.endDate as Record<string, unknown>)?.raw ?? '');
          // Parse period từ endDate: "2025-03-31" → "Q1/2025". Fallback: nhãn quý động.
          const period = parsePeriodFromDate(endDate) ?? recentQuarterLabel(i);

          const netIncomeRaw = Number(((q as Record<string, unknown>)?.netIncome as Record<string, unknown>)?.raw ?? 0);
          const sharesRaw = Number(((result?.defaultKeyStatistics as Record<string, unknown>)?.sharesOutstanding as Record<string, unknown>)?.raw ?? NaN);
          // ✨ 2.4: thiếu/không hợp lệ số CP lưu hành → EPS = null (KHÔNG chia 1e9 bịa).
          const eps = Number.isFinite(sharesRaw) && sharesRaw > 0 ? netIncomeRaw / sharesRaw : null;

          return {
            period,
            revenue: Number(((q as Record<string, unknown>)?.totalRevenue as Record<string, unknown>)?.raw ?? 0) / 1e9,
            netIncome: netIncomeRaw / 1e9,
            eps,
          };
        });
      }

      // Fallback: earnings history từ Yahoo earnings module (actual EPS thật)
      const earningsQ: Array<Record<string, unknown>> =
        (((result as Record<string, unknown>)?.earnings as Record<string, unknown>)?.earningsChart as Record<string, unknown>)?.quarterly as Array<Record<string, unknown>> ?? [];

      if (earningsQ.length > 0) {
        return earningsQ.slice(0, 8).map(q => ({
          period: String((q as Record<string, unknown>)?.date ?? ''),
          revenue: 0,
          netIncome: 0,
          eps: Number(((q as Record<string, unknown>)?.actual as Record<string, unknown>)?.raw ?? 0),
        })).filter(q => q.eps !== 0);
      }
    } catch { /* try next host */ }
  }
  return [];
}

function parsePeriodFromDate(dateStr: string): string | null {
  const m = dateStr.match(/(\\d{4})-(\\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1]), month = parseInt(m[2]);
  const quarter = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4;
  return `Q${quarter}/${year}`;
}

// ─── Normalizer ───────────────────────────

function normalizeQuarterLabel(raw: string): string {
  const m = raw.match(/Q([1-4])[./]?(\\d{4})/i) ?? raw.match(/(\\d{4})[./]?Q([1-4])/i);
  if (!m) return raw;
  return raw.includes('.') || raw.match(/^Q/) ? raw.replace('.', '/') : `Q${m[2]}/${m[1]}`;
}

function toQuarterlyResult(curr: FinancialPeriod, prev: FinancialPeriod | undefined): QuarterlyResult {
  const yoyPct = (a: number, b: number): number => {
    if (!b || b === 0) return 0;
    return Number(((a - b) / Math.abs(b) * 100).toFixed(1));
  };

  // ✨ 2.4: chỉ tính epsYoY khi cả 2 kỳ đều có EPS thật
  const epsYoY =
    prev && curr.eps !== null && prev.eps !== null ? yoyPct(curr.eps, prev.eps) : null;

  return {
    period: normalizeQuarterLabel(curr.period),
    revenue: Number(curr.revenue.toFixed(1)),
    netIncome: Number(curr.netIncome.toFixed(1)),
    eps: curr.eps,
    revenueYoY: prev ? yoyPct(curr.revenue, prev.revenue) : 0,
    netIncYoY: prev ? yoyPct(curr.netIncome, prev.netIncome) : 0,
    epsYoY,
  };
}

// ─── Main ─────────────────────────

export async function buildEarningsCalendar(symbol: string): Promise<EarningsCalendar> {
  const blank: EarningsCalendar = {
    symbol,
    latestResult: null,
    nextEarningsDate: null,
    daysToEarnings: null,
    preEarningsAlert: false,
    trend: 'unknown',
  };

  const financials = await fetchYahooFinancials(symbol);

  const nextEst = estimateNextEarningsDate();
  blank.nextEarningsDate = nextEst.date;
  blank.daysToEarnings = nextEst.daysTo;
  blank.preEarningsAlert = nextEst.daysTo <= 15;

  if (financials.length === 0) return blank;

  const latest = financials[0];
  const sameQtrY = financials.length >= 5 ? financials[4] : undefined;
  const latestResult = toQuarterlyResult(latest, sameQtrY);

  // Xu hướng EPS — ✨ 2.4: chỉ xác định khi có epsYoY thật
  let trend: EarningsCalendar['trend'] = 'unknown';
  if (latestResult.epsYoY !== null) {
    if (latestResult.epsYoY > 10) trend = 'beat';
    else if (latestResult.epsYoY > -5) trend = 'inline';
    else trend = 'miss';
  }

  return { ...blank, latestResult, trend };
}

// ─── Prompt builder ─────────────────────────

export function buildEarningsPromptSection(data: EarningsCalendar): string {
  const lines: string[] = [`[KQKD — ${data.symbol}]`];

  if (data.latestResult) {
    const r = data.latestResult;
    const trendEmoji = r.epsYoY !== null ? (r.epsYoY > 10 ? '✅' : r.epsYoY < -10 ? '❌' : '➖') : '➖';
    // ✨ 2.4: EPS có thể null → ghi rõ "thiếu dữ liệu" thay vì in số bịa
    const epsStr = r.eps !== null
      ? `EPS ${r.eps.toLocaleString('vi-VN')}đ (${r.epsYoY !== null ? `${r.epsYoY > 0 ? '+' : ''}${r.epsYoY}% YoY` : 'YoY: thiếu dữ liệu'})`
      : 'EPS: thiếu dữ liệu (không có số CP lưu hành)';
    lines.push(
      `${trendEmoji} ${r.period}: Doanh thu ${r.revenue}tỷ (${r.revenueYoY > 0 ? '+' : ''}${r.revenueYoY}% YoY) | ` +
      `LNST ${r.netIncome}tỷ (${r.netIncYoY > 0 ? '+' : ''}${r.netIncYoY}% YoY) | ` +
      epsStr
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

  return lines.join('\\n');
         }
