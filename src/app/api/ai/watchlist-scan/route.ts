// src/app/api/ai/watchlist-scan/route.ts
//
// PATCHED — Tích hợp Phase 1 + 2 + 3:
// Phase 1: buildEnhancedIndicators, scoreEnhancedIndicators, buildIndicatorSummary
// Phase 2: buildSectorContext, buildSectorPromptSection (sector rotation)
//          analyzeForeignFlow, calcMarketBreadth, calcOBVTrend, calcMFI (money flow)
// Phase 3: buildEarningsCalendar, buildEarningsPromptSection (KQKD)
//          buildOptimizationResult, buildOptimizationPromptSection (portfolio)
//
// Thay đổi so với route.ts gốc:
// 1. buildEnhancedSignals() thay thế buildTechnicalSignals() — thêm indicators Phase 1
// 2. buildEnrichedContext() bổ sung sector + money flow + earnings cho mỗi mã
// 3. buildEnhancedSystemPrompt() mở rộng framework phân tích
// 4. trimPayloadForAI() giữ nguyên logic cũ + thêm enhanced fields
//
// ✨ FIX 413: giảm AI_MAX_CANDIDATES + cắt ngắn context blocks để body không vượt giới hạn Groq.
//
// Để dễ review: tất cả thay đổi có comment "// ✨ PHASE X" bên cạnh.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTechnicalSignals, callAiWithFallback, TechnicalSignal } from '@/lib/server/ai-insights';
import { isValidModelKey, DEFAULT_MODEL } from '@/lib/server/ai-models';
import { getBearerToken, validationErrorResponse } from '@/lib/server/api-utils';
import { getSupabaseUserClient } from '@/lib/server/supabase-user';
import { logger } from '@/lib/server/logger';
import { buildAiCacheMeta, checkAiRateLimit, getAiCache, getRateLimitResetSeconds, setAiCache } from '@/lib/server/ai-cache';

// ✨ PHASE 1 — Enhanced technical indicators
import {
  buildEnhancedIndicators,
  scoreEnhancedIndicators,
  buildIndicatorSummary,
  calcSupportResistance,
  calcBiasMA,
  calcMAAlignment,
  calcTrendScore,
  type EnhancedIndicators,
  type SupportResistance,
  type BiasMA,
  type MAAlignment,
} from '@/lib/server/technical-indicators';

// ✨ PHASE 2A — Sector rotation
import {
  buildSectorContext,
  buildSectorPromptSection,
  getSymbolSectors,
  type SectorContext,
} from '@/lib/server/sector-analyzer';

// ✨ PHASE 2B — Money flow
import {
  analyzeForeignFlow,
  calcMarketBreadth,
  calcOBVTrend,
  calcMFI,
  buildMoneyFlowPromptSection,
  type ForeignFlow,
  type MarketBreadth,
} from '@/lib/server/money-flow';

// ✨ PHASE 3A — Earnings
import {
  buildEarningsCalendar,
  buildEarningsPromptSection,
} from '@/lib/server/earnings-analyzer';

// ✨ PHASE 3B — Portfolio optimization
import {
  buildOptimizationResult,
  buildOptimizationPromptSection,
} from '@/lib/server/portfolio-optimizer';

// ─── Schema ─────────────────────────────────────────────────────

const bodySchema = z.object({
  symbols: z.array(z.string().trim().transform(s => s.toUpperCase())).min(1).max(60),
  risk_profile: z.enum(['conservative', 'balanced', 'aggressive']).optional().default('balanced'),
  force_refresh: z.boolean().optional(),
  model: z.string().optional(),
  // ✨ mozy lesson 3 — pipeline mode
  pipeline_mode: z.enum(['intraday', 'eod']).optional().default('eod'),
  // ✨ PHASE 2B — Dùng để tính market breadth
  pct_changes: z.record(z.string(), z.number()).optional(),
  // ✨ PHASE 3B — Positions để tính portfolio optimization
  positions: z.array(z.object({ symbol: z.string(), value: z.number() })).optional(),
});

