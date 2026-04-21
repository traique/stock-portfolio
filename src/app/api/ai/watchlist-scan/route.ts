import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTechnicalSignals, callOpenRouterJson } from '@/lib/server/ai-insights';
import { validationErrorResponse } from '@/lib/server/api-utils';
import { envServer } from '@/lib/env-server';
import { buildAiCacheMeta, getAiCache, setAiCache } from '@/lib/server/ai-cache';

const bodySchema = z.object({
  symbols: z.array(z.string().trim().toUpperCase()).min(1).max(60),
  risk_profile: z.enum(['conservative', 'balanced', 'aggressive']).optional().default('balanced'),
});

const WATCHLIST_AI_CACHE_TTL_MS = 10 * 60 * 1000;

type WatchlistScanResponse = {
  summary: string;
  picks: Array<{
    symbol: string;
    score: number;
    reason: string;
    entry: number;
    tp: number;
    sl: number;
  }>;
  avoid: string[];
};

function buildWatchlistCacheKey(riskProfile: string, symbols: string[]) {
  return `ai:watchlist:${riskProfile}:${symbols.join(',')}`;
}

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const symbols = [...new Set(parsed.data.symbols)].slice(0, 60).sort();
  const cacheKey = buildWatchlistCacheKey(parsed.data.risk_profile, symbols);

  const cached = getAiCache<WatchlistScanResponse>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS) });
  }

  const signals = await buildTechnicalSignals(symbols);

  const watchlistContext = signals
    .map((s) => {
      const trendScore = Math.max(-20, Math.min(20, s.trend3mPct));
      const momentumScore = Math.max(-15, Math.min(15, s.momentum5dPct * 1.5));
      const volumeScore = Math.max(-15, Math.min(15, (s.volumeTrendPct || 0) * 0.5)); 
      
      // Bonus điểm độ "Hot": Mã nào đang có nhiều tin tức xuất hiện sẽ được ưu tiên chú ý
      const newsScore = s.news && s.news.length > 0 ? 5 : 0;
      
      const score = Number((50 + trendScore + momentumScore + volumeScore + newsScore - (s.volatilityPct * 0.5)).toFixed(2));
      
      return {
        symbol: s.symbol,
        currentPrice: s.currentPrice,
        score,
        technical: {
          trend3mPct: s.trend3mPct,
          momentum5dPct: s.momentum5dPct,
          volatilityPct: s.volatilityPct,
          volumeTrendPct: s.volumeTrendPct,
        },
        news: s.news, // <-- Gửi trực tiếp tin tức nóng hổi cho AI
        suggestedTp: s.suggestedTp,
        suggestedSl: s.suggestedSl,
      };
    })
    .sort((a, b) => b.score - a.score);

  const fallback: WatchlistScanResponse = {
    summary: 'Đang dùng dữ liệu dự phòng. Quét kỹ thuật dựa trên Trend, Momentum và Tin tức.',
    picks: watchlistContext.slice(0, 5).map(s => ({
        symbol: s.symbol,
        score: s.score,
        reason: `Dòng tiền: ${s.technical.volumeTrendPct > 0 ? 'Vào' : 'Cạn'} | Momentum: ${s.technical.momentum5dPct.toFixed(2)}%`,
        entry: s.currentPrice,
        tp: s.suggestedTp,
        sl: s.suggestedSl,
    })),
    avoid: watchlistContext.filter((r) => r.score < 45).map((r) => r.symbol),
  };

  const apiKey = envServer.OPENROUTER_API_KEY;
  const aiModel = envServer.OPENROUTER_MODEL || 'openrouter/auto';
  let aiResponse = fallback;

  if (apiKey) {
    const prompt = `Bạn là Giám đốc Tự doanh & Chuyên gia VSA (Volume Spread Analysis) tại TTCK Việt Nam.
Khách hàng nhờ lọc Watchlist tìm ĐIỂM MUA MỚI. Khẩu vị rủi ro: ${parsed.data.risk_profile}.

NHIỆM VỤ QUAN TRỌNG NHẤT:
1. Phân tích điểm mua dựa trên sự kết hợp giữa "volumeTrendPct" (Dòng tiền), "news" (Tin tức) và "currentPrice". 
2. Dấu hiệu MUA (Picks): Có tin Tích cực + Volume nổ mạnh (Cá mập gom hàng), hoặc giá chỉnh nhưng cạn cung chờ tin.
3. Dấu hiệu BỎ (Avoid): Có tin Tích cực nhưng Volume suy kiệt (Kéo xả/Bull-trap), hoặc có tin Xấu + Nổ Vol (Bán tháo).
4. Lệnh Mua (entry) sát "currentPrice". Cắt lỗ (sl) BẮT BUỘC THẤP HƠN "entry". Chốt lời (tp) BẮT BUỘC CAO HƠN "entry".

VĂN PHONG VÀ CÁCH PHÂN TÍCH:
- Lý do (reason) BẮT BUỘC phải nhắc đến Tin tức đang ảnh hưởng kết hợp với trạng thái Volume (VD: "Tin đồn chia cổ tức hỗ trợ đà tăng, nổ vol gom hàng...").
- Dùng từ ngữ thực chiến: Cạn cung, test đáy, nổ vol, bùng nổ theo đà, rũ bỏ, gãy nền, kéo xả, tin ra để bán.

YÊU CẦU TRẢ VỀ JSON DUY NHẤT:
{
  "summary": "Nhận định chung về sự luân chuyển dòng tiền và tâm lý tin tức trong Watchlist này...",
  "picks": [
    {
      "symbol": "Mã CP",
      "score": Điểm số sức mạnh (0-100),
      "reason": "Lý do VSA + Tin tức",
      "entry": Vùng giá mua kỳ vọng,
      "tp": Giá chốt lời,
      "sl": Giá cắt lỗ
    }
  ],
  "avoid": ["Mã 1", "Mã 2"]
}`;

    aiResponse = await callOpenRouterJson<WatchlistScanResponse>(
      apiKey,
      aiModel,
      prompt,
      JSON.stringify({ watchlistContext, risk_profile: parsed.data.risk_profile }),
      fallback
    );
  }

  setAiCache(cacheKey, aiResponse, WATCHLIST_AI_CACHE_TTL_MS);

  return NextResponse.json({
    ...aiResponse,
    ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS),
  });
}
