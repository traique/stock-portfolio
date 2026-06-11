// src/lib/server/history-store.ts
import { createClient } from '@supabase/supabase-js';
import { getVciChartOHLCV } from './providers/vci-chart';

const supabase = createClient(
	process.env.SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type HistoryRow = {
	trade_date: string;
	o: number;
	h: number;
	l: number;
	c: number;
	v: number;
};

export async function getHistory(
	symbol: string,
	days = 90,
): Promise<HistoryRow[]> {
	const sym = symbol.toUpperCase();

	// 1) Đọc từ DB
	const { data: rows } = await supabase
		.from('price_history')
		.select('trade_date, o, h, l, c, v')
		.eq('symbol', sym)
		.order('trade_date', { ascending: true })
		.limit(days);

	// 2) Đủ dữ liệu -> trả luôn (ngưỡng 60% để bỏ qua mã mới niêm yết)
	if (rows && rows.length >= Math.floor(days * 0.6)) {
		return rows as HistoryRow[];
	}

	// 3) Thiếu (mã mới) -> backfill 90 ngày từ DNSE rồi ghi DB
	const fresh = await getVciChartOHLCV(sym, days);
	if (fresh.count > 0) {
		const upsertRows: (HistoryRow & { symbol: string })[] =
			fresh.timestamps.map((_, i) => ({
				symbol: sym,
				trade_date: fresh.trade_dates[i],
				o: fresh.opens[i],
				h: fresh.highs[i],
				l: fresh.lows[i],
				c: fresh.closes[i],
				v: fresh.volumes[i],
			}));

		await supabase
			.from('price_history')
			.upsert(upsertRows, { onConflict: 'symbol,trade_date' });

		return upsertRows;
	}

	return (rows ?? []) as HistoryRow[];
}
