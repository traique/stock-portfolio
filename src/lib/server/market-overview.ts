// src/lib/server/market-overview.ts
//
// ITEM 3 — Market Overview engine cho trang /market
// Tính các chỉ số tổng quan VN-Index từ dữ liệu daily (Yahoo ^VNINDEX)
// + giá realtime mới nhất (DNSE/Yahoo qua fetchMarketPrices).
// Tái dùng technical-indicators cho MA / MACD / MA-alignment / trendScore.

import { fetchMarketPrices } from '@/lib/server/market';
import {
	calcSMA,
	calcMACD,
	calcMAAlignment,
	calcTrendScore,
} from '@/lib/server/technical-indicators';

// ─── Types ──────────────────────────────────────────────────────────────────

export type MarketOverview = {
	index: {
		value: number;        // giá VN-Index mới nhất (realtime nếu có, fallback close cuối)
		prevClose: number;    // tham chiếu phiên trước
		changePct: number;    // % thay đổi so với prevClose
		updatedAt: string;    // ISO timestamp
		provider: string;     // nguồn giá realtime
		isRealtime: boolean;  // true nếu lấy được realtime
	};
	ma: { ma20: number; ma50: number; ma200: number };
	alignment: 'bullish' | 'bearish' | 'mixed' | 'unknown';
	trendScore: number;     // 0-100
	rsi14: number;
	volatilityPct: number;  // annualised %
	maxDrawdownPct: number; // % drawdown lớn nhất 1 năm
	ytdPct: number;         // % thay đổi từ đầu năm
	trend1mPct: number;
	trend3mPct: number;
	series: { dates: string[]; closes: number[] }; // ~250 phiên cho chart
	health: { degraded: boolean; provider: string };
	generatedAt: string;
};

type DailyHistory = { closes: number[]; dates: string[] };

// ─── Constants ───────────────────────────────────────────────────────────────

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'] as const;
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const HISTORY_CACHE_SECS = 900;
const TIMEOUT_MS = 8000;

// ─── Network ──────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
			next: { revalidate: HISTORY_CACHE_SECS },
			signal: controller.signal,
		} as RequestInit);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}

// VN-Index daily 1 năm (range=1y) để đủ MA200 + YTD + drawdown
async function fetchVnindexDaily(): Promise<DailyHistory> {
	let lastErr: unknown;
	for (const host of YAHOO_HOSTS) {
		try {
			const url = `https://${host}/v8/finance/chart/%5EVNINDEX?interval=1d&range=1y`;
			const json = await fetchJson(url);
			const result = json?.chart?.result?.[0];
			const q = result?.indicators?.quote?.[0] ?? {};
			const ts: number[] = result?.timestamp ?? [];
			const closes: number[] = [];
			const dates: string[] = [];
			for (let i = 0; i < ts.length; i++) {
				const c = Number(q.close?.[i]);
				if (!Number.isFinite(c) || c <= 0) continue;
				closes.push(c);
				dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
			}
			if (closes.length === 0) { lastErr = new Error(`Empty ^VNINDEX from ${host}`); continue; }
			return { closes, dates };
		} catch (err) {
			lastErr = err;
		}
	}
	throw lastErr ?? new Error('All Yahoo hosts failed for ^VNINDEX');
}

// ─── Indicators ────────────────────────────────────────────────────────────────

function calcRSI(closes: number[], period = 14): number {
	if (closes.length < period + 1) return 50;
	let avgGain = 0, avgLoss = 0;
	for (let i = 1; i <= period; i++) {
		const diff = closes[i] - closes[i - 1];
		if (diff >= 0) avgGain += diff; else avgLoss += Math.abs(diff);
	}
	avgGain /= period; avgLoss /= period;
	for (let i = period + 1; i < closes.length; i++) {
		const diff = closes[i] - closes[i - 1];
		const gain = diff >= 0 ? diff : 0;
		const loss = diff < 0 ? Math.abs(diff) : 0;
		avgGain = (avgGain * (period - 1) + gain) / period;
		avgLoss = (avgLoss * (period - 1) + loss) / period;
	}
	if (avgLoss === 0) return 100;
	const rs = avgGain / avgLoss;
	return Number((100 - 100 / (1 + rs)).toFixed(1));
}

