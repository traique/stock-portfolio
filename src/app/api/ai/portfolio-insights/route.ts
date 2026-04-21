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

  // BƯỚC QUAN TRỌNG: Nặn ra một Context (Bối cảnh) hoàn hảo cho AI
  // Gắn trực tiếp Giá vốn, Giá hiện tại và Lỗ/Lãi thực tế vào để AI soi
  const portfolioContext = positions.map((pos) => {
    const sig = signals.find((s) => s.symbol === pos.symbol);
    const currentPrice = sig?.currentPrice || 0;
    const avgBuyPrice = Number(pos.avgBuyPrice || 0);
    // Tính % Lãi lỗ thực tế của người dùng
    const pnlPct = avgBuyPrice > 0 ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100 : 0;

    return {
      symbol: pos.symbol,
      quantity: pos.quantity,
      avgBuyPrice: avgBuyPrice,
      currentPrice: currentPrice,
      realPnLPct: Number(pnlPct.toFixed(2)), // AI sẽ nhìn vào biến này để đưa ra quyết định
      technical: {
        trend3mPct: sig?.trend3mPct,
        momentum5dPct: sig?.momentum5dPct,
        // Ép kiểu any để tránh lỗi TypeScript nếu bạn chưa update type ở hàm khác,
        // nhưng dữ liệu thật vẫn sẽ được truyền qua nhờ logic ở file ai-insights.ts
        volumeTrendPct: (sig as any)?.volumeTrendPct || 0, 
      }
    };
  });

  // Fallback (Dự phòng khi rớt mạng AI)
  const baseActions = portfolioContext.map((item) => {
    let action: 'BUY' | 'HOLD' | 'REDUCE' | 'SELL' | 'WATCH' = 'HOLD';
    if (item.realPnLPct < -7 || (item.technical.momentum5dPct || 0) < -5) action = 'SELL';
    else if (item.realPnLPct > 12 && (item.technical.momentum5dPct || 0) < 0) action = 'REDUCE';

    // SL/TP dự phòng tính dựa trên giá hiện tại
    const tpFallback = item.currentPrice * 1.08;
    const slFallback = item.currentPrice * 0.95;

    return {
      symbol: item.symbol,
      action,
      reason: `Giá vốn: ${item.avgBuyPrice} | P/L: ${item.realPnLPct}% | Dòng tiền: ${item.technical.volumeTrendPct > 0 ? 'Vào' : 'Ra'}`,
      confidence: 'MEDIUM',
      tp: Math.round(tpFallback / 10) * 10,
      sl: Math.round(slFallback / 10) * 10,
    } as const;
  });

  const fallback: AiPortfolioResponse = {
    summary: 'Đang dùng dữ liệu dự phòng. Hệ thống AI đánh giá dựa trên giá vốn hiện tại.',
    actions: baseActions as any,
    risks: ['Quản trị rủi ro T+2.5', 'Thị trường phân hóa'],
  };

  const apiKey = envServer.OPENROUTER_API_KEY;
  const aiModel = envServer.OPENROUTER_MODEL || 'openrouter/auto';
  let aiResponse = fallback;

  if (apiKey) {
    // PROMPT THỰC CHIẾN CẤP ĐỘ GIÁM ĐỐC TỰ DOANH
    const prompt = `Bạn là Giám đốc Đầu tư (CIO) chứng khoán tại VN với 20 năm kinh nghiệm VSA và đọc vị dòng tiền.
Khách hàng đang đưa cho bạn danh mục THỰC TẾ của họ. Khẩu vị rủi ro: ${parsed.data.risk_profile}.

NHIỆM VỤ QUAN TRỌNG NHẤT BẮT BUỘC TUÂN THỦ:
1. Bạn phải tư vấn dựa vào "realPnLPct" (Lãi/Lỗ thực tế) và "avgBuyPrice" (Giá vốn) của khách hàng!
2. Lệnh Cắt lỗ (sl) BẮT BUỘC phải THẤP HƠN "currentPrice" (Giá hiện tại).
3. Lệnh Chốt lời (tp) BẮT BUỘC phải CAO HƠN "currentPrice" VÀ "avgBuyPrice". (Tuyệt đối không đưa tp thấp hơn sl hoặc thấp hơn giá vốn).

VĂN PHONG VÀ CÁCH PHÂN TÍCH (Lý do):
- Mở đầu "reason" bằng việc đánh giá ngay vị thế (VD: "Đang lỗ nhẹ 2%, vol cạn..." hoặc "Lãi mỏng 1%, dòng tiền đang vào...").
- Kết hợp VSA: Dùng các từ như cạn cung, rũ bỏ, nổ vol, phân phối ngầm, dòng tiền lớn.
- Quyết đoán: Không nói chung chung. Đang lỗ thì khuyên gồng chờ hồi hay cắt lót luôn.

YÊU CẦU TRẢ VỀ DUY NHẤT MỘT JSON:
{
  "summary": "Đánh giá chung dòng tiền và trạng thái danh mục...",
  "actions": [
    {
      "symbol": "Mã CP",
      "action": "BUY|HOLD|REDUCE|SELL|WATCH",
      "reason": "Lý do (Dựa trên PnL và VSA)",
      "confidence": "LOW|MEDIUM|HIGH",
      "tp": Giá chốt lời kỳ vọng hợp lý,
      "sl": Giá cắt lỗ hợp lý
    }
  ],
  "risks": ["Rủi ro vĩ mô hoặc ngành"]
}`;

    // Ép AI phân tích khối dữ liệu mới đã được gọt dũa (portfolioContext)
    aiResponse = await callOpenRouterJson<AiPortfolioResponse>(
      apiKey,
      aiModel,
      prompt,
      JSON.stringify(portfolioContext),
      fallback
    );
  }

  setAiCache(cacheKey, aiResponse, PORTFOLIO_AI_CACHE_TTL_MS);

  return NextResponse.json({
    ...aiResponse,
    ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS),
  });
}