type RiskProfile = z.infer<typeof bodySchema>['risk_profile'];

// ─── Types ─────────────────────────────────────────────────────

type WatchlistPick = {
  symbol: string;
  score: number;
  reason: string;
  entry: number;
  tp: number;
  sl: number;
  // ✨ mozy lesson 1 — richer decision schema
  time_sensitivity?: string;
  position_advice?: { no_position: string; has_position: string };
  action_checklist?: string[];
  sniper_points?: { ideal_buy: string; secondary_buy: string; stop_loss: string; take_profit: string };
  // ✨ mozy lesson 4+5
  trend_score?: number;
  bias_status?: string;
  ma_alignment?: string;
  support?: number | null;
  resistance?: number | null;
};

type WatchlistScanResponse = {
  summary: string;
  picks: WatchlistPick[];
  avoid: string[];
  newsContext?: Record<string, TechnicalSignal['news']>;
  ai_fallback?: boolean;
  ai_fallback_reason?: string;
  ai_model_used?: string;
};

// ✨ PHASE 1 — Extended context item
type WatchlistContextItem = {
  symbol: string;
  currentPrice: number;
  score: number;
  technical: {
    trend3mPct: number;
    momentumPct: number;
    volatilityPct: number;
    volumeTrendPct: number;
    relativeStrength: number;
    rsi14: number;
    // ✨ PHASE 1 additions:
    enhanced?: EnhancedIndicators;
    enhancedScore?: number; // điểm bổ sung từ indicators mới
    indicatorSummary?: string; // text mô tả cho AI
  };
  news: TechnicalSignal['news'];
  suggestedTp: number;
  suggestedSl: number;
  // ✨ PHASE 2A:
  sectorPrompt?: string;
  // ✨ PHASE 2B:
  moneyFlowPrompt?: string;
  // ✨ PHASE 3A:
  earningsPrompt?: string;
  // ✨ PHASE 3B:
  optimizationPrompt?: string;
  // ✨ mozy lessons:
  supportResistance?: SupportResistance;
  biasMA?: BiasMA;
  maAlignment?: MAAlignment;
  trendScore?: number;
};

// ─── Constants ───────────────────────────────────────────────

const WATCHLIST_AI_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const CACHE_VERSION = 'v6'; // ✨ bump version khi thay đổi format
const MAX_SYMBOLS = 60;
const SCORE_BASE = 50;
const AVOID_THRESHOLD = 45;
const TOP_PICKS = 5;
const AI_MAX_CANDIDATES = 12;      // ✨ FIX 413: từ 20 — giảm số mã gửi AI
const AI_MAX_NEWS_PER_SYMBOL = 2;  // ✨ FIX 413: từ 3

// ─── Helpers (giữ nguyên từ route.ts gốc) ────────────────────────────

function buildWatchlistCacheKey(userId: string, riskProfile: string, symbols: string[]): string {
  return `ai:watchlist:${CACHE_VERSION}:${userId}:${riskProfile}:${symbols.join(',')}`;
}

function scoreSignal(s: TechnicalSignal): number {
  const trendScore = Math.max(-20, Math.min(20, s.trend3mPct));
  const momentumScore = Math.max(-15, Math.min(15, s.momentumPct * 1.5));
  const volumeScore = Math.max(-15, Math.min(15, s.volumeTrendPct * 0.5));
  const newsScore = s.news.length > 0 ? 5 : 0;
  const volPenalty = s.volatilityPct * 0.5;
  return Number((SCORE_BASE + trendScore + momentumScore + volumeScore + newsScore - volPenalty).toFixed(2));
}