// Volatility annualised từ daily returns (stdev × √252)
function calcVolatility(closes: number[], lookback = 66): number {
	const s = closes.slice(-lookback - 1);
	if (s.length < 3) return 0;
	const rets: number[] = [];
	for (let i = 1; i < s.length; i++) rets.push((s[i] - s[i - 1]) / s[i - 1]);
	const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
	const variance = rets.reduce((acc, r) => acc + (r - mean) ** 2, 0) / rets.length;
	return Number((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(2));
}

// Max drawdown % trong toàn bộ series
function calcMaxDrawdown(closes: number[]): number {
	let peak = closes[0] ?? 0;
	let maxDd = 0;
	for (const c of closes) {
		if (c > peak) peak = c;
		if (peak > 0) {
			const dd = (c - peak) / peak;
			if (dd < maxDd) maxDd = dd;
		}
	}
	return Number((maxDd * 100).toFixed(2));
}

function calcYtd(history: DailyHistory): number {
	const year = new Date().getFullYear();
	const idx = history.dates.findIndex(d => d.startsWith(String(year)));
	if (idx === -1) return 0;
	const base = history.closes[idx];
	const last = history.closes.at(-1) ?? base;
	return base > 0 ? Number(((last - base) / base * 100).toFixed(2)) : 0;
}

function pctChange(closes: number[], n: number): number {
	if (closes.length < n + 1) return 0;
	const past = closes[closes.length - 1 - n];
	const curr = closes.at(-1)!;
	return past > 0 ? Number(((curr - past) / past * 100).toFixed(2)) : 0;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export async function buildMarketOverview(): Promise<MarketOverview> {
	const history = await fetchVnindexDaily();
	const closes = history.closes;
	const lastClose = closes.at(-1) ?? 0;
	const prevClose = closes.at(-2) ?? lastClose;

	// Realtime VN-Index (best-effort)
	let value = lastClose;
	let provider = 'yahoo-daily';
	let isRealtime = false;
	let degraded = false;
	let updatedAt = new Date().toISOString();
	try {
		const market = await fetchMarketPrices(['VNINDEX']);
		const rt = market.prices['VNINDEX'];
		if (Number.isFinite(rt) && rt > 0) {
			value = rt;
			provider = market.provider;
			isRealtime = true;
			updatedAt = market.updatedAt;
		}
		degraded = market.health.degraded;
	} catch {
		/* realtime non-critical → dùng close daily */
	}

	const ma20 = Number(calcSMA(closes, 20).toFixed(2));
	const ma50 = Number(calcSMA(closes, 50).toFixed(2));
	const ma200 = Number(calcSMA(closes, 200).toFixed(2));
	const maAlign = calcMAAlignment(closes);
	const rsi14 = calcRSI(closes);
	const macd = calcMACD(closes);
	const trendScore = calcTrendScore(maAlign, rsi14, macd.histogram);

	const changePct = prevClose > 0
		? Number(((value - prevClose) / prevClose * 100).toFixed(2))
		: 0;

	return {
		index: {
			value: Number(value.toFixed(2)),
			prevClose: Number(prevClose.toFixed(2)),
			changePct, updatedAt, provider, isRealtime,
		},
		ma: { ma20, ma50, ma200 },
		alignment: maAlign.alignment,
		trendScore,
		rsi14,
		volatilityPct: calcVolatility(closes),
		maxDrawdownPct: calcMaxDrawdown(closes),
		ytdPct: calcYtd(history),
		trend1mPct: pctChange(closes, 22),
		trend3mPct: pctChange(closes, 66),
		series: { dates: history.dates.slice(-250), closes: closes.slice(-250) },
		health: { degraded, provider },
		generatedAt: new Date().toISOString(),
	};
}
