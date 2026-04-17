import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTechnicalSignals, callOpenRouterJson } from '@/lib/server/ai-insights';
import { validationErrorResponse } from '@/lib/server/api-utils';
import { envServer, getOptionalServerEnv } from '@/lib/env-server';
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

function buildWatchlistCacheKey(
  riskProfile: 'conservative' | 'balanced' | 'aggressive',
  symbols: string[]
) {
  return `ai:watchlist:${riskProfile}:${symbols.join(',')}`;
}

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const symbols = [...new Set(parsed.data.symbols)].slice(0, 60).sort((a, b) => a.localeCompare(b));
  const cacheKey = buildWatchlistCacheKey(parsed.data.risk_profile, symbols);

  const cached = getAiCache<WatchlistScanResponse>(cacheKey);
  if (cached) {
    return NextResponse.json({
      ...cached,
      ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS),
    });
  }

  const signals = await buildTechnicalSignals(symbols);

  const scored = signals
    .map((s) => {
      const trendScore = Math.max(-20, Math.min(20, s.trend3mPct));
      const momentumScore = Math.max(-15, Math.min(15, s.momentum5dPct * 1.5));
      const volPenalty = Math.max(0, s.volatilityPct - 4) * 1.2;
      const score = Number((50 + trendScore + momentumScore - volPenalty).toFixed(2));
      return {
        symbol: s.symbol,
        score,
        reason: `Trend 3m ${s.trend3mPct.toFixed(2)}%, momentum 5d ${s.momentum5dPct.toFixed(2)}%`,
        entry: s.currentPrice,
        tp: s.suggestedTp,
        sl: s.suggestedSl,
      };
    })
    .sort((a, b) => b.score - a.score);

  const fallback: WatchlistScanResponse = {
    summary: 'Đã quét watchlist theo trend + momentum + ATR + độ biến động.',
    picks: scored.slice(0, 5),
    avoid: scored.filter((r) => r.score < 45).slice(0, 5).map((r) => r.symbol),
  };

  const aiResponse = await callOpenRouterJson<WatchlistScanResponse>(
    getOptionalServerEnv('OPENROUTER_API_KEY') || envServer.OPENROUTER_API_KEY,
    getOptionalServerEnv('OPENROUTER_MODEL') || envServer.OPENROUTER_MODEL || 'openrouter/auto',
    `Bạn là trợ lý quét watchlist cổ phiếu. Trả JSON hợp lệ với keys: summary, picks, avoid.
Mỗi pick gồm symbol, score(0-100), reason, entry, tp, sl. Ưu tiên quản trị rủi ro.`,
    JSON.stringify({ risk_profile: parsed.data.risk_profile, scored }),
    fallback
  );

  setAiCache(cacheKey, aiResponse, WATCHLIST_AI_CACHE_TTL_MS);

  return NextResponse.json({
    ...aiResponse,
    ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS),
  });
}