// ─── ✨ PHASE 1 — buildEnhancedContext ───────────────────────────────
//
// Sau khi có signals từ buildTechnicalSignals(), tính thêm:
//   • Enhanced indicators per symbol (từ close[])
//   • Sector context (shared — gọi 1 lần cho cả batch)
//   • Money flow per symbol (foreign + OBV/MFI)
//   • Earnings per symbol
//   • Portfolio optimization (shared — gọi 1 lần)

async function buildEnhancedContext(
  signals: TechnicalSignal[],
  pctChanges: Record<string, number> = {},
  positions: Array<{ symbol: string; value: number }> = [],
): Promise<WatchlistContextItem[]> {

  // ── Phase 2A: Sector context (batch, 1 call) ──
  const allSectors = [...new Set(signals.flatMap(s => getSymbolSectors(s.symbol)))];
  let sectorCtx: SectorContext | null = null;
  try {
    sectorCtx = await buildSectorContext(allSectors);
  } catch (e) {
    logger.warn('[watchlist-scan] sector context failed:', { error: String(e) });
  }

  // ── Phase 3B: Portfolio optimization (batch, 1 call) ──
  let optResult = null;
  if (positions.length >= 2) {
    // Build closesMap từ closes[] đã expose trong TechnicalSignal
    const closesMap: Record<string, number[]> = Object.fromEntries(
      signals.map(s => [s.symbol, (s as TechnicalSignal & { closes: number[] }).closes ?? []])
    );
    try {
      optResult = buildOptimizationResult(positions, closesMap);
    } catch (e) {
      logger.warn('[watchlist-scan] optimization failed:', { error: String(e) });
    }
  }

  // ── Per-symbol enrichment (parallel) ──
  const enriched = await Promise.allSettled(
    signals.map(async (s): Promise<WatchlistContextItem> => {
      const baseScore = scoreSignal(s);

      // ── Phase 1: Enhanced indicators ──
      // closes[] và volumes[] giờ được expose từ TechnicalSignal (đã patch ai-insights.ts)
      let enhanced: EnhancedIndicators | undefined;
      let enhancedScore = 0;
      let indicatorSummary = '';
      const closes = (s as TechnicalSignal & { closes: number[] }).closes ?? [];
      const volumes = (s as TechnicalSignal & { volumes: number[] }).volumes ?? [];
      if (closes.length > 20) {
        enhanced = buildEnhancedIndicators(closes, s.currentPrice);
        enhancedScore = scoreEnhancedIndicators(enhanced);
        indicatorSummary = buildIndicatorSummary(enhanced, s.symbol);
      }

      // ── Phase 2B: Money flow ──
      let foreignFlow: ForeignFlow | null = null;
      let breadth: MarketBreadth | null = null;
      let obvTrend = 0;
      let mfi = 50;
      try {
        foreignFlow = await analyzeForeignFlow(s.symbol);
      } catch { /* non-critical */ }

      // Market breadth: tính từ toàn bộ signals
      if (Object.keys(pctChanges).length > 0) {
        const symList = signals.map(x => x.symbol);
        // build closesMap từ closes[] đã expose
        const closesMap: Record<string, number[]> = Object.fromEntries(
          signals.map(x => [x.symbol, (x as TechnicalSignal & { closes: number[] }).closes ?? []])
        );
        breadth = calcMarketBreadth(symList, pctChanges, closesMap);
      }

      // OBV + MFI từ closes[] và volumes[] thật
      if (closes.length > 5 && volumes.length > 5) {
        obvTrend = calcOBVTrend(closes, volumes);
        mfi = calcMFI(closes, volumes);
      }

      const moneyFlowPrompt = buildMoneyFlowPromptSection(foreignFlow, breadth, obvTrend, mfi, s.symbol);

      // ── ✨ mozy lesson 2: Support/Resistance từ OHLCV thật ──
      const highs = (s as TechnicalSignal & { highs: number[] }).highs ?? [];
      const lows = (s as TechnicalSignal & { lows: number[] }).lows ?? [];
      const supportResistance = highs.length > 0
        ? calcSupportResistance(highs, lows, s.currentPrice, 30)
        : undefined;

      // ── ✨ mozy lesson 4: Bias MA ──
      const maAlign = closes.length >= 20 ? calcMAAlignment(closes) : undefined;
      const biasMA = maAlign ? calcBiasMA(s.currentPrice, maAlign.ma5) : undefined;

      // ── ✨ mozy lesson 5: trendScore tổng hợp ──
      const trendScore = (maAlign && enhanced)
        ? calcTrendScore(maAlign, s.rsi14, enhanced.macd.histogram)
        : undefined;

      // ── Phase 2A: Sector prompt ──
      const sectorPrompt = sectorCtx
        ? buildSectorPromptSection(sectorCtx, s.symbol)
        : '';

      // ── Phase 3A: Earnings ──
      let earningsPrompt = '';
      try {
        const earningsData = await buildEarningsCalendar(s.symbol);
        earningsPrompt = buildEarningsPromptSection(earningsData);
      } catch { /* non-critical */ }

      // ── Phase 3B: Optimization prompt per symbol ──
      const optimizationPrompt = optResult
        ? buildOptimizationPromptSection(optResult, s.symbol)
        : '';

      // ── Final score (base + enhanced bonus) ──
      // ── Final score ──
      // Nếu có trendScore (0-100 từ mozy formula) → blend với baseScore 50/50
      // Nếu chỉ có enhancedScore → cộng vào baseScore (range nhỏ, ±5)
      const finalScore = trendScore !== undefined
        ? Number(((baseScore * 0.4 + trendScore * 0.6) + enhancedScore * 0.5).toFixed(1))
        : Number((baseScore + enhancedScore).toFixed(1));

      return {
        symbol: s.symbol,
        currentPrice: s.currentPrice,
        score: finalScore,
        technical: {
          trend3mPct: s.trend3mPct,
          momentumPct: s.momentumPct,
          volatilityPct: s.volatilityPct,
          volumeTrendPct: s.volumeTrendPct,
          relativeStrength: s.relativeStrength,
          rsi14: s.rsi14,
          enhanced,
          enhancedScore,
          indicatorSummary,
        },
        news: s.news,
        suggestedTp: s.suggestedTp,
        suggestedSl: s.suggestedSl,
        sectorPrompt,
        moneyFlowPrompt,
        earningsPrompt,
        optimizationPrompt,
        // ✨ mozy fields
        supportResistance,
        biasMA,
        maAlignment: maAlign,
        trendScore,
      };
    })
  );

  return enriched.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
}

