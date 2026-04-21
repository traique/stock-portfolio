import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTechnicalSignals, callOpenRouterJson } from '@/lib/server/ai-insights';
import { validationErrorResponse } from '@/lib/server/api-utils';
import { envServer } from '@/lib/env-server';
import { buildAiCacheMeta, getAiCache, setAiCache } from '@/lib/server/ai-cache';

const bodySchema = z.object({
  symbols: z.array(z.string().trim().toUpperCase()).min(1).max(60),
  risk_profile: z.enum(['conservative', 'balanced', 'aggressive']).optional().default('balanced'),
  force_refresh: z.boolean().optional(), // Lệnh ép buộc hệ thống cào lại dữ liệu mới nhất
});

const WATCHLIST_AI_CACHE_TTL_MS = 10 * 60 * 1000;

type WatchlistScanResponse = {
  summary: string;
  picks: Array<{ symbol: string; score: number; reason: string; entry: number; tp: number; sl: number }>;
  avoid: string[];
  newsContext?: Record<string, any>; 
};

function buildWatchlistCacheKey(riskProfile: string, symbols: string[]) {
  return `ai:watchlist:v2:${riskProfile}:${symbols.join(',')}`;
}

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const symbols = [...new Set(parsed.data.symbols)].slice(0, 60).sort();
  const cacheKey = buildWatchlistCacheKey(parsed.data.risk_profile, symbols);

  // Chỉ lấy từ Cache nếu người dùng KHÔNG yêu cầu force_refresh
  if (!parsed.data.force_refresh) {
    const cached = getAiCache<WatchlistScanResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS) });
    }
  }

  const signals = await buildTechnicalSignals(symbols);

  const watchlistContext = signals
    .map((s) => {
      const trendScore = Math.max(-20, Math.min(20, s.trend3mPct));
      const momentumScore = Math.max(-15, Math.min(15, s.momentum5dPct * 1.5));
      const volumeScore = Math.max(-15, Math.min(15, (s.volumeTrendPct || 0) * 0.5)); 
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
        news: s.news, 
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
        reason: `Dòng tiền: ${s.technical.volumeTrendPct > 0 ? 'Vào' : 'Cạn'}`,
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
    const prompt = `Bạn là Giám đốc Tự doanh tại VN. Phân tích điểm mua dựa trên "volumeTrendPct" (Dòng tiền), "news" (Tin tức) và "currentPrice". 
Trình bày lý do ngắn gọn, sắc nét theo trường phái VSA. Trả về JSON duy nhất.`;

    aiResponse = await callOpenRouterJson<WatchlistScanResponse>(
      apiKey,
      aiModel,
      prompt,
      JSON.stringify({ watchlistContext, risk_profile: parsed.data.risk_profile }),
      fallback
    );
  }

  const finalResponse: WatchlistScanResponse = {
    ...aiResponse,
    newsContext: Object.fromEntries(watchlistContext.map(s => [s.symbol, s.news || []]))
  };

  setAiCache(cacheKey, finalResponse, WATCHLIST_AI_CACHE_TTL_MS);

  return NextResponse.json({
    ...finalResponse,
    ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS),
  });
}
