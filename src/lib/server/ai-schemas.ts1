// src/lib/server/ai-schemas.ts
//
// Schema xác thực OUTPUT của LLM (không bao giờ tin LLM trả đúng định dạng/nghiệp vụ).
// Nếu parse fail → caller dùng fallback. Nếu parse ok → vẫn enforce ràng buộc tiền thật.

import { z } from 'zod';

// ─── Portfolio insights ───────────────────────────────────────────────
export const aiActionSchema = z.object({
	symbol: z.string().min(1),
	action: z.enum(['BUY', 'HOLD', 'REDUCE', 'SELL', 'WATCH']),
	reason: z.string().min(8),
	confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
	tp: z.number().positive().optional(),
	sl: z.number().positive().optional(),
});

export const aiPortfolioResponseSchema = z.object({
	summary: z.string().min(1),
	actions: z.array(aiActionSchema).default([]),
	risks: z.array(z.string()).default([]),
});
export type AiPortfolioParsed = z.infer<typeof aiPortfolioResponseSchema>;

// ─── Watchlist scan ───────────────────────────────────────────────────
export const watchlistPickSchema = z.object({
	symbol: z.string().min(1),
	score: z.number(),
	reason: z.string().min(8),
	entry: z.number().positive(),
	tp: z.number().positive(),
	sl: z.number().positive(),
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
	trend_score: z.number().optional(),
	bias_status: z.string().optional(),
	ma_alignment: z.string().optional(),
}).passthrough(); // cho phép field phụ mozy lessons

export const watchlistResponseSchema = z.object({
	summary: z.string().min(1),
	picks: z.array(watchlistPickSchema).default([]),
	avoid: z.array(z.string()).default([]),
});
export type WatchlistParsed = z.infer<typeof watchlistResponseSchema>;

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
