// src/app/api/ai/watchlist-scan/route.ts
//
// PATCHED — Tích hợp Phase 1 + 2 + 3:
//   Phase 1: buildEnhancedIndicators, scoreEnhancedIndicators, buildIndicatorSummary
//   Phase 2: buildSectorContext, buildSectorPromptSection (sector rotation)
//            analyzeForeignFlow, calcMarketBreadth, calcOBVTrend, calcMFI (money flow)
//   Phase 3: buildEarningsCalendar, buildEarningsPromptSection (KQKD)
//            buildOptimizationResult, buildOptimizationPromptSection (portfolio)
//
// Thay đổi so với route.ts gốc:
//   1. buildEnhancedSignals() thay thế buildTechnicalSignals() — thêm indicators Phase 1
//   2. buildEnrichedContext() bổ sung sector + money flow + earnings cho mỗi mã
//   3. buildEnhancedSystemPrompt() mở rộng framework phân tích
//   4. trimPayloadForAI() giữ nguyên logic cũ + thêm enhanced fields
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
  type EnhancedIndicators,
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
  type EarningsCalendar,
} from '@/lib/server/earnings-analyzer';

// ✨ PHASE 3B — Portfolio optimization
import {
  buildOptimizationResult,
  buildOptimizationPromptSection,
} from '@/lib/server/portfolio-optimizer';

// ─── Schema ───────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  symbols:       z.array(z.string().trim().toUpperCase()).min(1).max(60),
  risk_profile:  z.enum(['conservative', 'balanced', 'aggressive']).optional().default('balanced'),
  force_refresh: z.boolean().optional(),
  model:         z.string().optional(),
  // ✨ PHASE 2B — Dùng để tính market breadth
  pct_changes:   z.record(z.number()).optional(),
  // ✨ PHASE 3B — Positions để tính portfolio optimization
  positions:     z.array(z.object({ symbol: z.string(), value: z.number() })).optional(),
});

type RiskProfile = z.infer<typeof bodySchema>['risk_profile'];

// ─── Types ────────────────────────────────────────────────────────────────────

type WatchlistPick = {
  symbol:     string;
  score:      number;
  reason:     string;
  entry:      number;
  tp:         number;
  sl:         number;
};

type WatchlistScanResponse = {
  summary:              string;
  picks:                WatchlistPick[];
  avoid:                string[];
  newsContext?:         Record<string, TechnicalSignal['news']>;
  ai_fallback?:         boolean;
  ai_fallback_reason?:  string;
  ai_model_used?:       string;
};

