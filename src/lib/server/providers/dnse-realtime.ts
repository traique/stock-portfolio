import type { MarketData } from './yahoo';

const DNSE_OHLC_URL = 'https://services.entrade.com.vn/chart-api/v2/ohlcs/stock';
const PRICE_SCALE = 1000; // DNSE trả nghìn đồng cho CỔ PHIẾU → ×1000 = VND thô
const REQUEST_TIMEOUT_MS = 8000;
const CONCURRENCY = 6;

// Chỉ số (index) trả thẳng theo điểm → KHÔNG nhân 1000
function isIndexSymbol(sym: string): boolean {
	const u = sym.toUpperCase().replace(/[-^]/g, '');
	return ['VNINDEX', 'VN30', 'HNXINDEX', 'HNX30', 'UPCOMINDEX', 'UPINDEX'].includes(u);
}

function dnseSymbol(sym: string): string {
	const s = sym.toUpperCase();
	return s === 'VNINDEX' || s === '^VNINDEX' || s === 'VN-INDEX' ? 'VNINDEX' : s;
}

// unix giây → ngày theo giờ VN (YYYY-MM-DD) để gom theo phiên
function vnDate(unixSec: number): string {
	return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
		new Date(unixSec * 1000),
	); // sv-SE cho định dạng "YYYY-MM-DD"
}

async function fetchWithTimeout(url: string, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	try {
		return await fetch(url, { cache: 'no-store', signal: ctrl.signal });
	} finally {
		clearTimeout(timer);
	}
}

/** Giá near-realtime (nến 1 phút) + ref/high/low/volume cho 1 mã từ DNSE. */
async function getDnseOne(symbol: string): Promise<MarketData | null> {
	const sym = symbol.toUpperCase();
	const scale = isIndexSymbol(sym) ? 1 : PRICE_SCALE;

	const to = Math.floor(Date.now() / 1000);
	const from = to - 6 * 86400; // ~6 ngày → chắc chắn có phiên hôm nay + phiên trước (qua cuối tuần)

	const url =
		`${DNSE_OHLC_URL}?symbol=${encodeURIComponent(dnseSymbol(sym))}` +
		`&from=${from}&to=${to}&resolution=1`; // nến 1 phút

	try {
		const res = await fetchWithTimeout(url);
		if (!res.ok) return null;
		const json = await res.json();

		const t: number[] = Array.isArray(json?.t) ? json.t.map(Number) : [];
		const c: number[] = Array.isArray(json?.c) ? json.c.map(Number) : [];
		const h: number[] = Array.isArray(json?.h) ? json.h.map(Number) : [];
		const l: number[] = Array.isArray(json?.l) ? json.l.map(Number) : [];
		const v: number[] = Array.isArray(json?.v) ? json.v.map(Number) : [];
		if (!c.length) return null;

		// Giá hiện tại = close hợp lệ cuối cùng
		let lastIdx = -1;
		for (let i = c.length - 1; i >= 0; i--) {
			if (Number.isFinite(c[i]) && c[i] > 0) {
				lastIdx = i;
				break;
			}
		}
		if (lastIdx === -1) return null;

		const price = c[lastIdx] * scale;
		const lastDate = vnDate(t[lastIdx]);

		// Gom nến theo phiên: high/low/volume của phiên hôm nay + close của phiên trước (ref)
		let dayHigh = 0;
		let dayLow = Number.POSITIVE_INFINITY;
		let dayVol = 0;
		let previousClose = 0;

		for (let i = lastIdx; i >= 0; i--) {
			const d = vnDate(t[i]);
			if (d === lastDate) {
				if (Number.isFinite(h[i]) && h[i] > 0) dayHigh = Math.max(dayHigh, h[i]);
				if (Number.isFinite(l[i]) && l[i] > 0) dayLow = Math.min(dayLow, l[i]);
				if (Number.isFinite(v[i]) && v[i] >= 0) dayVol += v[i];
			} else {
				// Đi ngược: nến đầu tiên thuộc phiên KHÁC = close cuối phiên trước
				if (Number.isFinite(c[i]) && c[i] > 0) previousClose = c[i] * scale;
				break;
			}
		}

		const ref = previousClose > 0 ? previousClose : price;
		const change = price - ref;
		const pct = ref > 0 ? (change / ref) * 100 : 0;

		return {
			symbol: sym,
			ticker: sym,
			provider: 'dnse',
			price,
			previousClose: ref,
			change,
			pct,
			ceilingPriceEstimate: 0, // DNSE không trả trần/sàn → để 0
			floorPriceEstimate: 0,
			dayHigh: dayHigh > 0 ? dayHigh * scale : price,
			dayLow: Number.isFinite(dayLow) && dayLow > 0 ? dayLow * scale : price,
			marketTime: t[lastIdx] ? t[lastIdx] * 1000 : null,
			currency: 'VND',
			volume: dayVol,
		};
	} catch {
		return null;
	}
}

/** Lấy giá realtime nhiều mã từ DNSE, giới hạn concurrency. Key = symbol đầu vào. */
export async function getDnseEdgeBatch(symbols: string[]): Promise<Map<string, MarketData>> {
	const out = new Map<string, MarketData>();
	let cursor = 0;

	async function worker() {
		while (cursor < symbols.length) {
			const sym = symbols[cursor++];
			const data = await getDnseOne(sym);
			if (data) out.set(sym, { ...data, symbol: sym, ticker: sym });
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, () => worker()),
	);
	return out;
}
