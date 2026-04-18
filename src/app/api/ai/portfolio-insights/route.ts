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
  riskProfile: string,
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
      summary: 'Tài khoản chưa có dữ liệu giao dịch để phân tích.',
      actions: [],
      risks: ['Thiếu dữ liệu vị thế'],
      ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS),
    });
  }

  const cacheKey = buildPortfolioCacheKey(user.id, parsed.data.risk_profile, transactions);
  const cached = getAiCache<AiPortfolioResponse>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS) });
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

    return {
      symbol: signal.symbol,
      action,
      reason: `P/L: ${pnlPct.toFixed(2)}% | Momentum 5D: ${signal.momentum5dPct.toFixed(2)}%`,
      confidence: 'MEDIUM',
      tp: signal.suggestedTp,
      sl: signal.suggestedSl,
    } as const;
  });

  const fallback: AiPortfolioResponse = {
    summary: 'Phân tích kỹ thuật dựa trên dữ liệu giá và momentum hiện tại.',
    actions: baseActions as any,
    risks: ['Thị trường biến động, cần tuân thủ SL kỷ luật.'],
  };

  const apiKey = envServer.OPENROUTER_API_KEY;
  const aiModel = envServer.OPENROUTER_MODEL || 'openrouter/auto';
  let aiResponse = fallback;

  if (apiKey) {
    const prompt = `Bạn là Giám đốc Đầu tư (CIO) chứng khoán lão luyện tại VN với 20 năm kinh nghiệm. 
Hãy đánh giá danh mục này dưới góc nhìn "Dòng tiền thông minh" và quản trị rủi ro chuyên nghiệp.

YÊU CẦU TRẢ VỀ JSON:
- summary: Nhận định sắc sảo, thực chiến về trạng thái danh mục và xu hướng dòng tiền.
- actions: Mảng object (symbol, action[BUY|HOLD|REDUCE|SELL|WATCH], reason[dùng ngôn ngữ trader: cạn cung, bùng nổ, phân kỳ...], confidence, tp, sl).
- risks: Các rủi ro hệ thống hoặc nhóm ngành cần lưu tâm.

Khẩu vị rủi ro: ${parsed.data.risk_profile}.`;

    aiResponse = await callOpenRouterJson<AiPortfolioResponse>(
      apiKey,
      aiModel,
      prompt,
      JSON.stringify({ positions, signals, risk_profile: parsed.data.risk_profile }),
      fallback
    );
  }

  setAiCache(cacheKey, aiResponse, PORTFOLIO_AI_CACHE_TTL_MS);

  return NextResponse.json({
    ...aiResponse,
    ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS),
  });
}