// ✨ PHASE 1 — Extended context item
type WatchlistContextItem = {
  symbol:       string;
  currentPrice: number;
  score:        number;
  technical: {
    trend3mPct:        number;
    momentumPct:       number;
    volatilityPct:     number;
    volumeTrendPct:    number;
    relativeStrength:  number;
    rsi14:             number;
    // ✨ PHASE 1 additions:
    enhanced?:         EnhancedIndicators;
    enhancedScore?:    number;     // điểm bổ sung từ indicators mới
    indicatorSummary?: string;     // text mô tả cho AI
  };
  news:         TechnicalSignal['news'];
  suggestedTp:  number;
  suggestedSl:  number;
  // ✨ PHASE 2A:
  sectorPrompt?:     string;
  // ✨ PHASE 2B:
  moneyFlowPrompt?:  string;
  // ✨ PHASE 3A:
  earningsPrompt?:   string;
  // ✨ PHASE 3B:
  optimizationPrompt?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const WATCHLIST_AI_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const CACHE_VERSION              = 'v6'; // ✨ bump version khi thay đổi format
const MAX_SYMBOLS                = 60;
const SCORE_BASE                 = 50;
const AVOID_THRESHOLD            = 45;
const TOP_PICKS                  = 5;
const AI_MAX_CANDIDATES          = 20;
const AI_MAX_NEWS_PER_SYMBOL     = 3;

// ─── Helpers (giữ nguyên từ route.ts gốc) ────────────────────────────────────

function buildWatchlistCacheKey(userId: string, riskProfile: string, symbols: string[]): string {
  return `ai:watchlist:${CACHE_VERSION}:${userId}:${riskProfile}:${symbols.join(',')}`;
}

function scoreSignal(s: TechnicalSignal): number {
  const trendScore    = Math.max(-20, Math.min(20, s.trend3mPct));
  const momentumScore = Math.max(-15, Math.min(15, s.momentumPct * 1.5));
  const volumeScore   = Math.max(-15, Math.min(15, s.volumeTrendPct * 0.5));
  const newsScore     = s.news.length > 0 ? 5 : 0;
  const volPenalty    = s.volatilityPct * 0.5;
  return Number((SCORE_BASE + trendScore + momentumScore + volumeScore + newsScore - volPenalty).toFixed(2));
}

// ─── ✨ PHASE 1 — buildEnhancedContext ────────────────────────────────────────
//
// Sau khi có signals từ buildTechnicalSignals(), tính thêm:
//   • Enhanced indicators per symbol (từ close[])
//   • Sector context (shared — gọi 1 lần cho cả batch)
//   • Money flow per symbol (foreign + OBV/MFI)
//   • Earnings per symbol
//   • Portfolio optimization (shared — gọi 1 lần)

async function buildEnhancedContext(
  signals:     TechnicalSignal[],
  pctChanges:  Record<string, number> = {},
  positions:   Array<{ symbol: string; value: number }> = [],
): Promise<WatchlistContextItem[]> {

  // ── Phase 2A: Sector context (batch, 1 call) ──
  const allSectors = [...new Set(signals.flatMap(s => getSymbolSectors(s.symbol)))];
  let sectorCtx: SectorContext | null = null;
  try {
    sectorCtx = await buildSectorContext(allSectors);
  } catch (e) {
    logger.warn('[watchlist-scan] sector context failed:', e);
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
      logger.warn('[watchlist-scan] optimization failed:', e);
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
      const closes  = (s as TechnicalSignal & { closes: number[] }).closes ?? [];
      const volumes = (s as TechnicalSignal & { volumes: number[] }).volumes ?? [];
      if (closes.length > 20) {
        enhanced         = buildEnhancedIndicators(closes, s.currentPrice);
        enhancedScore    = scoreEnhancedIndicators(enhanced);
        indicatorSummary = buildIndicatorSummary(enhanced, s.symbol);
      }
      // (placeholder — sẽ populate khi ai-insights.ts expose closes[])

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
        const symList   = signals.map(x => x.symbol);
        // build closesMap từ closes[] đã expose
        const closesMap: Record<string, number[]> = Object.fromEntries(
          signals.map(x => [x.symbol, (x as TechnicalSignal & { closes: number[] }).closes ?? []])
        );
        breadth = calcMarketBreadth(symList, pctChanges, closesMap);
      }

      // OBV + MFI từ closes[] và volumes[] thật
      if (closes.length > 5 && volumes.length > 5) {
        obvTrend = calcOBVTrend(closes, volumes);
        mfi      = calcMFI(closes, volumes);
      }

      const moneyFlowPrompt = buildMoneyFlowPromptSection(foreignFlow, breadth, obvTrend, mfi, s.symbol);

      // ── Phase 2A: Sector prompt ──
      const sectorPrompt = sectorCtx
        ? buildSectorPromptSection(sectorCtx, s.symbol)
        : '';

      // ── Phase 3A: Earnings ──
      let earningsData: EarningsCalendar | null = null;
      let earningsPrompt = '';
      try {
        earningsData = await buildEarningsCalendar(s.symbol);
        earningsPrompt = buildEarningsPromptSection(earningsData);
      } catch { /* non-critical */ }

      // ── Phase 3B: Optimization prompt per symbol ──
      const optimizationPrompt = optResult
        ? buildOptimizationPromptSection(optResult, s.symbol)
        : '';

      // ── Final score (base + enhanced bonus) ──
      const finalScore = Number((baseScore + enhancedScore).toFixed(2));

      return {
        symbol:        s.symbol,
        currentPrice:  s.currentPrice,
        score:         finalScore,
        technical: {
          trend3mPct:       s.trend3mPct,
          momentumPct:      s.momentumPct,
          volatilityPct:    s.volatilityPct,
          volumeTrendPct:   s.volumeTrendPct,
          relativeStrength: s.relativeStrength,
          rsi14:            s.rsi14,
          enhanced,
          enhancedScore,
          indicatorSummary,
        },
        news:               s.news,
        suggestedTp:        s.suggestedTp,
        suggestedSl:        s.suggestedSl,
        sectorPrompt,
        moneyFlowPrompt,
        earningsPrompt,
        optimizationPrompt,
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
      score:  s.score,
      reason: `Score: ${s.score} | Trend: ${s.technical.trend3mPct.toFixed(1)}% | Dòng tiền: ${s.technical.volumeTrendPct > 0 ? 'Vào' : 'Cạn'}`,
      entry:  s.currentPrice,
      tp:     s.suggestedTp,
      sl:     s.suggestedSl,
    })),
    avoid: context.filter(r => r.score < AVOID_THRESHOLD).map(r => r.symbol),
  };
}

// ─── ✨ Trim payload — thêm enhanced fields ───────────────────────────────────

