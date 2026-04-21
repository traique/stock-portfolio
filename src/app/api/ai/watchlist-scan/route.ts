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

  // BƯỚC QUAN TRỌNG: Gói ghém dữ liệu và Tính điểm có trọng số DÒNG TIỀN
  const watchlistContext = signals
    .map((s) => {
      const trendScore = Math.max(-20, Math.min(20, s.trend3mPct));
      const momentumScore = Math.max(-15, Math.min(15, s.momentum5dPct * 1.5));
      // Trọng số mới: Thưởng điểm nếu volume tăng mạnh, phạt nếu volume teo tóp
      const volumeScore = Math.max(-15, Math.min(15, (s.volumeTrendPct || 0) * 0.5)); 
      
      const score = Number((50 + trendScore + momentumScore + volumeScore - (s.volatilityPct * 0.5)).toFixed(2));
      
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
        suggestedTp: s.suggestedTp,
        suggestedSl: s.suggestedSl,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Fallback dự phòng
  const fallback: WatchlistScanResponse = {
    summary: 'Đang dùng dữ liệu dự phòng. Quét kỹ thuật dựa trên Trend, Momentum và sự luân chuyển Dòng tiền.',
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
Khách hàng đang nhờ bạn lọc Watchlist (Danh sách theo dõi) để tìm ĐIỂM MUA MỚI. Khẩu vị rủi ro: ${parsed.data.risk_profile}.

NHIỆM VỤ QUAN TRỌNG NHẤT:
1. Bạn phải soi kỹ "volumeTrendPct" (Dòng tiền) kết hợp với "momentum5dPct" và "currentPrice". 
2. Dấu hiệu MUA (Picks): Giá đi ngang/test nền mà Volume nổ mạnh (gom hàng), hoặc giá chỉnh nhưng cạn cung (volume âm).
3. Dấu hiệu BỎ (Avoid): Giá tăng rướn nhưng Volume suy kiệt (Bull-trap), hoặc giá gãy nền kèm nổ Vol (Phân phối/Xả hàng).
4. Lệnh Mua (entry) phải sát "currentPrice". Lệnh Cắt lỗ (sl) BẮT BUỘC THẤP HƠN "entry". Lệnh Chốt lời (tp) BẮT BUỘC CAO HƠN "entry".

VĂN PHONG VÀ CÁCH PHÂN TÍCH:
- Dùng từ ngữ thực chiến VSA: Cạn cung, test đáy, nổ vol, bùng nổ theo đà, rũ bỏ, gãy nền, kéo xả, dòng tiền lớn tham gia.
- Lạnh lùng, khách quan. Đưa các mã yếu, cạn dòng tiền hoặc rủi ro phân phối vào mảng "avoid".

YÊU CẦU TRẢ VỀ JSON DUY NHẤT:
{
  "summary": "Nhận định chung về sự phân hóa dòng tiền trong Watchlist này...",
  "picks": [
    {
      "symbol": "Mã CP",
      "score": Điểm số sức mạnh (0-100),
      "reason": "Lý do VSA (Phải nhắc đến vol và hành vi giá)",
      "entry": Vùng giá mua kỳ vọng,
      "tp": Giá chốt lời,
      "sl": Giá cắt lỗ
    }
  ],
  "avoid": ["Mã 1", "Mã 2"]
}`;

    // Đẩy toàn bộ Context giàu dữ liệu cho AI
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
