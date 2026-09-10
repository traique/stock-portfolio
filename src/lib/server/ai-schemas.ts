// src/lib/server/ai-schemas.ts
//
// Schema xác thực OUTPUT của LLM (không bao giờ tin LLM trả đúng định dạng/nghiệp vụ).
// Nếu parse fail → caller dùng fallback. Nếu parse ok → vẫn enforce ràng buộc tiền thật.

import { z } from 'zod';

// ─── Helper: khoan dung các "lỗi ngây thơ" rất phổ biến ở model nhỏ/free (Groq) ──
//
// JSON hợp lệ nhưng KHÔNG khớp schema (ví dụ "confidence": "Medium" thay vì
// "MEDIUM", hay "risks": null thay vì []) trước đây làm FAIL TOÀN BỘ object —
// dù dữ liệu về cơ bản vẫn dùng được. Các helper dưới đây chuẩn hoá trước khi
// validate thật, để không loại bỏ data tốt chỉ vì model viết hoa/thường khác ý.

function caseInsensitiveEnum<T extends string>(values: readonly T[]) {
	return z.preprocess(
		(v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
		z.enum(values as [T, ...T[]]),
	);
}

// null/undefined → [] (model hay trả null thay vì mảng rỗng); 1 string đơn → bọc thành mảng
function lenientStringArray() {
	return z.preprocess(
		(v) => {
			if (v == null) return [];
			if (typeof v === 'string') return [v];
			return v;
		},
		z.array(z.string()),
	);
}

// null/undefined → [] cho mảng object (actions/picks)
function lenientArray<T extends z.ZodTypeAny>(schema: T) {
	return z.preprocess((v) => (v == null ? [] : v), z.array(schema));
}

// ─── Portfolio insights ───────────────────────────────────────────────
export const aiActionSchema = z.object({
	symbol: z.string().min(1),
	action: caseInsensitiveEnum(['BUY', 'HOLD', 'REDUCE', 'SELL', 'WATCH']),
	reason: z.string().min(8),
	confidence: caseInsensitiveEnum(['LOW', 'MEDIUM', 'HIGH']),
	tp: z.coerce.number().positive().optional().catch(undefined), // model đôi khi trả "21900" (string)
	sl: z.coerce.number().positive().optional().catch(undefined),
});

export const aiPortfolioResponseSchema = z.object({
	summary: z.string().min(1),
	actions: lenientArray(aiActionSchema).default([]),
	risks: lenientStringArray().default([]),
});
export type AiPortfolioParsed = z.infer<typeof aiPortfolioResponseSchema>;

// ─── Watchlist scan ───────────────────────────────────────────────────
export const watchlistPickSchema = z.object({
	symbol: z.string().min(1),
	score: z.coerce.number(),
	reason: z.string().min(8),
	entry: z.coerce.number().positive(),
	tp: z.coerce.number().positive(),
	sl: z.coerce.number().positive(),
	time_sensitivity: z.string().optional(),
	position_advice: z.object({
		no_position: z.string(),
		has_position: z.string(),
	}).optional(),
	action_checklist: z.array(z.string()).optional(),
	sniper_points: z.object({
		ideal_buy: z.string(),
		secondary_buy: z.string(),
		stop_loss: z.string(),
		take_profit: z.string(),
	}).optional(),
	trend_score: z.coerce.number().optional(),
	bias_status: z.string().optional(),
	ma_alignment: z.string().optional(),
}).passthrough(); // cho phép field phụ mozy lessons

export const watchlistResponseSchema = z.object({
	summary: z.string().min(1),
	picks: lenientArray(watchlistPickSchema).default([]),
	avoid: lenientStringArray().default([]),
});
export type WatchlistParsed = z.infer<typeof watchlistResponseSchema>;

// ─── Parse sniper_points text để extract giá + clamp ──────────────────────────────
//
// LLM trả format: "72.460 (dưới đáy tích lũy)" — tách số ra, clamp, rồi trả lại cùng text gốc.
// Nếu parse fail → giữ nguyên text, không crash.

function extractPriceFromText(text: string): number | null {
	if (!text) return null;
	// Tìm chuỗi số đầu tiên (có thể chứa dấu . hoặc , làm phân nghìn)
	const match = text.match(/[\d,.]+/);
	if (!match) return null;
	// Giá cổ phiếu VN luôn là SỐ NGUYÊN (không có phần thập phân thật) → coi MỌI
	// dấu . và , đều là phân nghìn, không cố diễn giải thập phân (tránh nhầm
	// "80,000" kiểu quốc tế = 80 nghìn với "80,5" kiểu VN = 80.5 — model có thể
	// trộn lẫn 2 convention, xử lý nước đôi rủi ro hơn là quy về 1 quy tắc).
	const digitsOnly = match[0].replace(/[,.]/g, '');
	const num = parseInt(digitsOnly, 10);
	return Number.isFinite(num) && num > 0 ? num : null;
}

export function enforceAndClampSniperPoints<
	T extends { sniper_points?: { stop_loss?: string; take_profit?: string } }
>(item: T, ref: number): T {
	if (!item.sniper_points || ref <= 0) return item;
	const sp = item.sniper_points;
	const out = { ...item, sniper_points: { ...sp } };

	// Parse + clamp stop_loss (phải < ref)
	if (typeof sp.stop_loss === 'string') {
		const slPrice = extractPriceFromText(sp.stop_loss);
		if (slPrice !== null && slPrice >= ref) {
			// Giá SL trong text vô lý (>= ref) → cập nhật số trong text, giữ lý do cũ
			const newSL = Math.round(ref * 0.95);
			out.sniper_points.stop_loss = sp.stop_loss.replace(/[\d,.]+/, String(newSL));
		}
	}

	// Parse + clamp take_profit (phải > ref)
	if (typeof sp.take_profit === 'string') {
		const tpPrice = extractPriceFromText(sp.take_profit);
		if (tpPrice !== null && tpPrice <= ref) {
			const newTP = Math.round(ref * 1.05);
			out.sniper_points.take_profit = sp.take_profit.replace(/[\d,.]+/, String(newTP));
		}
	}

	return out;
}

// ─── Enforce ràng buộc TP/SL server-side ──────────────────────────────
//
// Quy tắc cứng (không bao giờ để LLM phá): sl < giá tham chiếu < tp.
// `ref` = avgBuyPrice (portfolio) hoặc entry/currentPrice (watchlist).

export function enforceTpSl<T extends { tp?: number; sl?: number }>(
	item: T,
	ref: number,
): T {
	if (ref <= 0) return item;
	const out: T = { ...item };

	if (typeof out.tp === 'number') out.tp = Math.max(out.tp, Math.round(ref * 1.001));
	if (typeof out.sl === 'number') out.sl = Math.min(out.sl, Math.round(ref * 0.999));

	// Phòng trường hợp degenerate sau khi clamp (tp <= sl)
	if (typeof out.tp === 'number' && typeof out.sl === 'number' && out.tp <= out.sl) {
		out.tp = Math.round(ref * 1.05);
		out.sl = Math.round(ref * 0.95);
	}
	return out;
}
