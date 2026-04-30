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
  positionValue: number;       // quantity × currentPrice — để AI hiểu tỷ trọng
  positionStatus: 'PROFIT' | 'LOSS' | 'BREAKEVEN';
  suggestedTp: number;
  suggestedSl: number;
  technical: {
    trend3mPct: number;
    momentumPct: number;
    volumeTrendPct: number;
    volatilityPct: number;     // thêm volatility để AI biết độ rủi ro từng mã
    action: TechnicalSignal['action'];
    confidence: TechnicalSignal['confidence'];
  };
  news: TechnicalSignal['news'];
};

// Payload gửi AI — news đã trim còn title + sentiment để tránh 413
type PortfolioAiPayloadItem = Omit<PortfolioContextItem, 'news'> & {
  news: { title: string; sentiment: number }[];
};

// ================= CONSTANTS =================

const PORTFOLIO_AI_CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_VERSION = 'v6';
const TX_SIGNATURE_LIMIT = 120;
const AI_MAX_NEWS_PER_SYMBOL = 4;

const TP_MULT: Record<RiskProfile, number> = {
  conservative: 1.07,
  balanced:     1.12,
  aggressive:   1.20,
};

const SL_MULT: Record<RiskProfile, number> = {
  conservative: 0.95,
  balanced:     0.93,
  aggressive:   0.90,
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

function calcTpSl(avgBuyPrice: number, riskProfile: RiskProfile) {
  return {
    suggestedTp: Math.round((avgBuyPrice * TP_MULT[riskProfile]) / 10) * 10,
    suggestedSl: Math.round((avgBuyPrice * SL_MULT[riskProfile]) / 10) * 10,
  };
}

function positionStatus(pnlPct: number): PortfolioContextItem['positionStatus'] {
  if (pnlPct > 1)  return 'PROFIT';
  if (pnlPct < -1) return 'LOSS';
  return 'BREAKEVEN';
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
    const quantity     = Number(pos.quantity ?? 0);
    const pnlPct       = avgBuyPrice > 0
      ? ((currentPrice - avgBuyPrice) / avgBuyPrice) * 100
      : 0;

    return {
      symbol:        pos.symbol,
      quantity,
      avgBuyPrice,
      currentPrice,
      realPnLPct:    Number(pnlPct.toFixed(2)),
      positionValue: Math.round(quantity * currentPrice),
      positionStatus: positionStatus(pnlPct),
      ...calcTpSl(avgBuyPrice, riskProfile),
      technical: {
        trend3mPct:     sig?.trend3mPct     ?? 0,
        momentumPct:    sig?.momentumPct    ?? 0,
        volumeTrendPct: sig?.volumeTrendPct ?? 0,
        volatilityPct:  sig?.volatilityPct  ?? 0,
        action:         sig?.action         ?? 'WATCH',
        confidence:     sig?.confidence     ?? 'LOW',
      },
      news: sig?.news ?? [],
    };
  });
}

