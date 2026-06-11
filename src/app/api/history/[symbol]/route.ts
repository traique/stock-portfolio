// src/app/api/history/[symbol]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getVciChartOHLCV } from '@/lib/server/providers/vci-chart';
import { getExchange, normalizeSymbol } from '@/lib/server/exchanges/exchange';

export const dynamic = 'force-dynamic';

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ symbol: string }> }, // ✅ Next.js 15: params là Promise
) {
	const { symbol } = await params;                       // ✅ phải await
	const sym = normalizeSymbol(symbol);

	const days = Math.min(
		Number(req.nextUrl.searchParams.get('days') ?? '90') || 90,
		90,
	);
	const exchange = getExchange(sym) ?? 'UNKNOWN';

	try {
		const data = await getVciChartOHLCV(sym, days);
		return NextResponse.json({ ...data, exchange, source: 'dnse' });
	} catch (e) {
		return NextResponse.json({
			symbol: sym,
			exchange,
			count: 0,
			opens: [],
			highs: [],
			lows: [],
			closes: [],
			volumes: [],
			timestamps: [],
			trade_dates: [],
			note: `DNSE lỗi: ${e instanceof Error ? e.message : String(e)}`,
		});
	}
}
