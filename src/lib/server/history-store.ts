// src/lib/server/history-store.ts
//
// Lazy backfill: AI / chart đọc lịch sử qua đây.
// - Có đủ dữ liệu trong DB  -> trả nhanh.
// - Mã mới / thiếu dữ liệu  -> tự nạp 90 ngày từ DNSE rồi ghi vào price_history.
// Cột price_history: symbol, exchange, trade_date, open, high, low, close, volume.

import { createClient } from '@supabase/supabase-js';
import { getVciChartOHLCV } from './providers/vci-chart';
import { getExchange, normalizeSymbol } from './exchanges/exchange';

const supabase = createClient(
	process.env.SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type HistoryRow = {
	trade_date: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
};

export async function getHistory(
	symbol: string,
	days = 90,
): Promise<HistoryRow[]> {
	const sym = normalizeSymbol(symbol);

	// 1) Đọc từ DB
	const { data: rows } = await supabase
		.from('price_history')
		.select('trade_date, open, high, low, close, volume')
		.eq('symbol', sym)
		.order('trade_date', { ascending: true })
		.limit(days);

	// 2) Đủ dữ liệu -> trả luôn (ngưỡng 60% để bỏ qua mã mới niêm yết)
	if (rows && rows.length >= Math.floor(days * 0.6)) {
		return rows as HistoryRow[];
	}

	// 3) Thiếu (mã mới) -> backfill 90 ngày từ DNSE rồi upsert
	const fresh = await getVciChartOHLCV(sym, days);
	if (fresh.count > 0) {
		const exchange = getExchange(sym) ?? 'HOSE'; // ✅ exchange NOT NULL -> phải có giá trị

		const upsertRows = fresh.timestamps.map((_, i) => ({
			symbol: sym,
			exchange,
			trade_date: fresh.trade_dates[i],
			open: fresh.opens[i],
			high: fresh.highs[i],
			low: fresh.lows[i],
			close: fresh.closes[i],
			volume: fresh.volumes[i] ?? 0,
		}));

		await supabase
			.from('price_history')
			.upsert(upsertRows, { onConflict: 'symbol,trade_date' });

		return upsertRows.map(({ trade_date, open, high, low, close, volume }) => ({
			trade_date,
			open,
			high,
			low,
			close,
			volume,
		}));
	}

	return (rows ?? []) as HistoryRow[];
}
