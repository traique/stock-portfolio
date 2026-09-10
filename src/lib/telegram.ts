import {
	calcCashSummary,
	calcPosition,
	calcSummary,
	derivePortfolio,
	Transaction,
	CashTransaction,
	PortfolioSettings,
	PriceMap,
} from '@/lib/calculations';

export type TelegramSettingRow = {
	user_id: string;
	chat_id: string;
	is_enabled: boolean;
	notify_daily: boolean;
	notify_threshold: boolean;
	threshold_pct: number;
	daily_hour_utc: number;
	last_daily_sent_at: string | null;
	last_alert_key: string | null;
	last_alert_sent_at: string | null;
};

export type QuoteDebugItem = {
	symbol: string;
	price: number;
	change: number;
	pct: number;
};

// ── Telegram limits / helpers ─────────────────────────────────────────
const TELEGRAM_HARD_LIMIT = 4096; // giới hạn cứng của Telegram
const CHUNK_LIMIT = 3500; // chừa biên an toàn cho thẻ HTML
const SEND_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Escape các ký tự đặc biệt cho parse_mode HTML. CHỈ dùng cho dữ liệu động
// (email, mã CK…), KHÔNG áp lên các thẻ <b> do code tự thêm.
export function escapeHtml(value: string): string {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

// Cắt message dài thành nhiều phần ≤ limit, ưu tiên cắt theo dòng để không
// vỡ giữa một dòng. Dòng quá dài (hiếm) sẽ bị cắt cứng.
export function splitIntoChunks(text: string, limit = CHUNK_LIMIT): string[] {
	if (text.length <= limit) return [text];
	const lines = text.split('\n');
	const chunks: string[] = [];
	let current = '';
	for (const line of lines) {
		if (line.length > limit) {
			if (current) { chunks.push(current); current = ''; }
			for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
			continue;
		}
		if (current.length + line.length + 1 > limit) {
			chunks.push(current);
			current = line;
		} else {
			current = current ? current + '\n' + line : line;
		}
	}
	if (current) chunks.push(current);
	return chunks;
}

export function formatVnd(value: number) {
	return new Intl.NumberFormat('vi-VN', {
		style: 'currency',
		currency: 'VND',
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0);
}

export function formatPrice(value: number) {
	return new Intl.NumberFormat('vi-VN', {
		maximumFractionDigits: 0,
	}).format(Number.isFinite(value) ? value : 0);
}

export function formatPct(value: number) {
	const safe = Number.isFinite(value) ? value : 0;
	return `${safe > 0 ? '+' : safe < 0 ? '' : ''}${safe.toFixed(2)}%`;
}

function formatUpdatedTime(date = new Date()) {
	return new Intl.DateTimeFormat('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		hour: '2-digit',
		minute: '2-digit',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(date);
}

// POST một phần message (đã có timeout bằng AbortController).
async function postTelegram(token: string, chatId: string, text: string) {
	const url = 'https://api.telegram.org/bot' + token + '/sendMessage';
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: chatId,
				text,
				parse_mode: 'HTML',
				disable_web_page_preview: true,
			}),
			cache: 'no-store',
			signal: controller.signal,
		});
		const payload = await response.json().catch(() => null);
		return { response, payload };
	} finally {
		clearTimeout(timer);
	}
}

// Gửi 1 phần với retry: lỗi mạng/timeout/429/5xx ⇒ thử lại;
// lỗi 4xx (sai nội dung HTML, chat_id…) ⇒ ném ngay, không phí lần thử.
async function sendChunkWithRetry(token: string, chatId: string, chunk: string) {
	let lastErr: Error | null = null;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		let response: Response;
		let payload: any = null;
		try {
			const res = await postTelegram(token, chatId, chunk);
			response = res.response;
			payload = res.payload;
		} catch (networkErr) {
			// Lỗi mạng / abort (timeout) ⇒ thử lại
			lastErr = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
			if (attempt < MAX_ATTEMPTS) { await sleep(500 * attempt); continue; }
			break;
		}

		if (response.ok && payload?.ok) return payload;

		const status = response.status;
		const desc = payload?.description || `Telegram send failed (HTTP ${status})`;

		// 4xx (trừ 429) = lỗi nội dung ⇒ không retry
		if (status !== 429 && status < 500) throw new Error(desc);

		lastErr = new Error(desc);
		const retryAfter = Number(payload?.parameters?.retry_after ?? 0);
		if (attempt < MAX_ATTEMPTS) {
			await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * attempt);
		}
	}
	throw lastErr ?? new Error('Telegram send failed');
}