function trimPayloadForAI(context: PortfolioContextItem[]): PortfolioAiPayloadItem[] {
  return context.map(item => ({
    ...item,
    news: item.news
      .slice(0, AI_MAX_NEWS_PER_SYMBOL)
      .map(n => ({ title: n.title, sentiment: n.sentiment ?? 0 })),
  }));
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

// ================= PROMPT =================

function buildSystemPrompt(riskProfile: RiskProfile): string {
  const profileGuide: Record<RiskProfile, string> = {
    conservative: 'Ưu tiên bảo toàn vốn. Cắt lỗ sớm, chốt lời nhanh. Tránh gồng lỗ. Chỉ HOLD khi tín hiệu kỹ thuật vẫn tích cực.',
    balanced:     'Cân bằng lợi nhuận và rủi ro. Có thể gồng lỗ tối đa -7% nếu momentum chưa phá vỡ. Chốt từng phần khi lãi >10%.',
    aggressive:   'Chấp nhận biến động cao. Có thể gồng lỗ đến -10% nếu thesis còn nguyên. Để lãi chạy khi momentum mạnh.',
  };

  return `Bạn là chuyên gia phân tích danh mục chứng khoán Việt Nam, kết hợp VSA (Volume Spread Analysis) và phân tích tin tức.
Nhiệm vụ: Đánh giá TỪNG VỊ THẾ trong danh mục thực tế của khách hàng và đưa ra hành động cụ thể.

KHẨU VỊ RỦI RO: ${riskProfile.toUpperCase()}
${profileGuide[riskProfile]}

=== DỮ LIỆU MỖI VỊ THẾ ===
Mỗi vị thế bao gồm:
- symbol, quantity, avgBuyPrice (giá vốn), currentPrice (giá hiện tại)
- realPnLPct: % lãi/lỗ thực tế so với giá vốn (âm = đang lỗ)
- positionValue: giá trị vị thế hiện tại (VND) — dùng để đánh giá tỷ trọng
- positionStatus: PROFIT / LOSS / BREAKEVEN
- suggestedTp / suggestedSl: đã tính sẵn từ avgBuyPrice theo khẩu vị rủi ro
- technical.trend3mPct: xu hướng 3 tháng (%)
- technical.momentumPct: momentum slope (dương = đang tăng tốc, âm = giảm tốc)
- technical.volumeTrendPct: so sánh vol 5 phiên gần nhất vs trung bình (dương = dòng tiền vào)
- technical.volatilityPct: độ biến động hàng ngày annualised
- technical.action / confidence: tín hiệu kỹ thuật tổng hợp đã tính sẵn
- news[]: tin tức gần đây (title + sentiment, sentiment > 0 = tích cực, < 0 = tiêu cực)

=== QUY TẮC PHÂN TÍCH (BẮT BUỘC) ===

BƯỚC 1 — ĐỌC TRẠNG THÁI VỊ THẾ:
• Xác định đang PROFIT / LOSS / BREAKEVEN và biên độ cụ thể
• So sánh positionValue để biết mã nào có tỷ trọng lớn (rủi ro tập trung)

BƯỚC 2 — ĐỌC DÒNG TIỀN & MOMENTUM:
• volumeTrendPct > 20%: dòng tiền vào mạnh → tín hiệu tích cực
• volumeTrendPct < -20%: dòng tiền rút → cảnh báo
• momentumPct > 0 + trend3mPct > 0: uptrend còn nguyên
• momentumPct < 0 + trend3mPct < 0: downtrend, cân nhắc cắt lỗ
• Kết hợp VSA: vol nổ + giá tăng = gom hàng; vol nổ + giá không tăng = phân phối; vol cạn + giá không giảm = cạn cung

BƯỚC 3 — ĐỌC TIN TỨC:
• sentiment > 0: tin tích cực — kiểm tra xem vol có xác nhận không
• sentiment < 0: tin tiêu cực — kiểm tra xem vol có bùng nổ (bán tháo) hay cạn (thị trường bỏ qua)
• Tin tích cực + vol cạn = nguy hiểm (kéo xả, bull trap)
• Tin tiêu cực + vol cạn = thị trường không quan tâm, có thể giữ

BƯỚC 4 — QUYẾT ĐỊNH HÀNH ĐỘNG:
• BUY: chỉ khi đang PROFIT và momentum mạnh muốn mua thêm (averaging up), KHÔNG mua thêm khi đang lỗ
• HOLD: vị thế ổn định, thesis chưa bị phá vỡ
• REDUCE: lãi tốt (>12%) nhưng momentum đang yếu dần — chốt một phần
• SELL: lỗ vượt ngưỡng khẩu vị HOẶC momentum âm + tin xấu HOẶC vol phân phối rõ
• WATCH: tín hiệu mâu thuẫn, chờ thêm xác nhận

BƯỚC 5 — TP/SL:
• DÙNG suggestedTp và suggestedSl đã cung cấp làm điểm khởi đầu
• Có thể điều chỉnh dựa trên VSA (VD: vol nổ mạnh → nâng TP; phân phối ngầm → hạ SL)
• sl PHẢI < avgBuyPrice, tp PHẢI > avgBuyPrice — không ngoại lệ

=== ĐỊNH DẠNG REASON ===
Viết theo cấu trúc: [Trạng thái vị thế] → [Phân tích dòng tiền/VSA] → [Tác động tin tức] → [Kết luận hành động]
Ví dụ tốt: "Lỗ 4.2% từ giá vốn 28.500. Momentum âm, vol 5 phiên thấp hơn TB 30% — cạn cung nhưng chưa có dấu hiệu hút hàng. Tin kết quả kinh doanh Q1 tích cực nhưng vol không xác nhận — nghi ngờ bull trap. Khuyến nghị đặt alert tại 27.000, nếu bứt vol mới cân nhắc giữ."
Không viết: "Cổ phiếu đang có xu hướng tích cực, nên xem xét giữ."

=== OUTPUT JSON ===
Trả về DUY NHẤT một JSON hợp lệ, không có text ngoài JSON:
{
  "summary": "Tổng quan danh mục: phân tích dòng tiền tổng thể, tỷ trọng rủi ro, và 1-2 điểm nhấn quan trọng nhất cần hành động ngay.",
  "actions": [
    {
      "symbol": "string",
      "action": "BUY|HOLD|REDUCE|SELL|WATCH",
      "reason": "Phân tích theo cấu trúc 4 bước ở trên",
      "confidence": "LOW|MEDIUM|HIGH",
      "tp": number,
      "sl": number
    }
  ],
  "risks": [
    "Rủi ro cụ thể đang hiện diện trong danh mục này (không liệt kê chung chung)"
  ]
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

  const cacheKey = buildPortfolioCacheKey(user.id, parsed.data.risk_profile, transactions);

  if (!parsed.data.force_refresh) {
    const cached = getAiCache<AiPortfolioResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS) });
    }
  }

  const openHoldings     = deriveOpenHoldings(transactions);
  const positions        = groupHoldingsBySymbol(openHoldings);
  const symbols          = positions.map(p => p.symbol);
  const signals          = await buildTechnicalSignals(symbols);
  const portfolioContext = buildPortfolioContext(positions, signals, parsed.data.risk_profile);

  const fallback: AiPortfolioResponse = {
    summary: 'Đang dùng dữ liệu dự phòng. Hệ thống AI đánh giá dựa trên giá vốn hiện tại và tin tức.',
    actions: buildBaseActions(portfolioContext),
    risks:   ['Quản trị rủi ro T+2.5', 'Thị trường phân hóa'],
  };

  const apiKey  = envServer.OPENROUTER_API_KEY;
  const aiModel = envServer.OPENROUTER_MODEL || 'llama-3.3-70b-versatile';

  const aiResponse = apiKey
    ? await callOpenRouterJson<AiPortfolioResponse>(
        apiKey,
        aiModel,
        buildSystemPrompt(parsed.data.risk_profile),
        JSON.stringify(trimPayloadForAI(portfolioContext)),
        fallback,
      )
    : fallback;

  const finalResponse: AiPortfolioResponse = {
    ...aiResponse,
    // newsContext dùng full news (không trim) để hiển thị trên UI
    newsContext: Object.fromEntries(
      portfolioContext.map(item => [item.symbol, signals.find(s => s.symbol === item.symbol)?.news ?? []]),
    ),
  };

  setAiCache(cacheKey, finalResponse, PORTFOLIO_AI_CACHE_TTL_MS);

  return NextResponse.json({ ...finalResponse, ...buildAiCacheMeta(PORTFOLIO_AI_CACHE_TTL_MS) });
                                      }
