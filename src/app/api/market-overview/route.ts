// src/app/api/market-overview/route.ts
import { NextResponse } from 'next/server';
import { buildMarketOverview } from '@/lib/server/market-overview';
import { logger } from '@/lib/server/logger';

// Cache 30s ở Next data layer; client cũng tự refresh 30s khi tab mở.
export const revalidate = 30;
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		const overview = await buildMarketOverview();
		return NextResponse.json(overview, {
			headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' },
		});
	} catch (err) {
		logger.error('[market-overview] failed', { error: String(err) });
		return NextResponse.json(
			{ error: 'Không lấy được dữ liệu tổng quan thị trường.' },
			{ status: 502 },
		);
	}
}
