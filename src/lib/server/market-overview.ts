// src/lib/server/market-overview.ts
//
// ITEM 3 — Market Overview engine cho trang /market
// Lấy lịch sử daily VN-Index từ DNSE (entrade) — cùng nguồn đang chạy ổn cho
// giá danh mục, tránh việc Yahoo chặn IP server. Giá realtime VN-Index vẫn lấy
// qua fetchMarketPrices (DNSE → Yahoo → VCI → snapshot).
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

// DNSE (entrade) OHLC — cùng endpoint provider dnse-realtime đang dùng.
// '/ohlcs/stock' chấp nhận cả symbol chỉ số như VNINDEX.
const DNSE_OHLC_URL = 'https://services.entrade.com.vn/chart-api/v2/ohlcs/stock';
const HISTORY_CACHE_SECS = 900;
const TIMEOUT_MS = 8000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// unix giây → ngày theo giờ VN (YYYY-MM-DD). sv-SE cho định dạng 'YYYY-MM-DD'.
function vnDate(unixSec: number): string {
	return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
		new Date(unixSec * 1000),
	);
}

// ─── Network (DNSE daily) ──────────────────────────────────────────────────────

type DnseOhlcResponse = {
	t?: number[];
	c?: Array<number | null>;
	o?: Array<number | null>;
	h?: Array<number | null>;
	l?: Array<number | null>;
	v?: Array<number | null>;
};

// VN-Index daily ~400 ngày lịch (đủ ~250 phiên + MA200 + YTD + drawdown).
// VNINDEX là CHỈ SỐ → close trả thẳng theo điểm, KHÔNG nhân 1000.
async function fetchVnindexDaily(): Promise<DailyHistory> {
	const to = Math.floor(Date.now() / 1000);
	const from = to - 400 * 86400;
	const url =
		`${DNSE_OHLC_URL}?symbol=VNINDEX&from=${from}&to=${to}&resolution=1D`;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	let json: DnseOhlcResponse;
	try {
		const res = await fetch(url, {
			headers: { Accept: 'application/json' },
			next: { revalidate: HISTORY_CACHE_SECS },
			signal: controller.signal,
		} as RequestInit);
		if (!res.ok) throw new Error(`DNSE HTTP ${res.status}`);
		json = (await res.json()) as DnseOhlcResponse;
	} finally {
		clearTimeout(timer);
	}

	const ts: number[] = Array.isArray(json?.t) ? json.t : [];
	const rawCloses = Array.isArray(json?.c) ? json.c : [];
	const closes: number[] = [];
	const dates: string[] = [];
	for (let i = 0; i < ts.length; i++) {
		const c = Number(rawCloses[i]);
		if (!Number.isFinite(c) || c <= 0) continue;
		closes.push(c);              // giữ nguyên điểm số (chỉ số)
		dates.push(vnDate(ts[i]));
	}
	if (closes.length === 0) throw new Error('Empty VNINDEX history from DNSE');
	return { closes, dates };
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

	// Realtime VN-Index (best-effort, qua DNSE/Yahoo/VCI/snapshot)
	let value = lastClose;
	let provider = 'dnse-daily';
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
