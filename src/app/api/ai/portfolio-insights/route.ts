import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getBearerToken, validationErrorResponse } from '@/lib/server/api-utils';
import { getSupabaseUserClient } from '@/lib/server/supabase-user';
import { buildTechnicalSignals, callOpenRouterJson } from '@/lib/server/ai-insights';
import { deriveOpenHoldings, groupHoldingsBySymbol, Transaction } from '@/lib/calculations';
import { envServer } from '@/lib/env-server';
import { buildAiCacheMeta, getAiCache, setAiCache } from '@/lib/server/ai-cache';

const bodySchema = z.object({
  risk_profile: z.enum(['conservative', 'balanced', 'aggressive']).optional().default('balanced'),
});

const PORTFOLIO_AI_CACHE_TTL_MS = 5 * 60 * 1000;

type AiPortfolioResponse = {
  summary: string;
  actions: Array<{
    symbol: string;
    action: 'BUY' | 'HOLD' | 'REDUCE' | 'SELL' | 'WATCH';
    reason: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    tp?: number;
    sl?: number;
  }>;
  risks: string[];
};

function buildPortfolioCacheKey(
  userId: string,
  riskProfile: 'conservative' | 'balanced' | 'aggressive',
  transactions: Transaction[]
) {
  const txSignature = transactions
    .slice(-120)
    .map((tx) => `${tx.id}:${tx.symbol}:${tx.transaction_type}:${tx.quantity}:${tx.price}:${tx.trade_date}`)
    .join('|');

  return `ai:portfolio:${userId}:${riskProfile}:${txSignature}`;
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const supabase = getSupabaseUserClient(token);
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: txRows, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('trade_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const transactions = (txRows || []) as Transaction[];
  if (!transactions.length) {
    return NextResponse.json({
      summary: 'Chưa có giao dịch để phân tích.',
      actions: [],
      risks: ['Không có dữ liệu vị thế mở'],
      ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS),
    } satisfies AiPortfolioResponse & { cached: boolean; cache_ttl_seconds: number; cached_at: string });
  }

  const cacheKey = buildPortfolioCacheKey(user.id, parsed.data.risk_profile, transactions);
  const cached = getAiCache<AiPortfolioResponse>(cacheKey);
  if (cached) {
    return NextResponse.json({
      ...cached,
      ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS),
    });
  }

  const openHoldings = deriveOpenHoldings(transactions);
  const positions = groupHoldingsBySymbol(openHoldings);
  const symbols = positions.map((p) => p.symbol);
  const signals = await buildTechnicalSignals(symbols);

  const baseActions = signals.map((signal) => {
    const position = positions.find((p) => p.symbol === signal.symbol);
    const avgBuy = Number(position?.avgBuyPrice || 0);
    const pnlPct = avgBuy > 0 ? ((signal.currentPrice - avgBuy) / avgBuy) * 100 : 0;

    let action: 'BUY' | 'HOLD' | 'REDUCE' | 'SELL' | 'WATCH' = 'HOLD';
    if (pnlPct < -7 || signal.momentum5dPct < -5) action = 'SELL';
    else if (pnlPct > 12 && signal.momentum5dPct < 0) action = 'REDUCE';
    else if (signal.momentum5dPct > 4 && signal.trend3mPct > 0) action = 'HOLD';

    return {
      symbol: signal.symbol,
      action,
      reason: `P/L ${pnlPct.toFixed(2)}%, momentum 5d ${signal.momentum5dPct.toFixed(2)}%`,
      confidence: Math.abs(signal.momentum5dPct) > 5 ? 'HIGH' : 'MEDIUM',
      tp: signal.suggestedTp,
      sl: signal.suggestedSl,
    } as AiPortfolioResponse['actions'][number];
  });

  const fallback: AiPortfolioResponse = {
    summary:
      'Phân tích kỹ thuật tự động: đã tính TP/SL theo ATR, biến động 3 tháng và momentum 5 phiên gần nhất.',
    actions: baseActions,
    risks: ['Thị trường biến động cao, cần tuân thủ SL kỷ luật.'],
  };

  const promptData = {
    risk_profile: parsed.data.risk_profile,
    portfolio: baseActions,
    technicals: signals,
  };

  const aiResponse = await callOpenRouterJson<AiPortfolioResponse>(
    envServer.OPENROUTER_API_KEY,
    envServer.OPENROUTER_MODEL || 'openrouter/auto',
    `Bạn là trợ lý đầu tư cổ phiếu Việt Nam. Trả JSON hợp lệ với keys: summary, actions, risks.
Mỗi action phải có symbol, action(BUY|HOLD|REDUCE|SELL|WATCH), reason, confidence(LOW|MEDIUM|HIGH), tp, sl.
Ưu tiên kiểm soát rủi ro và kỷ luật SL.`,
    JSON.stringify(promptData),
    fallback
  );

  setAiCache(cacheKey, aiResponse, PORTFOLIO_AI_CACHE_TTL_MS);

  return NextResponse.json({
    ...aiResponse,
    ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS),
  });
                                                                   }
