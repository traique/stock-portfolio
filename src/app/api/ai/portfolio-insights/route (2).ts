import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getBearerToken, validationErrorResponse } from '@/lib/server/api-utils';
import { getSupabaseUserClient } from '@/lib/server/supabase-user';
import { buildTechnicalSignals, callOpenRouterJson, TechnicalSignal } from '@/lib/server/ai-insights';
import { deriveOpenHoldings, groupHoldingsBySymbol, Transaction } from '@/lib/calculations';
import { envServer } from '@/lib/env-server';
import { buildAiCacheMeta, getAiCache, setAiCache } from '@/lib/server/ai-cache';

// ================= TYPES =================

const bodySchema = z.object({
  risk_profile: z.enum(['conservative', 'balanced', 'aggressive']).optional().default('balanced'),
  force_refresh: z.boolean().optional(),
});

type RiskProfile = z.infer<typeof bodySchema>['risk_profile'];

type AiAction = {
  symbol: string;
  action: 'BUY' | 'HOLD' | 'REDUCE' | 'SELL' | 'WATCH';
  reason: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  tp?: number;
  sl?: number;
};

type AiPortfolioResponse = {
  summary: string;
  actions: AiAction[];
  risks: string[];
  newsContext?: Record<string, TechnicalSignal['news']>;
};

type PortfolioContextItem = {
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  realPnLPct: number;
  // TP/SL tính từ avgBuyPrice — phản ánh chiến lược quản lý vị thế từ giá vốn
  suggestedTp: number;
  suggestedSl: number;
  technical: {
    trend3mPct: number;
    momentumPct: number;
    volumeTrendPct: number;
    action: TechnicalSignal['action'];
    confidence: TechnicalSignal['confidence'];
  };
  news: TechnicalSignal['news'];
};

// ================= CONSTANTS =================

const PORTFOLIO_AI_CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_VERSION = 'v5'; // bumped — TP/SL logic changed to avgBuyPrice-based
const TX_SIGNATURE_LIMIT = 120;

// TP/SL multipliers theo risk profile, tính trên avgBuyPrice (không phải currentPrice)
const TP_MULT: Record<RiskProfile, number> = {
  conservative: 1.07,  // chốt lời sớm +7% từ giá vốn
  balanced:     1.12,  // +12%
  aggressive:   1.20,  // +20%
};

const SL_MULT: Record<RiskProfile, number> = {
  conservative: 0.95,  // cắt lỗ -5% từ giá vốn
  balanced:     0.93,  // -7%
  aggressive:   0.90,  // -10%
};

// ================= HELPERS =================

function buildPortfolioCacheKey(
  userId: string,
  riskProfile: string,
  transactions: Transaction[],
): string {
  const txSignature = transactions
    .slice(-TX_SIGNATURE_LIMIT)
    .map(tx =>
      `${tx.id}:${tx.symbol}:${tx.transaction_type}:${tx.quantity}:${tx.price}:${tx.trade_date}`,
    )
    .join('|');

  return `ai:portfolio:${CACHE_VERSION}:${userId}:${riskProfile}:${txSignature}`;
}

function calcTpSl(
  avgBuyPrice: number,
  riskProfile: RiskProfile,
): { suggestedTp: number; suggestedSl: number } {
  return {
    suggestedTp: Math.round((avgBuyPrice * TP_MULT[riskProfile]) / 10) * 10,
    suggestedSl: Math.round((avgBuyPrice * SL_MULT[riskProfile]) / 10) * 10,
  };
}

function buildPortfolioContext(
  positions: ReturnType<typeof groupHoldingsBySymbol>,
  signals: TechnicalSignal[],
  riskProfile: RiskProfile,
): PortfolioContextItem[] {
  return positions.map(pos => {
    const sig          = signals.find(s => s.symbol === pos.symbol);
    const currentPrice = sig?.currentPrice ?? 0;
    const avgBuyPrice  = Number(pos.avgBuyPrice ?? 0);
    const pnlPct =
      avgBuyPrice > 0 ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100 : 0;

    const { suggestedTp, suggestedSl } = calcTpSl(avgBuyPrice, riskProfile);

    return {
      symbol:      pos.symbol,
      quantity:    pos.quantity,
      avgBuyPrice,
      currentPrice,
      realPnLPct:  Number(pnlPct.toFixed(2)),
      suggestedTp,
      suggestedSl,
      technical: {
        trend3mPct:     sig?.trend3mPct     ?? 0,
        momentumPct:    sig?.momentumPct    ?? 0,
        volumeTrendPct: sig?.volumeTrendPct ?? 0,
        action:         sig?.action         ?? 'WATCH',
        confidence:     sig?.confidence     ?? 'LOW',
      },
      news: sig?.news ?? [],
    };
  });
}

function buildBaseActions(context: PortfolioContextItem[]): AiAction[] {
  return context.map(item => {
    const { momentumPct, volumeTrendPct } = item.technical;

    let action: AiAction['action'] = 'HOLD';
    if (item.realPnLPct < -7 || momentumPct < -5) action = 'SELL';
    else if (item.realPnLPct > 12 && momentumPct < 0) action = 'REDUCE';

    return {
      symbol:     item.symbol,
      action,
      reason:     `Giá vốn: ${item.avgBuyPrice} | P/L: ${item.realPnLPct}% | Dòng tiền: ${volumeTrendPct > 0 ? 'Vào' : 'Ra'}`,
      confidence: 'MEDIUM' as const,
      tp:         item.suggestedTp,
      sl:         item.suggestedSl,
    };
  });
}

