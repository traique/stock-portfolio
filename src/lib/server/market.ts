import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

import {
	getYahooMarketData,
	type MarketData,
} from './providers/yahoo';

// NEW: dùng VCI Edge realtime cho HOSE/HNX/UPCOM (đặc biệt HNX/UPCOM không có trên Yahoo)
import { getVciEdgeBatch } from './providers/vci-edge';

import {
	normalizeSymbol,
} from './exchanges/exchange';

export const symbolsQuerySchema = z.object({
	symbols: z.string().optional().default(''),
});

export type PricesPayload = {
	prices: Record<string, number>;
	updatedAt: string;
	provider: string;
	debug: MarketData[];
	/** Thông tin sức khỏe nguồn giá cho việc giám sát/cảnh báo. */
	health: MarketHealth;
};

// ---------------------------------------------------------------------------
// MarketHealth — tổng hợp tình trạng lấy giá của mỗi request.
// ---------------------------------------------------------------------------
export type MarketHealth = {
	requested: number;
	yahooOk: number;
	vciOk: number;
	snapshotOk: number;
	failed: number;
	failedSymbols: string[];
	/** true khi tỉ lệ mã không lấy được giá vượt ngưỡng → coi như suy giảm. */
	degraded: boolean;
};

// Ngưỡng coi là "suy giảm diện rộng": >50% số mã không có giá hợp lệ.
const DEGRADED_FAIL_RATIO = 0.5;

// ---------------------------------------------------------------------------
// Helpers an toàn dữ liệu
// ---------------------------------------------------------------------------

