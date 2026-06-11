// src/app/api/history/[symbol]/route.ts
//
// Proxy OHLCV lịch sử — được gọi bởi Supabase Edge Function (EOD / history mode).
// Route này CHẠY TRÊN VERCEL (Washington DC) nên KHÔNG bị geo-block như
// Supabase Edge Function (Singapore) → có thể gọi cả Yahoo lẫn VCI chart.
//
//   HOSE / VNINDEX : Yahoo Finance (fallback VCI chart nếu Yahoo lỗi)
//   HNX / UPCOM    : VCI chart (Yahoo không có dữ liệu 2 sàn này)

import { NextResponse, type NextRequest } from 'next/server';
import { getExchange } from '@/lib/server/exchanges/exchange';
import {
	getVciChartOHLCV,
	type OhlcvSeries,
} from '@/lib/server/providers/vci-chart';

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

function emptyPayload(symbol: string, exchange: string, note: string) {
	return {
		symbol,
		exchange,
		count: 0,
		opens: [],
		closes: [],
		highs: [],
		lows: [],
		volumes: [],
		timestamps: [],
		trade_dates: [],
		note,
	};
}

async function fetchFromYahoo(
	sym: string,
	days: number,
): Promise<OhlcvSeries | null> {
	const ticker = sym === 'VNINDEX' ? '^VNINDEX' : `${sym}.VN`;
	const range =
		days <= 7 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : '6mo';

	for (const host of YAHOO_HOSTS) {
		try {
			const res = await fetch(
				`https://${host}/v8/finance/chart/${encodeURIComponent(
					ticker,
				)}?interval=1d&range=${range}`,
				{
					headers: { 'User-Agent': UA, Accept: '*/*' },
					next: { revalidate: 3600 },
				},
			);
			if (!res.ok) continue;

			const json = await res.json();
			const result = json?.chart?.result?.[0];
			if (!result) continue;

			const timestamps: number[] = result.timestamp ?? [];
			const q = result.indicators?.quote?.[0] ?? {};

			const valid = timestamps
				.map((t, i) => ({
					t,
					o: Number(q.open?.[i]),
					h: Number(q.high?.[i]),
					l: Number(q.low?.[i]),
					c: Number(q.close?.[i]),
					v: Number(q.volume?.[i] ?? 0),
				}))
				.filter((d) => Number.isFinite(d.c) && d.c > 0);

			if (valid.length < 5) continue;

			return {
				symbol: sym,
				count: valid.length,
				timestamps: valid.map((d) => d.t),
				opens: valid.map((d) => (Number.isFinite(d.o) && d.o > 0 ? d.o : d.c)),
				highs: valid.map((d) => d.h),
				lows: valid.map((d) => d.l),
				closes: valid.map((d) => d.c),
				volumes: valid.map((d) => d.v),
				trade_dates: valid.map((d) =>
					new Date(d.t * 1000).toISOString().slice(0, 10),
				),
			};
		} catch {
			continue;
		}
	}
	return null;
}

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ symbol: string }> },
) {
	const { symbol } = await params;
	const sym = symbol.toUpperCase();
	const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90', 10);

	if (!sym || !/^[A-Z0-9]{2,10}$/.test(sym)) {
		return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
	}

	// getExchange trả null nếu chưa map → coi như HOSE (Yahoo trước, VCI fallback).
	const exchange = getExchange(sym) ?? 'HOSE';

	// ── HNX / UPCOM → VCI chart (Yahoo không có) ────────────────────────────
	if (exchange === 'HNX' || exchange === 'UPCOM') {
		try {
			const series = await getVciChartOHLCV(sym, days);
			if (series.count > 0) {
				return NextResponse.json({ ...series, exchange, source: 'vci-chart' });
			}
			return NextResponse.json(
				emptyPayload(symbol, exchange, `VCI chart rỗng cho ${sym}`),
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return NextResponse.json(
				emptyPayload(symbol, exchange, `VCI chart lỗi: ${msg}`),
			);
		}
	}

	// ── HOSE / VNINDEX → Yahoo trước ────────────────────────────────────────
	const yahoo = await fetchFromYahoo(sym, days);
	if (yahoo && yahoo.count >= 5) {
		return NextResponse.json({ ...yahoo, exchange, source: 'yahoo' });
	}

	// ── Fallback: VCI chart cho HOSE khi Yahoo fail ─────────────────────────
	try {
		const series = await getVciChartOHLCV(sym, days);
		if (series.count > 0) {
			return NextResponse.json({
				...series,
				exchange,
				source: 'vci-chart-fallback',
			});
		}
	} catch {
		/* bỏ qua, trả empty bên dưới */
	}

	return NextResponse.json(
		emptyPayload(symbol, exchange, `Không lấy được OHLCV cho ${sym}`),
	);
}