function buildSystemPrompt(riskProfile: RiskProfile): string {
  return `Bạn là Giám đốc Đầu tư (CIO) chứng khoán tại VN với 20 năm kinh nghiệm VSA và đọc vị tin tức.
Khách hàng đang đưa danh mục THỰC TẾ. Khẩu vị rủi ro: ${riskProfile}.

MỖI VỊ THẾ ĐÃ CÓ SẴN "suggestedTp" VÀ "suggestedSl" TÍNH TỪ GIÁ VỐN (avgBuyPrice):
- "suggestedTp" = mục tiêu chốt lời tính từ giá vốn (KHÔNG phải giá thị trường hiện tại).
- "suggestedSl" = ngưỡng cắt lỗ tính từ giá vốn.
- Bạn có thể dùng nguyên các giá trị này, hoặc điều chỉnh hợp lý dựa trên phân tích VSA và tin tức.
- Tuyệt đối KHÔNG tính TP/SL từ "currentPrice". TP/SL phải phản ánh chiến lược quản lý vị thế từ giá vốn.

NHIỆM VỤ QUAN TRỌNG NHẤT BẮT BUỘC TUÂN THỦ:
1. Tư vấn dựa vào "realPnLPct" (Lãi/Lỗ thực tế) và đối chiếu "news" (Tin tức) với dòng tiền (Volume).
2. Lệnh Cắt lỗ (sl) BẮT BUỘC phải THẤP HƠN "avgBuyPrice".
3. Lệnh Chốt lời (tp) BẮT BUỘC phải CAO HƠN "avgBuyPrice".

VĂN PHONG VÀ CÁCH PHÂN TÍCH (Lý do):
- Mở đầu "reason" bằng việc đánh giá vị thế, sau đó đưa ra tác động của Tin Tức lên hành vi giá.
  (VD: "Đang lỗ nhẹ 2%, tin chủ tịch bán cổ phiếu ra nhưng vol cạn...")
- Kết hợp VSA: cạn cung, rũ bỏ, nổ vol, phân phối ngầm, kéo xả.
- Quyết đoán: Không nói chung chung. Đang lỗ thì khuyên gồng chờ hồi hay cắt lót luôn.

YÊU CẦU TRẢ VỀ DUY NHẤT MỘT JSON:
{
  "summary": "Đánh giá chung dòng tiền và trạng thái danh mục...",
  "actions": [
    {
      "symbol": "Mã CP",
      "action": "BUY|HOLD|REDUCE|SELL|WATCH",
      "reason": "Lý do (Dựa trên PnL, VSA và Tin Tức)",
      "confidence": "LOW|MEDIUM|HIGH",
      "tp": <Giá chốt lời tính từ avgBuyPrice>,
      "sl": <Giá cắt lỗ tính từ avgBuyPrice>
    }
  ],
  "risks": ["Rủi ro vĩ mô hoặc ngành"]
}`;
}

// ================= HANDLER =================

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

  const transactions = (txRows ?? []) as Transaction[];
  if (!transactions.length) {
    return NextResponse.json({
      summary: 'Tài khoản chưa có dữ liệu giao dịch để phân tích.',
      actions: [],
      risks: ['Thiếu dữ liệu vị thế'],
      ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS),
    });
  }

  const cacheKey = buildPortfolioCacheKey(
    user.id,
    parsed.data.risk_profile,
    transactions,
  );

  if (!parsed.data.force_refresh) {
    const cached = getAiCache<AiPortfolioResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS),
      });
    }
  }

  const openHoldings = deriveOpenHoldings(transactions);
  const positions    = groupHoldingsBySymbol(openHoldings);
  const symbols      = positions.map(p => p.symbol);
  const signals      = await buildTechnicalSignals(symbols);

  const portfolioContext = buildPortfolioContext(
    positions,
    signals,
    parsed.data.risk_profile,
  );

  const fallback: AiPortfolioResponse = {
    summary:
      'Đang dùng dữ liệu dự phòng. Hệ thống AI đánh giá dựa trên giá vốn hiện tại và tin tức.',
    actions: buildBaseActions(portfolioContext),
    risks: ['Quản trị rủi ro T+2.5', 'Thị trường phân hóa'],
  };

  const apiKey  = envServer.OPENROUTER_API_KEY;
  const aiModel = envServer.OPENROUTER_MODEL || 'llama-3.3-70b-versatile';

  const aiResponse = apiKey
    ? await callOpenRouterJson<AiPortfolioResponse>(
        apiKey,
        aiModel,
        buildSystemPrompt(parsed.data.risk_profile),
        JSON.stringify(portfolioContext),
        fallback,
      )
    : fallback;

  const finalResponse: AiPortfolioResponse = {
    ...aiResponse,
    newsContext: Object.fromEntries(
      portfolioContext.map(item => [item.symbol, item.news]),
    ),
  };

  setAiCache(cacheKey, finalResponse, PORTFOLIO_AI_CACHE_TTL_MS);

  return NextResponse.json({
    ...finalResponse,
    ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS),
  });
}
