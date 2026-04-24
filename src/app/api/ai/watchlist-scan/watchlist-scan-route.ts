import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTechnicalSignals, callOpenRouterJson, TechnicalSignal } from '@/lib/server/ai-insights';
import { validationErrorResponse } from '@/lib/server/api-utils';
import { envServer } from '@/lib/env-server';
import { buildAiCacheMeta, getAiCache, setAiCache } from '@/lib/server/ai-cache';

// ================= TYPES =================

const bodySchema = z.object({
  symbols: z.array(z.string().trim().toUpperCase()).min(1).max(60),
  risk_profile: z.enum(['conservative', 'balanced', 'aggressive']).optional().default('balanced'),
  force_refresh: z.boolean().optional(),
});

type RiskProfile = z.infer<typeof bodySchema>['risk_profile'];

type WatchlistPick = {
  symbol: string;
  score: number;
  reason: string;
  entry: number;
  tp: number;
  sl: number;
};

type WatchlistScanResponse = {
  summary: string;
  picks: WatchlistPick[];
  avoid: string[];
  newsContext?: Record<string, TechnicalSignal['news']>;
};

type WatchlistContextItem = {
  symbol: string;
  currentPrice: number;
  score: number;
  technical: {
    trend3mPct: number;
    momentumPct: number;
    volatilityPct: number;
    volumeTrendPct: number;
  };
  news: TechnicalSignal['news'];
  suggestedTp: number;
  suggestedSl: number;
};

// ================= CONSTANTS =================

const WATCHLIST_AI_CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_VERSION = 'v4'; // bumped — TechnicalSignal shape changed
const MAX_SYMBOLS = 60;
const SCORE_BASE = 50;
const AVOID_THRESHOLD = 45;
const TOP_PICKS = 5;

// ================= HELPERS =================

function buildWatchlistCacheKey(riskProfile: string, symbols: string[]): string {
  return `ai:watchlist:${CACHE_VERSION}:${riskProfile}:${symbols.join(',')}`;
}

function scoreSignal(s: TechnicalSignal): number {
  const trendScore    = Math.max(-20, Math.min(20, s.trend3mPct));
  const momentumScore = Math.max(-15, Math.min(15, s.momentumPct * 1.5)); // was momentum5dPct
  const volumeScore   = Math.max(-15, Math.min(15, s.volumeTrendPct * 0.5));
  const newsScore     = s.news.length > 0 ? 5 : 0;

  return Number(
    (SCORE_BASE + trendScore + momentumScore + volumeScore + newsScore - s.volatilityPct * 0.5).toFixed(2),
  );
}

function buildWatchlistContext(signals: TechnicalSignal[]): WatchlistContextItem[] {
  return signals
    .map(s => ({
      symbol:       s.symbol,
      currentPrice: s.currentPrice,
      score:        scoreSignal(s),
      technical: {
        trend3mPct:    s.trend3mPct,
        momentumPct:   s.momentumPct, // was momentum5dPct
        volatilityPct: s.volatilityPct,
        volumeTrendPct: s.volumeTrendPct,
      },
      news:        s.news,
      suggestedTp: s.suggestedTp,
      suggestedSl: s.suggestedSl,
    }))
    .sort((a, b) => b.score - a.score);
}

function buildFallback(context: WatchlistContextItem[]): WatchlistScanResponse {
  return {
    summary: 'Đang dùng dữ liệu dự phòng. Quét kỹ thuật dựa trên Trend, Momentum và Tin tức.',
    picks: context.slice(0, TOP_PICKS).map(s => ({
      symbol: s.symbol,
      score:  s.score,
      reason: `Dòng tiền: ${s.technical.volumeTrendPct > 0 ? 'Vào' : 'Cạn'}`,
      entry:  s.currentPrice,
      tp:     s.suggestedTp,
      sl:     s.suggestedSl,
    })),
    avoid: context.filter(r => r.score < AVOID_THRESHOLD).map(r => r.symbol),
  };
}

function buildSystemPrompt(riskProfile: RiskProfile): string {
  return `Bạn là Giám đốc Tự doanh & Chuyên gia VSA (Volume Spread Analysis) tại TTCK Việt Nam.
Khách hàng nhờ lọc Watchlist tìm ĐIỂM MUA MỚI. Khẩu vị rủi ro: ${riskProfile}.

NHIỆM VỤ QUAN TRỌNG NHẤT:
1. Phân tích điểm mua dựa trên sự kết hợp giữa "volumeTrendPct" (Dòng tiền), "news" (Tin tức) và "currentPrice".
2. Dấu hiệu MUA (Picks): Có tin Tích cực + Volume nổ mạnh (Cá mập gom hàng), hoặc giá chỉnh nhưng cạn cung chờ tin.
3. Dấu hiệu BỎ (Avoid): Có tin Tích cực nhưng Volume suy kiệt (Kéo xả/Bull-trap), hoặc có tin Xấu + Nổ Vol (Bán tháo).
4. Lệnh Mua (entry) sát "currentPrice". Cắt lỗ (sl) BẮT BUỘC THẤP HƠN "entry". Chốt lời (tp) BẮT BUỘC CAO HƠN "entry".

VĂN PHONG VÀ CÁCH PHÂN TÍCH:
- Lý do (reason) BẮT BUỘC phải nhắc đến Tin tức đang ảnh hưởng kết hợp với trạng thái Volume.
  (VD: "Tin đồn chia cổ tức hỗ trợ đà tăng, nổ vol gom hàng...")
- Dùng từ ngữ thực chiến: Cạn cung, test đáy, nổ vol, bùng nổ theo đà, rũ bỏ, gãy nền, kéo xả, tin ra để bán.

YÊU CẦU TRẢ VỀ JSON DUY NHẤT:
{
  "summary": "Nhận định chung về sự luân chuyển dòng tiền và tâm lý tin tức trong Watchlist này...",
  "picks": [
    {
      "symbol": "Mã CP",
      "score": <Điểm số sức mạnh 0-100>,
      "reason": "Lý do VSA + Tin tức",
      "entry": <Vùng giá mua kỳ vọng>,
      "tp": <Giá chốt lời>,
      "sl": <Giá cắt lỗ>
    }
  ],
  "avoid": ["Mã 1", "Mã 2"]
}`;
}

// ================= HANDLER =================

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const symbols = [...new Set(parsed.data.symbols)].slice(0, MAX_SYMBOLS).sort();
  const cacheKey = buildWatchlistCacheKey(parsed.data.risk_profile, symbols);

  if (!parsed.data.force_refresh) {
    const cached = getAiCache<WatchlistScanResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS),
      });
    }
  }

  const signals = await buildTechnicalSignals(symbols);
  const watchlistContext = buildWatchlistContext(signals);
  const fallback = buildFallback(watchlistContext);

  const apiKey = envServer.OPENROUTER_API_KEY;
  const aiModel = envServer.OPENROUTER_MODEL || 'llama-3.3-70b-versatile';

  const aiResponse = apiKey
    ? await callOpenRouterJson<WatchlistScanResponse>(
        apiKey,
        aiModel,
        buildSystemPrompt(parsed.data.risk_profile),
        JSON.stringify({ watchlistContext, risk_profile: parsed.data.risk_profile }),
        fallback,
      )
    : fallback;

  const finalResponse: WatchlistScanResponse = {
    ...aiResponse,
    newsContext: Object.fromEntries(
      watchlistContext.map(s => [s.symbol, s.news]),
    ),
  };

  setAiCache(cacheKey, finalResponse, WATCHLIST_AI_CACHE_TTL_MS);

  return NextResponse.json({
    ...finalResponse,
    ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS),
  });
}