/** Parse number an toàn: trả về null nếu không phải số hữu hạn (NaN/Infinity/null). */
function toFiniteNumber(value: unknown): number | null {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

/** Parse number với giá trị mặc định khi không hợp lệ (dùng cho field phụ). */
function toFiniteOr(value: unknown, fallback = 0): number {
	return toFiniteNumber(value) ?? fallback;
}

/** Một MarketData được coi là "có giá" khi price là số hữu hạn > 0. */
function hasValidPrice(data: MarketData | undefined | null): data is MarketData {
	if (!data) return false;
	const price = toFiniteNumber(data.price);
	return price !== null && price > 0;
}

function buildErrorResult(symbol: string): MarketData {
	return {
		symbol, ticker: symbol, provider: 'error',
		price: 0, previousClose: 0, change: 0, pct: 0,
		ceilingPriceEstimate: 0, floorPriceEstimate: 0,
		dayHigh: 0, dayLow: 0, marketTime: null, currency: 'VND', volume: 0,
	};
}

export function normalizeSymbols(raw: string): string[] {
	return [
		...new Set(raw.split(',').map(normalizeSymbol).filter(Boolean)),
	];
}

function getSupabase() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
	const key = process.env.SUPABASE_SERVER_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

async function getSnapshotBatch(symbols: string[]): Promise<Map<string, MarketData>> {
	if (!symbols.length) return new Map();
	const sb = getSupabase();
	const { data, error } = await sb
		.from('price_snapshots')
		.select('symbol,price,ref,change,pct,ceiling,floor,high,low,volume,fetched_at')
		.in('symbol', symbols);

	if (error) throw new Error(`Supabase read: ${error.message}`);

	const map = new Map<string, MarketData>();
	let skipped = 0;

	for (const row of data ?? []) {
		const symbol = String(row.symbol || '').trim().toUpperCase();
		if (!symbol) continue;

		// GUARD: snapshot bắt buộc phải có giá là số hữu hạn > 0.
		const price = toFiniteNumber(row.price);
		if (price === null || price <= 0) {
			skipped += 1;
			console.warn(`[Snapshot] Bỏ qua ${symbol}: giá không hợp lệ (${row.price})`);
			continue;
		}

		const fetchedAt = row.fetched_at ? new Date(row.fetched_at).getTime() : NaN;

		map.set(symbol, {
			symbol,
			ticker: symbol,
			provider: 'snapshot',
			price,
			previousClose: toFiniteOr(row.ref),
			change: toFiniteOr(row.change),
			pct: toFiniteOr(row.pct),
			ceilingPriceEstimate: toFiniteOr(row.ceiling),
			floorPriceEstimate: toFiniteOr(row.floor),
			dayHigh: toFiniteOr(row.high),
			dayLow: toFiniteOr(row.low),
			marketTime: Number.isFinite(fetchedAt) ? fetchedAt : null,
			currency: 'VND',
			volume: toFiniteOr(row.volume),
		});
	}

	if (skipped > 0) {
		console.warn(`[Snapshot] Đã bỏ qua ${skipped}/${data?.length ?? 0} snapshot do dữ liệu không hợp lệ`);
	}

	return map;
}

// Mọi symbol đều có thể fallback snapshot nếu có trong DB.
function canUseSnapshot(_symbol: string): boolean {
	return true;
}

/** Lấy giá hợp lệ (số hữu hạn > 0) từ một kết quả Yahoo đã settle. */
function getYahooPrice(
	result: PromiseSettledResult<MarketData>,
): number | null {
	if (result.status !== 'fulfilled') return null;
	const price = toFiniteNumber(result.value?.price);
	return price !== null && price > 0 ? price : null;
}

export async function fetchMarketPrices(symbols: string[]): Promise<PricesPayload> {
	// ── Bước 1: Yahoo song song — tốt cho HOSE + VNINDEX ────────────────────
	const yahooSettled = await Promise.allSettled(
		symbols.map(s => getYahooMarketData(s)),
	);

	// Ghi lại từng lỗi Yahoo để có dấu vết (không nuốt lỗi).
	yahooSettled.forEach((r, i) => {
		if (r.status === 'rejected') {
			console.warn(`[Yahoo Fail] ${symbols[i]}:`, r.reason);
		}
	});

	// Mã nào Yahoo không có giá hợp lệ → HNX/UPCOM luôn rơi vào đây.
	const missedAfterYahoo = symbols.filter(
		(_s, i) => getYahooPrice(yahooSettled[i]) === null,
	);

	// ── Bước 2: VCI Edge REALTIME cho các mã Yahoo thiếu ────────────────────
	// Đây là mắt xích bị thiếu trước đây: lấy giá HNX/UPCOM NGAY, không phải
	// đợi cron 30 phút bơm vào price_snapshots.
	const vciMap = missedAfterYahoo.length
		? await getVciEdgeBatch(missedAfterYahoo).catch(err => {
				console.error('[VCI Edge Fail]', err);
				Sentry.captureException(err, {
					tags: { module: 'market', stage: 'vci-edge' },
					extra: { missedAfterYahoo },
				});
				return new Map<string, MarketData>();
		  })
		: new Map<string, MarketData>();

	// ── Bước 3: mã VẪN thiếu sau VCI Edge → fallback snapshot (DB, do cron bơm)
	const missedAfterVci = missedAfterYahoo.filter(
		s => canUseSnapshot(s) && !hasValidPrice(vciMap.get(s)),
	);

	const snapshotMap = missedAfterVci.length
		? await getSnapshotBatch(missedAfterVci).catch(err => {
				console.error('[Snapshot Fallback Fail]', err);
				Sentry.captureException(err, {
					tags: { module: 'market', stage: 'snapshot-fallback' },
					extra: { missedAfterVci },
				});
				return new Map<string, MarketData>();
		  })
		: new Map<string, MarketData>();

	// ── Bước 4: gộp theo thứ tự ưu tiên Yahoo → VCI Edge → snapshot ─────────
	let yahooOk = 0;
	let vciOk = 0;
	let snapshotOk = 0;
	const failedSymbols: string[] = [];

	const results: MarketData[] = symbols.map((symbol, i) => {
		const yahoo = yahooSettled[i];
		if (getYahooPrice(yahoo) !== null) {
			yahooOk += 1;
			return (yahoo as PromiseFulfilledResult<MarketData>).value;
		}

		const vci = vciMap.get(symbol);
		if (hasValidPrice(vci)) {
			vciOk += 1;
			return vci;
		}

		const snap = snapshotMap.get(symbol);
		if (snap) {
			snapshotOk += 1;
			return snap;
		}

		failedSymbols.push(symbol);
		return buildErrorResult(symbol);
	});

	const prices = Object.fromEntries(
		results
			.map(r => [r.symbol, toFiniteNumber(r.price)] as const)
			.filter((entry): entry is [string, number] => entry[1] !== null && entry[1] > 0),
	);

	const health: MarketHealth = {
		requested: symbols.length,
		yahooOk,
		vciOk,
		snapshotOk,
		failed: failedSymbols.length,
		failedSymbols,
		degraded:
			symbols.length > 0 &&
			failedSymbols.length / symbols.length > DEGRADED_FAIL_RATIO,
	};

	// Cảnh báo khi nguồn giá lỗi diện rộng — KHÔNG để "chết âm thầm".
	if (health.degraded) {
		console.error('[Market Degraded]', health);
		Sentry.captureMessage(
			`Market data degraded: ${health.failed}/${health.requested} mã không lấy được giá`,
			{
				level: 'error',
				tags: { module: 'market' },
				extra: health,
			},
		);
	} else if (failedSymbols.length > 0) {
		console.warn('[Market Partial Fail]', { failedSymbols });
	}

	return {
		prices,
		updatedAt: new Date().toISOString(),
		provider: 'yahoo+vci+snapshot',
		debug: results,
		health,
	};
}
