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

  const scored = signals
    .map((s) => {
      const trendScore = Math.max(-20, Math.min(20, s.trend3mPct));
      const momentumScore = Math.max(-15, Math.min(15, s.momentum5dPct * 1.5));
      const score = Number((50 + trendScore + momentumScore - (s.volatilityPct * 0.5)).toFixed(2));
      return {
        symbol: s.symbol,
        score,
        reason: `Trend: ${s.trend3mPct.toFixed(2)}% | Momentum: ${s.momentum5dPct.toFixed(2)}%`,
        entry: s.currentPrice,
        tp: s.suggestedTp,
        sl: s.suggestedSl,
      };
    })
    .sort((a, b) => b.score - a.score);

  const fallback: WatchlistScanResponse = {
    summary: 'Quét kỹ thuật dựa trên Trend, Momentum và độ biến động ATR.',
    picks: scored.slice(0, 5),
    avoid: scored.filter((r) => r.score < 45).map((r) => r.symbol),
  };

  const apiKey = envServer.OPENROUTER_API_KEY;
  const aiModel = envServer.OPENROUTER_MODEL || 'openrouter/auto';
  let aiResponse = fallback;

  if (apiKey) {
    const prompt = `Bạn là Chuyên gia Chiến lược Thị trường (Market Strategist) gạo cội. 
Hãy lọc danh sách theo dõi này để tìm ra những "siêu cổ phiếu" hoặc điểm mua an toàn nhất.

YÊU CẦU TRẢ VỀ JSON:
- summary: Tóm tắt bức tranh dòng tiền nhóm này. Đâu là nhóm hút tiền, đâu là bẫy tăng giá (Bull-trap)?
- picks: Tối đa 5 mã tiềm năng nhất (symbol, score[0-100], reason[phân tích hành vi giá, nền tích lũy, áp lực cung cầu], entry, tp, sl).
- avoid: Mảng các mã cần tránh do rủi ro phân phối hoặc kỹ thuật yếu.

Văn phong: Lạnh lùng, khách quan, đi thẳng vào vấn đề. Chỉ ưu tiên Risk/Reward hấp dẫn.`;

    aiResponse = await callOpenRouterJson<WatchlistScanResponse>(
      apiKey,
      aiModel,
      prompt,
      JSON.stringify({ scored, risk_profile: parsed.data.risk_profile }),
      fallback
    );
  }

  setAiCache(cacheKey, aiResponse, WATCHLIST_AI_CACHE_TTL_MS);

  return NextResponse.json({
    ...aiResponse,
    ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS),
  });
}