// Gửi message — tự chunk nếu vượt giới hạn, gửi tuần tự để giữ đúng thứ tự.
export async function sendTelegramMessage(chatId: string, text: string) {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');

	const chunks = splitIntoChunks(text, CHUNK_LIMIT);
	const payloads: unknown[] = [];
	for (const chunk of chunks) {
		payloads.push(await sendChunkWithRetry(token, chatId, chunk));
	}
	return payloads;
}

export function buildDailyMessage(
	email: string,
	transactions: Transaction[],
	cashTransactions: CashTransaction[],
	portfolioSettings: PortfolioSettings | null,
	prices: PriceMap,
	quotes: QuoteDebugItem[],
	vnIndex?: QuoteDebugItem | null,
) {
	const { positions, realizedSummary } = derivePortfolio(transactions);
	const summary = calcSummary(positions, prices);
	const realized = realizedSummary;
	const cash = calcCashSummary(cashTransactions, transactions, portfolioSettings);
	const quoteMap = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));

	const totalCapital = cash.netCapital;
	const actualNav = cash.actualCash;
	const marketValue = summary.totalNow;
	const totalAssets = actualNav + marketValue;
	const totalPnl = totalAssets - totalCapital;
	const dayPnl = positions.reduce((sum, position) => {
		const quote = quoteMap.get(position.symbol.toUpperCase());
		const change = Number(quote?.change || 0);
		return sum + change * Number(position.quantity || 0);
	}, 0);
	const totalPnlPct = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;

	const rows = positions
		.map((position) => {
			const row = calcPosition(position, prices);
			const quote = quoteMap.get(position.symbol.toUpperCase());
			return {
				symbol: position.symbol,
				quantity: Number(position.quantity || 0),
				price: Number(quote?.price || row.now || 0),
				dayPct: Number(quote?.pct || 0),
				pnl: Number(row.pnl || 0),
				pnlPct: Number(row.pnlPct || 0),
			};
		})
		.sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true }));

	const lines = [
		`📊 <b>Tổng kết</b>`,
		``,
		`👤 ${escapeHtml(email.split('@')[0])}`,
		`Tổng vốn: <b>${formatVnd(totalCapital)}</b>`,
		`NAV thực tế: <b>${formatVnd(actualNav)}</b>`,
		`Giá trị thị trường: <b>${formatVnd(marketValue)}</b>`,
		`Tổng tài sản: <b>${formatVnd(totalAssets)}</b>`,
		`Tổng lãi/lỗ: <b>${totalPnl >= 0 ? '+' : ''}${formatVnd(totalPnl)}</b> (${formatPct(totalPnlPct)})`,
		`Lãi/lỗ trong ngày: <b>${dayPnl >= 0 ? '+' : ''}${formatVnd(dayPnl)}</b>`,
		`Lãi/lỗ cổ phiếu đang giữ: <b>${summary.totalPnl >= 0 ? '+' : ''}${formatVnd(summary.totalPnl)}</b>`,
		`Lãi/lỗ đã chốt: <b>${realized.totalRealizedPnl >= 0 ? '+' : ''}${formatVnd(realized.totalRealizedPnl)}</b>`,
	];

	if (vnIndex && Number.isFinite(vnIndex.price)) {
		lines.push(`VN-Index: <b>${formatPrice(vnIndex.price)}</b> (${formatPct(vnIndex.pct)})`);
	}

	if (rows.length) {
		lines.push('', `Chi tiết vị thế:`);
		rows.forEach((row) => {
			const marker = row.pnl >= 0 ? '📈' : '📉';
			lines.push(
				`${marker} <b>${escapeHtml(row.symbol)}</b> (${row.quantity}): ${formatPrice(row.price)} (${formatPct(row.dayPct)}) · ${row.pnl >= 0 ? '+' : ''}${formatVnd(row.pnl)} (${formatPct(row.pnlPct)})`,
			);
		});
	}

	lines.push('', `🕒 Cập nhật: <b>${formatUpdatedTime()}</b>`);
	return lines.join('\n');
}

// ⚠️ FIX (đã có từ trước): bỏ khóa theo giờ, chỉ chống gửi TRÙNG trong cùng
// một ngày (theo lịch VN). Giữ tham số _dailyHourUtc để không phải sửa nơi gọi.
export function shouldSendDaily(
	lastDailySentAt: string | null,
	now: Date,
	_dailyHourUtc?: number,
) {
	void _dailyHourUtc;
	if (!lastDailySentAt) return true;
	const vnDate = (d: Date) =>
		new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
	return vnDate(new Date(lastDailySentAt)) !== vnDate(now);
}