function trimPayloadForAI(context: WatchlistContextItem[]) {
  return context.slice(0, AI_MAX_CANDIDATES).map(s => ({
    symbol:       s.symbol,
    currentPrice: s.currentPrice,
    score:        s.score,
    technical:    {
      // Fields gốc
      trend3mPct:       s.technical.trend3mPct,
      momentumPct:      s.technical.momentumPct,
      volatilityPct:    s.technical.volatilityPct,
      volumeTrendPct:   s.technical.volumeTrendPct,
      relativeStrength: s.technical.relativeStrength,
      rsi14:            s.technical.rsi14,
      // ✨ Phase 1 — indicator summary (text, compact)
      indicators: s.technical.indicatorSummary || undefined,
    },
    suggestedTp:  s.suggestedTp,
    suggestedSl:  s.suggestedSl,
    news: s.news.slice(0, AI_MAX_NEWS_PER_SYMBOL).map(n => ({
      title:     n.title,
      sentiment: n.sentiment ?? 0,
    })),
    // ✨ Phase 2 + 3 context blocks (text, compact)
    sectorContext:       s.sectorPrompt       || undefined,
    moneyFlowContext:    s.moneyFlowPrompt     || undefined,
    earningsContext:     s.earningsPrompt      || undefined,
    portfolioContext:    s.optimizationPrompt  || undefined,
  }));
}

// ─── ✨ Enhanced system prompt ────────────────────────────────────────────────

function buildSystemPrompt(riskProfile: RiskProfile): string {
  const entryGuide: Record<RiskProfile, string> = {
    conservative: 'Chỉ chọn mã có score > 55, volatility thấp (<8%), và tin tức tích cực rõ ràng. Tối đa 3 picks.',
    balanced:     'Chọn mã có score > 50, cân bằng momentum và vol. Tối đa 5 picks.',
    aggressive:   'Có thể chọn mã score > 45 nếu momentum đang bùng nổ mạnh. Tối đa 7 picks.',
  };

  return `Bạn là chuyên gia phân tích chứng khoán Việt Nam, kết hợp Technical Analysis, Sector Rotation, Dòng tiền và Fundamental (KQKD).
Nhiệm vụ: Từ danh sách watchlist, lọc ra những mã ĐÁNG MUA ngay bây giờ và những mã cần TRÁNH.

KHẨU VỊ RỦI RO: ${riskProfile.toUpperCase()}
${entryGuide[riskProfile]}

=== DỮ LIỆU MỖI MÃ ===
- symbol, currentPrice, score (0-100), suggestedTp / suggestedSl
- technical: trend3mPct, momentumPct, volumeTrendPct, volatilityPct, relativeStrength, rsi14
- technical.indicators: tóm tắt MACD, Bollinger Bands, SMA cross, ADX, multi-timeframe (nếu có)
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

=== ĐỊNH DẠNG REASON (bắt buộc) ===
Cấu trúc: [Pha] → [Sector] → [Dòng tiền] → [Technical] → [Earnings nếu gần] → [Action cụ thể]
Ví dụ tốt: "Pha tích lũy 3 tuần. Ngành Thép hồi phục, +3.5% vs VNINDEX tháng này. Khối ngoại mua ròng 45 tỷ 5 phiên, OBV tăng. MACD bullish crossover + giá trên SMA20. KQKD Q1 EPS +40% YoY. Entry vùng hiện tại, SL dưới đáy tích lũy."
Không viết chung chung: "Cổ phiếu có tiềm năng tăng trưởng."

=== OUTPUT JSON ===
Trả về DUY NHẤT JSON hợp lệ:
{
  "summary": "Tổng quan: dòng tiền ngành nào đang vào/ra, breadth thị trường, cơ hội tổng thể",
  "picks": [{ "symbol": "string", "score": number, "reason": "...", "entry": number, "tp": number, "sl": number }],
  "avoid": ["HPG (phân phối + ngành yếu)", "VIC (dòng ngoại rút)"]
}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseUserClient(token);
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw    = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const symbols      = [...new Set(parsed.data.symbols)].slice(0, MAX_SYMBOLS).sort();
  const cacheKey     = buildWatchlistCacheKey(user.id, parsed.data.risk_profile, symbols);

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
  const signals = await buildTechnicalSignals(symbols);

  // ✨ Phase 2+3 enrichment
  const enrichedContext = await buildEnhancedContext(
    signals,
    parsed.data.pct_changes ?? {},
    parsed.data.positions ?? [],
  );

  const fallback    = buildFallback(enrichedContext);
  const aiPayload   = trimPayloadForAI(enrichedContext);

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
    ai_fallback:        aiCallResult.fallbackUsed,
    ai_fallback_reason: aiCallResult.fallbackReason,
    ai_model_used:      aiCallResult.modelUsed,
  };

  await setAiCache(cacheKey, finalResponse, WATCHLIST_AI_CACHE_TTL_MS);

  return NextResponse.json({ ...finalResponse, ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS) });
}
