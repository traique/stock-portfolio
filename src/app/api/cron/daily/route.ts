// src/app/api/cron/daily/route.ts
//
// Cron DUY NHẤT cho Vercel Free plan (1 cron/ngày).
// Chạy 08:20 UTC = 15:20 VN, T2 → T6 (chờ VCI có đủ OHLCV EOD sau 15:00).
//
// Thứ tự:
//   1. Mỗi user: fetch dữ liệu + giá 1 LẦN → upsert snapshot + (nếu bật) gửi Telegram
//   2. EOD price_history + cleanup (song song, sau cùng)
//
// vercel.json:
//   { "path": "/api/cron/daily", "schedule": "20 8 * * 1-5" }
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
	calcCashSummary, calcSummary,
	CashTransaction, derivePortfolio,
	PortfolioSettings, Transaction,
} from '@/lib/calculations';
import {
	buildDailyMessage,
	sendTelegramMessage,
	shouldSendDaily,
	TelegramSettingRow,
	QuoteDebugItem,
} from '@/lib/telegram';
import { verifyCronSecret } from '@/lib/server/api-utils';
import { fetchMarketPrices } from '@/lib/server/market';
import type { PriceMap } from '@/lib/calculations';

function getServiceClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
	const key = process.env.SUPABASE_SERVER_KEY!;
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}

type ServiceClient = ReturnType<typeof getServiceClient>;

// Fetch giá + debug (change/pct) MỘT LẦN — dùng chung snapshot & Telegram.
async function fetchPricesWithDebug(
	symbols: string[],
): Promise<{ prices: PriceMap; debug: QuoteDebugItem[] }> {
	if (!symbols.length) return { prices: {}, debug: [] };
	try {
		const payload = await fetchMarketPrices(symbols);
		return {
			prices: payload.prices as PriceMap,
			debug: payload.debug.map((d) => ({
				symbol: d.symbol, price: d.price, change: d.change, pct: d.pct,
			})),
		};
	} catch {
		return { prices: {}, debug: [] };
	}
}

// ─── Xử lý 1 user: fetch 1 lần → snapshot + (tùy chọn) Telegram ───────
async function processUser(
	supabase: ServiceClient,
	userId: string,
	vnDate: string,
	now: Date,
	telegram: { setting: TelegramSettingRow; email: string; vnIndex: QuoteDebugItem | null } | null,
): Promise<{ snapshot: string; telegram: string }> {
	const [txRes, cashRes, settingsRes] = await Promise.all([
		supabase.from('transactions').select('*').eq('user_id', userId)
			.order('trade_date', { ascending: true, nullsFirst: false })
			.order('created_at', { ascending: true }),
		supabase.from('cash_transactions').select('*').eq('user_id', userId)
			.order('transaction_date', { ascending: true, nullsFirst: false })
			.order('created_at', { ascending: true }),
		supabase.from('portfolio_settings').select('*').eq('user_id', userId).maybeSingle(),
	]);

	if (txRes.error || cashRes.error) return { snapshot: 'error:db', telegram: 'skip' };

	const transactions = (txRes.data ?? []) as Transaction[];
	const cashTransactions = (cashRes.data ?? []) as CashTransaction[];
	const settings = (settingsRes.data ?? null) as PortfolioSettings | null;

	if (!transactions.length && !cashTransactions.length) {
		return { snapshot: 'skip:no_data', telegram: 'skip:no_data' };
	}

	// ── Tính 1 lần (giá fetch 1 lần dùng chung) ──
	const { enrichedTransactions, positions } = derivePortfolio(transactions);
	const symbols = positions.map((p) => p.symbol);
	const { prices, debug } = await fetchPricesWithDebug(symbols);

	const summary = calcSummary(positions, prices);
	const cashSummary = calcCashSummary(cashTransactions, enrichedTransactions, settings);
	const totalAssets = cashSummary.actualCash + summary.totalNow;
	const netCapital = cashSummary.netCapital;
	const totalPnl = totalAssets - netCapital;
	const totalPnlPct = netCapital > 0 ? (totalPnl / netCapital) * 100 : 0;

	// ── Snapshot ──
	let snapshotStatus = 'ok';
	const { error: upsertErr } = await supabase
		.from('portfolio_snapshots')
		.upsert(
			{
				user_id: userId,
				snapshot_date: vnDate,
				total_assets: Math.round(totalAssets),
				market_value: Math.round(summary.totalNow),
				nav_cash: Math.round(cashSummary.actualCash),
				net_capital: Math.round(netCapital),
				total_pnl: Math.round(totalPnl),
				total_pnl_pct: Number(totalPnlPct.toFixed(4)),
				position_count: positions.length,
			},
			{ onConflict: 'user_id,snapshot_date' },
		);
	if (upsertErr) snapshotStatus = `error:${upsertErr.message}`;

	// ── Telegram (dùng lại prices + debug đã fetch) ──
	let telegramStatus = 'skip';
	if (telegram) {
		if (!shouldSendDaily(telegram.setting.last_daily_sent_at, now, telegram.setting.daily_hour_utc)) {
			telegramStatus = 'skip:already_sent';
		} else if (!transactions.length) {
			telegramStatus = 'skip:no_transactions';
		} else {
			try {
				const text = buildDailyMessage(
					telegram.email, transactions, cashTransactions, settings,
					prices, debug, telegram.vnIndex,
				);
				await sendTelegramMessage(telegram.setting.chat_id, text);
				await Promise.all([
					supabase.from('telegram_settings')
						.update({ last_daily_sent_at: now.toISOString() })
						.eq('user_id', userId),
					supabase.from('alert_logs').insert({
						user_id: userId, alert_type: 'daily', message: text,
					}),
				]);
				telegramStatus = 'sent';
			} catch (err) {
				telegramStatus = err instanceof Error ? err.message : 'unknown_error';
			}
		}
	}

	return { snapshot: snapshotStatus, telegram: telegramStatus };
}

