// src/lib/server/providers/vci-chart.ts
//
// Lấy OHLCV lịch sử từ VCI (Vietcap) chart API — có đủ HOSE / HNX / UPCOM.
//
// ⚠️ QUAN TRỌNG: VCI chart bị geo-block ở Supabase Edge Function (Singapore).
//    => CHỈ gọi file này từ phía Vercel (Washington DC), tức từ route
//       src/app/api/history/[symbol]/route.ts. KHÔNG import vào Edge Function.

import { normalizeSymbol, isVnIndexSymbol } from '../exchanges/exchange';

// Endpoint chart đúng nằm ở host mt.vietcap.com.vn (KHÔNG phải trading.vietcap.com.vn)
const VCI_CHART_URL =
	'https://mt.vietcap.com.vn/api/chart/OHLCChart/gappless';

const VCI_HEADERS = {
	'Content-Type': 'application/json',
	Accept: 'application/json',
	Referer: 'https://trading.vietcap.com.vn/',
	Origin: 'https://trading.vietcap.com.vn',
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};

export type OhlcvSeries = {
	symbol: string;
	count: number;
	timestamps: number[];
	opens: number[];
	highs: number[];
	lows: number[];
	closes: number[];
	volumes: number[];
	trade_dates: string[];
};

function toNumberArray(v: unknown): number[] {
	return Array.isArray(v) ? v.map((x) => Number(x)) : [];
}

// VCI có thể trả timestamp ở giây hoặc mili-giây → chuẩn hoá về giây.
function toSeconds(ts: number): number {
	return ts > 1e12 ? Math.floor(ts / 1000) : ts;
}

function emptySeries(symbol: string): OhlcvSeries {
	return {
		symbol,
		count: 0,
		timestamps: [],
		opens: [],
		highs: [],
		lows: [],
		closes: [],
		volumes: [],
		trade_dates: [],
	};
}

/**
 * Lấy OHLCV ngày (1D) cho 1 mã qua VCI chart.
 * @param symbol Mã CK (HPG, SHS, BSR, VNINDEX...)
 * @param days   Số nến gần nhất cần lấy (mặc định 90)
 */
export async function getVciChartOHLCV(
	symbol: string,
	days = 90,
): Promise<OhlcvSeries> {
	const sym = normalizeSymbol(symbol);
	const vciSymbol = isVnIndexSymbol(sym) ? 'VNINDEX' : sym;

	const to = Math.floor(Date.now() / 1000);
	// Đệm thêm cho cuối tuần + nghỉ lễ để chắc chắn đủ `days` phiên giao dịch.
	const from = to - Math.ceil(days * 1.6 + 10) * 86400;

	const res = await fetch(VCI_CHART_URL, {
		method: 'POST',
		headers: VCI_HEADERS,
		body: JSON.stringify({
			timeFrame: 'ONE_DAY',
			symbols: [vciSymbol],
			from,
			to,
		}),
		cache: 'no-store',
	});

	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`VCI chart HTTP ${res.status}: ${body.slice(0, 200)}`);
	}

	const data = await res.json();

	// Response là mảng, mỗi phần tử là 1 symbol với các mảng o/h/l/c/v/t.
	const item = Array.isArray(data)
		? data.find((d) => String(d?.symbol).toUpperCase() === vciSymbol) ?? data[0]
		: null;

	if (!item || !Array.isArray(item.t) || item.t.length === 0) {
		return emptySeries(sym);
	}

	const t = toNumberArray(item.t);
	const o = toNumberArray(item.o);
	const h = toNumberArray(item.h);
	const l = toNumberArray(item.l);
	const c = toNumberArray(item.c);
	const v = toNumberArray(item.v);

	// Ghép thành nến + loại nến không hợp lệ (close <= 0 hoặc NaN) + sắp tăng dần.
	const bars = t
		.map((ts, i) => ({
			t: toSeconds(ts),
			o: o[i],
			h: h[i],
			l: l[i],
			c: c[i],
			v: v[i] ?? 0,
		}))
		.filter((b) => Number.isFinite(b.c) && b.c > 0)
		.sort((a, b) => a.t - b.t);

	// Chỉ giữ `days` nến gần nhất.
	const sliced = bars.slice(-days);

	return {
		symbol: sym,
		count: sliced.length,
		timestamps: sliced.map((b) => b.t),
		opens: sliced.map((b) => (Number.isFinite(b.o) && b.o > 0 ? b.o : b.c)),
		highs: sliced.map((b) => (Number.isFinite(b.h) && b.h > 0 ? b.h : b.c)),
		lows: sliced.map((b) => (Number.isFinite(b.l) && b.l > 0 ? b.l : b.c)),
		closes: sliced.map((b) => b.c),
		volumes: sliced.map((b) => (Number.isFinite(b.v) ? b.v : 0)),
		trade_dates: sliced.map((b) =>
			new Date(b.t * 1000).toISOString().slice(0, 10),
		),
	};
		}