function buildFallback(context: WatchlistContextItem[]): WatchlistScanResponse {
  return {
    summary: 'Đang dùng dữ liệu dự phòng. Quét kỹ thuật dựa trên Trend, Momentum và Tin tức.',
    picks: context.slice(0, TOP_PICKS).map(s => ({
      symbol: s.symbol,
      score: s.score,
      reason: `Score: ${s.score} | Trend: ${s.technical.trend3mPct.toFixed(1)}% | Dòng tiền: ${s.technical.volumeTrendPct > 0 ? 'Vào' : 'Cạn'}`,
      entry: s.currentPrice,
      tp: s.suggestedTp,
      sl: s.suggestedSl,
    })),
    avoid: context.filter(r => r.score < AVOID_THRESHOLD).map(r => r.symbol),
  };
}

// ─── ✨ Trim payload — thêm enhanced fields + chống payload quá lớn (HTTP 413) ──

// Cắt chuỗi context dài để giảm body gửi Groq. Trả undefined nếu rỗng.
function truncate(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const t = text.trim();
  if (!t) return undefined;
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

function trimPayloadForAI(context: WatchlistContextItem[]) {
  // Ưu tiên mã điểm cao nhất → khi cắt còn AI_MAX_CANDIDATES vẫn là top mã đáng xem
  const ranked = [...context].sort((a, b) => b.score - a.score);

  return ranked.slice(0, AI_MAX_CANDIDATES).map(s => ({
    symbol: s.symbol,
    currentPrice: s.currentPrice,
    score: s.score,
    technical: {
      // Fields gốc
      trend3mPct: s.technical.trend3mPct,
      momentumPct: s.technical.momentumPct,
      volatilityPct: s.technical.volatilityPct,
      volumeTrendPct: s.technical.volumeTrendPct,
      relativeStrength: s.technical.relativeStrength,
      rsi14: s.technical.rsi14,
      // ✨ Phase 1 — indicator summary (cắt ngắn)
      indicators: truncate(s.technical.indicatorSummary, 220),
    },
    suggestedTp: s.suggestedTp,
    suggestedSl: s.suggestedSl,
    // Pre-calculated sniper fallbacks (dùng khi không có support/resistance)
    sniper_fallback: {
      ideal_buy: s.currentPrice,
      secondary_buy: Math.round(s.currentPrice * 0.97 / 100) * 100,
      stop_loss: s.suggestedSl,
      take_profit: s.suggestedTp,
    },
    news: s.news.slice(0, AI_MAX_NEWS_PER_SYMBOL).map(n => ({
      title: truncate(n.title, 110),
      sentiment: n.sentiment ?? 0,
    })),
    // ✨ Phase 2 + 3 context blocks (cắt ngắn để tránh 413)
    sectorContext: truncate(s.sectorPrompt, 200),
    moneyFlowContext: truncate(s.moneyFlowPrompt, 200),
    earningsContext: truncate(s.earningsPrompt, 200),
    portfolioContext: truncate(s.optimizationPrompt, 200),
    // ✨ mozy lessons — structured fields
    support: s.supportResistance?.support ?? undefined,
    resistance: s.supportResistance?.resistance ?? undefined,
    distToSR: s.supportResistance
      ? { toSupport: s.supportResistance.distToSupport, toResistance: s.supportResistance.distToResistance }
      : undefined,
    biasMA5: s.biasMA
      ? `${s.biasMA.bias > 0 ? '+' : ''}${s.biasMA.bias}% (${s.biasMA.status})`
      : undefined,
    maAlignment: s.maAlignment?.alignment ?? undefined,
    trendScore: s.trendScore ?? undefined,
  }));
}

// ─── ✨ Enhanced system prompt ────────────────────────────────────

function buildSystemPrompt(riskProfile: RiskProfile): string {
  const entryGuide: Record<RiskProfile, string> = {
    conservative: 'Chỉ chọn mã có score > 55, volatility thấp (<8%), và tin tức tích cực rõ ràng. Tối đa 3 picks.',
    balanced: 'Chọn mã có score > 50, cân bằng momentum và vol. Tối đa 5 picks.',
    aggressive: 'Có thể chọn mã score > 45 nếu momentum đang bùng nổ mạnh. Tối đa 7 picks.',
  };

  return `Bạn là chuyên gia phân tích chứng khoán Việt Nam, kết hợp Technical Analysis, Sector Rotation, Dòng tiền và Fundamental (KQKD).
Nhiệm vụ: Từ danh sách watchlist, lọc ra những mã ĐÁNG MUA ngay bây giờ và những mã cần TRÁNH.

KHẨU VỊ RỦI RO: ${riskProfile.toUpperCase()}
${entryGuide[riskProfile]}

=== DỮ LIỆU MỖI MÃ ===
- symbol, currentPrice, score (0-100), suggestedTp / suggestedSl
- technical: trend3mPct, momentumPct, volumeTrendPct, volatilityPct, relativeStrength, rsi14
- technical.indicators: tóm tắt MACD, Bollinger Bands, SMA cross, ADX, multi-timeframe (nếu có)
- support / resistance: vùng hỗ trợ/kháng cự từ OHLCV thật 30 phiên, distToSR (nếu có)
- biasMA5: độ lệch giá vs MA5 và trạng thái (nguy_hiem/canh_giac/an_toan/chiet_khau/qua_ban)
- maAlignment: bullish/bearish/mixed — xếp hàng MA5>MA10>MA20
- trendScore: 0-100 tổng hợp từ MA alignment + RSI + MACD (nếu có)
- sectorContext: performance ngành 1M/3M vs VNINDEX, rotation signal (nếu có)
- moneyFlowContext: khối ngoại mua/bán ròng, OBV trend, MFI, market breadth (nếu có)
- earningsContext: KQKD quý gần nhất (YoY), ngày công bố BCTC tiếp theo (nếu có)
- portfolioContext: tỷ trọng, risk parity suggestion, correlation với mã khác (nếu có)
- news[]: tin tức + sentiment

=== FRAMEWORK PHÂN TÍCH (ưu tiên theo thứ tự) ===

1. SECTOR ROTATION — Đọc sectorContext trước:
   • Ngành đang vào tiền (momentum hot): tăng trọng số tín hiệu mua
   • Ngành đang rút tiền (momentum dump): giảm trọng số, cảnh báo dù kỹ thuật tốt
   • Nếu cả ngành giảm: cần tín hiệu cá biệt rất mạnh mới pick

2. DÒNG TIỀN (moneyFlowContext):
   • Khối ngoại mua ròng mạnh + OBV tăng = xác nhận tích lũy → tăng confidence BUY
   • Khối ngoại bán ròng + OBV giảm = phân phối → cảnh báo SELL/AVOID
   • Market breadth yếu (<40% mã tăng) → tránh mở vị thế mới dù mã tốt

3. TECHNICAL SIGNALS (technical + indicators):
   • MACD bullish crossover + giá trên SMA20 = tín hiệu vào mạnh
   • BB squeeze + MACD dương = sắp breakout → pre-entry alert
   • Golden Cross SMA20/50 = xu hướng trung hạn đảo chiều tốt
   • ADX > 25 = xu hướng đủ mạnh để follow; < 20 = sideway, dễ bẫy
   • Multi-timeframe alignment bullish = giảm rủi ro entry

4. PHASE IDENTIFICATION (VSA):
   • ACCUMULATION: giá ngang + vol thấp → chuẩn bị bùng nổ
   • MARKUP: trend+ + momentum+ + vol+ → đang trong sóng
   • DISTRIBUTION: giá cao + vol nổ nhưng không lên → xả
   • MARKDOWN: trend- + momentum- → tránh

5. EARNINGS / KQKD (earningsContext):
   • EPS +30% YoY trở lên = fundamental tốt → tăng điểm
   • Pre-earnings window (< 15 ngày) = biến động tăng, rủi ro 2 chiều → ghi chú trong reason
   • EPS giảm YoY liên tiếp = warning cơ bản yếu

6. PORTFOLIO FIT (portfolioContext):
   • Nếu mã đã chiếm > 20% portfolio → không nên tăng thêm
   • Correlation cao với mã đang hold → tăng vị thế = không đa dạng hóa thực sự
   • Risk Parity delta âm (nên giảm) → suggest partial profit-taking

=== QUY TẮC TÍNH SCORE (bắt buộc) ===
Score phản ánh đúng tín hiệu kỹ thuật + dòng tiền, KHÔNG bị kéo xuống bởi uncertainty:
- MACD bullish crossover: +15 điểm
- Giá trên SMA20 + MA alignment bullish: +10 điểm
- Khối ngoại mua ròng (foreign buy): +10 điểm
- OBV tăng > 10%: +8 điểm
- Ngành outperform VNINDEX > 3%: +8 điểm
- trendScore từ context (nếu có): dùng trực tiếp làm baseline
- Mỗi ⚠️ risk factor: -5 điểm
Ví dụ: FPT có MACD crossover + SMA20 + khối ngoại mua → score ít nhất 65.

=== QUY TẮC SNIPER POINTS (bắt buộc — VI PHẠM LÀ LỖI) ===
LUÔN dùng số giá thực tế (VND), KHÔNG viết text mô tả thuần.

❌ SAI: ideal_buy: "Vùng hỗ trợ gần"
❌ SAI: stop_loss: "Dưới đáy tích lũy"
✅ ĐÚNG: ideal_buy: "76.400 (vùng hỗ trợ gần)"
✅ ĐÚNG: stop_loss: "72.460 (dưới đáy tích lũy)"

Công thức tính nếu không có support/resistance trong context:
- ideal_buy = currentPrice (làm tròn hàng trăm)
- secondary_buy = currentPrice × 0.97 (làm tròn)
- stop_loss = entry × 0.93 (làm tròn)
- take_profit = tp từ field tp (đã tính sẵn)

=== QUY TẮC ACTION CHECKLIST (bắt buộc) ===
Mỗi mục phải dựa trên DATA THẬT từ context, không được viết generic.

❌ SAI: "✅ Giá trên SMA20" (quá chung, không có số)
❌ SAI: "⚠️ Cân theo dõi biến động ngành" (mọi mã đều viết thế này)
✅ ĐÚNG: "✅ MACD bullish crossover — histogram dương lần đầu sau 3 tuần"
✅ ĐÚNG: "✅ Khối ngoại mua ròng +600 tỷ 5 phiên liên tiếp"
✅ ĐÚNG: "⚠️ Ngành BĐS -10.26% vs VNINDEX 1 tháng — rủi ro ngành cao"
✅ ĐÚNG: "❌ ADX 18 — xu hướng yếu, dễ bẫy"

Mỗi pick cần 3-5 mục, ít nhất 2 mục có số liệu cụ thể từ context.

=== ĐỊNH DẠNG REASON (bắt buộc) ===
Cấu trúc: [Pha N tuần] + [Sector %] + [Dòng tiền cụ thể] + [Technical cụ thể] + [Action]
❌ SAI: "Cổ phiếu có tiềm năng tăng trưởng tốt."
✅ ĐÚNG: "Tích lũy 3 tuần. Công nghệ +4.35% vs VNINDEX. Ngoại mua ròng 600 tỷ/5 phiên, OBV ổn định. MACD crossover + giá trên SMA20. Entry vùng hiện tại, SL -5%."

=== OUTPUT JSON (chỉ trả về JSON, không có text ngoài) ===
{
  "summary": "Tổng quan ngắn: ngành nào đang vào tiền, ngành nào rút, breadth thị trường, 1-2 cơ hội nổi bật",
  "picks": [{
    "symbol": "FPT",
    "score": 68,
    "reason": "Tích lũy 3 tuần. Công nghệ +4.35% vs VNI. Ngoại mua 600 tỷ/5 phiên. MACD crossover + SMA20. Entry hiện tại, SL dưới đáy.",
    "entry": 76400,
    "tp": 80340,
    "sl": 72460,
    "time_sensitivity": "ngay hôm nay",
    "position_advice": {
      "no_position": "Mở vị thế mới tại 76.400, SL 72.460 (-5%), TP 80.340 (+5.2%)",
      "has_position": "Giữ nguyên nếu giá trên 74.000, cân nhắc trailing SL lên 74.000"
    },
    "action_checklist": [
      "✅ MACD bullish crossover — histogram dương lần đầu sau 3 tuần",
      "✅ Khối ngoại mua ròng +600 tỷ 5 phiên liên tiếp",
      "✅ Ngành Công nghệ +4.35% vs VNINDEX tháng này",
      "⚠️ RSI 58 — chưa overbought, còn room tăng",
      "⚠️ Cần volume xác nhận breakout trên 77.000"
    ],
    "sniper_points": {
      "ideal_buy": "76.400 (vùng hỗ trợ gần nhất)",
      "secondary_buy": "74.000 (đáy tích lũy 3 tuần)",
      "stop_loss": "72.460 (dưới đáy tích lũy, -5%)",
      "take_profit": "80.340 (kháng cự mạnh, +5.2%)"
    },
    "trend_score": 68,
    "bias_status": "an_toan",
    "ma_alignment": "bullish"
  }],
  "avoid": ["HPG (phân phối rõ + thép -8% vs VNI)", "MWG (dòng ngoại rút liên tục 10 phiên)"]
}`;
}

// ─── Handler ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseUserClient(token);
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const symbols = [...new Set(parsed.data.symbols)].slice(0, MAX_SYMBOLS).sort();
  const cacheKey = buildWatchlistCacheKey(user.id, parsed.data.risk_profile, symbols);

  if (!parsed.data.force_refresh) {
    const cached = await getAiCache<WatchlistScanResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS) });
    }
  }

  if (!checkAiRateLimit(user.id)) {
    const retryAfter = getRateLimitResetSeconds(user.id);
    logger.warn('[watchlist-scan] Rate limit hit', { userId: user.id, retryAfter });
    return NextResponse.json(
      { error: `Quá nhiều yêu cầu AI. Vui lòng thử lại sau ${retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // ── Build signals + enrich ──
  // ✨ mozy lesson 3 — intraday mode: skip all heavy fetching, return EOD cache or fallback
  if (parsed.data.pipeline_mode === 'intraday') {
    const cachedEod = await getAiCache<WatchlistScanResponse>(cacheKey);
    if (cachedEod) {
      return NextResponse.json({
        ...cachedEod,
        pipeline_mode: 'intraday',
        ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS),
      });
    }
    // No EOD cache yet — build a lightweight fallback from current prices only
    const priceSignals = await buildTechnicalSignals(symbols);
    const lightFallback = buildFallback(
      priceSignals.map(s => ({
        symbol: s.symbol,
        currentPrice: s.currentPrice,
        score: scoreSignal(s),
        technical: {
          trend3mPct: s.trend3mPct,
          momentumPct: s.momentumPct,
          volatilityPct: s.volatilityPct,
          volumeTrendPct: s.volumeTrendPct,
          relativeStrength: s.relativeStrength,
          rsi14: s.rsi14,
        },
        news: s.news,
        suggestedTp: s.suggestedTp,
        suggestedSl: s.suggestedSl,
      })),
    );
    return NextResponse.json({
      ...lightFallback,
      pipeline_mode: 'intraday',
      ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS),
    });
  }

  const signals = await buildTechnicalSignals(symbols);

  // ✨ Phase 2+3 enrichment
  const enrichedContext = await buildEnhancedContext(
    signals,
    parsed.data.pct_changes ?? {},
    parsed.data.positions ?? [],
  );

  const fallback = buildFallback(enrichedContext);
  const aiPayload = trimPayloadForAI(enrichedContext);

  const requestedModel = parsed.data.model && isValidModelKey(parsed.data.model)
    ? parsed.data.model
    : DEFAULT_MODEL;

  const aiCallResult = await callAiWithFallback<WatchlistScanResponse>(
    requestedModel,
    buildSystemPrompt(parsed.data.risk_profile),
    JSON.stringify({ watchlistContext: aiPayload, risk_profile: parsed.data.risk_profile }),
    fallback,
  );

  const finalResponse: WatchlistScanResponse = {
    ...aiCallResult.data,
    newsContext: Object.fromEntries(enrichedContext.map(s => [s.symbol, s.news])),
    ai_fallback: aiCallResult.fallbackUsed,
    ai_fallback_reason: aiCallResult.fallbackReason,
    ai_model_used: aiCallResult.modelUsed,
  };

  await setAiCache(cacheKey, finalResponse, WATCHLIST_AI_CACHE_TTL_MS);

  return NextResponse.json({ ...finalResponse, ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS) });
    }