// ─── EOD Price History (gọi VCI Edge mode "eod") ─────────────────────
async function runEodHistory(): Promise<{ ok: boolean; result?: unknown; error?: string }> {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
	if (!url || !anonKey) return { ok: false, error: 'Missing Supabase env' };
	try {
		const edgeUrl = `${url.replace(/\/+$/, '')}/functions/v1/vci-prices`;
		const res = await fetch(edgeUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${anonKey}`,
			},
			body: JSON.stringify({ mode: 'eod', days: 5 }),
		});
		if (!res.ok) return { ok: false, error: `Edge HTTP ${res.status}` };
		return { ok: true, result: await res.json() };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

// ─── Cleanup price_history > 90 ngày ─────────────────────────────────
async function runCleanupHistory(supabase: ServiceClient): Promise<{ ok: boolean; deleted?: number; error?: string }> {
	const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
	try {
		const { error, count } = await supabase
			.from('price_history')
			.delete({ count: 'exact' })
			.lt('trade_date', cutoff);
		if (error) return { ok: false, error: error.message };
		return { ok: true, deleted: count ?? 0 };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

// ─── HANDLER ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
	const authErr = verifyCronSecret(request);
	if (authErr) return authErr;

	const now = new Date();
	const supabase = getServiceClient();
	const vnDate = new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Asia/Ho_Chi_Minh',
	}).format(now); // YYYY-MM-DD

	// Cron đã giới hạn T2–T6; chỉ chặn Telegram nếu chạy thủ công vào cuối tuần.
	const vnDay = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })).getDay();
	const isWeekend = vnDay === 0 || vnDay === 6;

	// 1) User có giao dịch (để snapshot)
	const { data: txUsers, error: usersErr } = await supabase
		.from('transactions').select('user_id').limit(1000);
	if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
	const userIds = [...new Set((txUsers ?? []).map((r) => r.user_id as string))];

	// 2) Telegram settings (bật + notify_daily) → map theo user_id
	const telegramByUser = new Map<string, TelegramSettingRow>();
	if (!isWeekend) {
		const { data: settingsRows } = await supabase
			.from('telegram_settings').select('*')
			.eq('is_enabled', true).eq('notify_daily', true);
		for (const row of (settingsRows ?? []) as TelegramSettingRow[]) {
			telegramByUser.set(row.user_id, row);
			if (!userIds.includes(row.user_id)) userIds.push(row.user_id);
		}
	}

	// 3) VN-Index fetch 1 lần dùng chung mọi tin nhắn
	let vnIndex: QuoteDebugItem | null = null;
	if (telegramByUser.size > 0) {
		const { debug } = await fetchPricesWithDebug(['VNINDEX']);
		vnIndex = debug?.[0] ?? null;
	}

	// 4) Mỗi user xử lý song song (fetch giá 1 lần bên trong processUser)
	const results = await Promise.allSettled(
		userIds.map(async (uid) => {
			const setting = telegramByUser.get(uid) ?? null;
			let telegram: { setting: TelegramSettingRow; email: string; vnIndex: QuoteDebugItem | null } | null = null;
			if (setting) {
				const { data: userData } = await supabase.auth.admin.getUserById(uid);
				const email = userData.user?.email ?? 'user@lcta.local';
				telegram = { setting, email, vnIndex };
			}
			return { uid, ...(await processUser(supabase, uid, vnDate, now, telegram)) };
		}),
	);

	let snapOk = 0, snapFail = 0, sent = 0;
	const details: Array<{ user_id: string; snapshot: string; telegram: string }> = [];
	results.forEach((r, i) => {
		if (r.status === 'fulfilled') {
			const v = r.value;
			if (v.snapshot === 'ok' || v.snapshot.startsWith('skip')) snapOk++; else snapFail++;
			if (v.telegram === 'sent') sent++;
			details.push({ user_id: v.uid, snapshot: v.snapshot, telegram: v.telegram });
		} else {
			snapFail++;
			details.push({ user_id: userIds[i], snapshot: `rejected:${String(r.reason)}`, telegram: 'skip' });
		}
	});

	// 5) EOD history + cleanup (song song, sau cùng)
	const [eodResult, cleanupResult] = await Promise.allSettled([
		runEodHistory(),
		runCleanupHistory(supabase),
	]);

	return NextResponse.json({
		ran_at: now.toISOString(),
		date: vnDate,
		weekend: isWeekend,
		users: userIds.length,
		snapshot: { ok: snapOk, failed: snapFail },
		telegram: { enabled: telegramByUser.size, sent },
		details,
		eod_history: eodResult.status === 'fulfilled' ? eodResult.value : { ok: false, error: String(eodResult.reason) },
		cleanup: cleanupResult.status === 'fulfilled' ? cleanupResult.value : { ok: false, error: String(cleanupResult.reason) },
	});
}
