import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildTechnicalSignals, callOpenRouterJson, TechnicalSignal } from '@/lib/server/ai-insights';
import { validationErrorResponse } from '@/lib/server/api-utils';
import { envServer } from '@/lib/env-server';
import { buildAiCacheMeta, getAiCache, setAiCache } from '@/lib/server/ai-cache';

// ================= TYPES =================

const bodySchema = z.object({
  symbols: z.array(z.string().trim().toUpperCase()).min(1).max(60),
  risk_profile: z.enum(['conservative', 'balanced', 'aggressive']).optional().default('balanced'),
  force_refresh: z.boolean().optional(),
});

type RiskProfile = z.infer<typeof bodySchema>['risk_profile'];

type WatchlistPick = {
  symbol: string;
  score: number;
  reason: string;
  entry: number;
  tp: number;
  sl: number;
};

type WatchlistScanResponse = {
  summary: string;
  picks: WatchlistPick[];
  avoid: string[];
  newsContext?: Record<string, TechnicalSignal['news']>;
};

type WatchlistContextItem = {
  symbol: string;
  currentPrice: number;
  score: number;
  technical: {
    trend3mPct: number;
    momentumPct: number;
    volatilityPct: number;
    volumeTrendPct: number;
  };
  news: TechnicalSignal['news'];
  suggestedTp: number;
  suggestedSl: number;
};

// ================= CONSTANTS =================

const WATCHLIST_AI_CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_VERSION              = 'v5';
const MAX_SYMBOLS                = 60;
const SCORE_BASE                 = 50;
const AVOID_THRESHOLD            = 45;
const TOP_PICKS                  = 5;
const AI_MAX_CANDIDATES          = 20;
const AI_MAX_NEWS_PER_SYMBOL     = 3;

// ================= HELPERS =================

function buildWatchlistCacheKey(riskProfile: string, symbols: string[]): string {
  return `ai:watchlist:${CACHE_VERSION}:${riskProfile}:${symbols.join(',')}`;
}

function scoreSignal(s: TechnicalSignal): number {
  const trendScore    = Math.max(-20, Math.min(20, s.trend3mPct));
  const momentumScore = Math.max(-15, Math.min(15, s.momentumPct * 1.5));
  const volumeScore   = Math.max(-15, Math.min(15, s.volumeTrendPct * 0.5));
  const newsScore     = s.news.length > 0 ? 5 : 0;
  const volPenalty    = s.volatilityPct * 0.5;

  return Number(
    (SCORE_BASE + trendScore + momentumScore + volumeScore + newsScore - volPenalty).toFixed(2),
  );
}

function buildWatchlistContext(signals: TechnicalSignal[]): WatchlistContextItem[] {
  return signals
    .map(s => ({
      symbol:       s.symbol,
      currentPrice: s.currentPrice,
      score:        scoreSignal(s),
      technical: {
        trend3mPct:     s.trend3mPct,
        momentumPct:    s.momentumPct,
        volatilityPct:  s.volatilityPct,
        volumeTrendPct: s.volumeTrendPct,
      },
      news:        s.news,
      suggestedTp: s.suggestedTp,
      suggestedSl: s.suggestedSl,
    }))
    .sort((a, b) => b.score - a.score);
}

function buildFallback(context: WatchlistContextItem[]): WatchlistScanResponse {
  return {
    summary: 'Đang dùng dữ liệu dự phòng. Quét kỹ thuật dựa trên Trend, Momentum và Tin tức.',
    picks: context.slice(0, TOP_PICKS).map(s => ({
      symbol: s.symbol,
      score:  s.score,
      reason: `Score: ${s.score} | Trend: ${s.technical.trend3mPct.toFixed(1)}% | Dòng tiền: ${s.technical.volumeTrendPct > 0 ? 'Vào' : 'Cạn'}`,
      entry:  s.currentPrice,
      tp:     s.suggestedTp,
      sl:     s.suggestedSl,
    })),
    avoid: context.filter(r => r.score < AVOID_THRESHOLD).map(r => r.symbol),
  };
}

/**
 * Trim payload trước khi gửi Groq để tránh 413.
 * Chỉ giữ top AI_MAX_CANDIDATES, trim news còn title + sentiment.
 * newsContext trả về client vẫn là full data.
 */
function trimPayloadForAI(context: WatchlistContextItem[]) {
  return context.slice(0, AI_MAX_CANDIDATES).map(s => ({
    symbol:       s.symbol,
    currentPrice: s.currentPrice,
    score:        s.score,
    technical:    s.technical,
    suggestedTp:  s.suggestedTp,
    suggestedSl:  s.suggestedSl,
    news: s.news.slice(0, AI_MAX_NEWS_PER_SYMBOL).map(n => ({
      title:     n.title,
      sentiment: n.sentiment ?? 0,
    })),
  }));
}

// ================= PROMPT =================

function buildSystemPrompt(riskProfile: RiskProfile): string {
  const entryGuide: Record<RiskProfile, string> = {
    conservative: 'Chỉ chọn mã có score > 55, volatility thấp (<8%), và tin tức tích cực rõ ràng. Tối đa 3 picks.',
    balanced:     'Chọn mã có score > 50, cân bằng momentum và vol. Tối đa 5 picks.',
    aggressive:   'Có thể chọn mã score > 45 nếu momentum đang bùng nổ mạnh. Tối đa 7 picks.',
  };

  return `Bạn là chuyên gia quét cơ hội chứng khoán Việt Nam, chuyên VSA (Volume Spread Analysis) và đọc vị dòng tiền.
Nhiệm vụ: Từ danh sách watchlist, lọc ra những mã ĐÁNG MUA ngay bây giờ và những mã cần TRÁNH.

KHẨU VỊ RỦI RO: ${riskProfile.toUpperCase()}
${entryGuide[riskProfile]}

=== DỮ LIỆU MỖI MÃ ===
- symbol, currentPrice: mã và giá hiện tại
- score: điểm kỹ thuật tổng hợp (0-100, cao hơn = tốt hơn)
- suggestedTp / suggestedSl: vùng TP/SL tính từ currentPrice theo volatility
- technical.trend3mPct: xu hướng 3 tháng (%)
- technical.momentumPct: tốc độ thay đổi giá (dương = đang tăng tốc)
- technical.volumeTrendPct: so sánh vol 5 phiên vs TB (dương = dòng tiền vào)
- technical.volatilityPct: độ biến động — càng cao càng rủi ro
- news[]: tin tức gần đây với sentiment (-1 đến +1)

=== FRAMEWORK PHÂN TÍCH ===

PHASE IDENTIFICATION — Xác định pha thị trường của từng mã:
• ACCUMULATION (Tích lũy): giá đi ngang hoặc nhích tăng + vol thấp dần → chuẩn bị bùng nổ
• MARKUP (Tăng tốc): trend dương + momentum dương + vol tăng → đang trong sóng tăng
• DISTRIBUTION (Phân phối): giá cao + vol nổ nhưng giá không tăng thêm → cá mập đang xả
• MARKDOWN (Giảm): trend âm + momentum âm → tránh

ĐIỂM MUA TỐT (PICKS) — Cần hội tụ ít nhất 3 trong 5 tiêu chí:
1. Score > ngưỡng theo risk profile
2. volumeTrendPct > 10% (dòng tiền đang vào)
3. momentumPct > 0 (đà tăng chưa tắt)
4. Tin tức sentiment >= 0 hoặc tin xấu nhưng vol không xác nhận (cạn cung)
5. Pha ACCUMULATION hoặc MARKUP, không phải DISTRIBUTION

DẤU HIỆU TRÁNH (AVOID):
• Pha DISTRIBUTION: vol nổ + giá không tăng
• Bull trap: tin tích cực + vol cạn (< -20%)
• Momentum âm mạnh (< -3%) kéo dài
• Tin xấu + vol bùng nổ (bán tháo chưa xong)
• volatilityPct > 15% với risk profile conservative

SO SÁNH TƯƠNG ĐỐI:
• Xếp hạng các mã có score gần nhau — ưu tiên mã vol xác nhận hơn mã vol cạn
• Nếu toàn bộ watchlist đều yếu → nói thẳng, chỉ picks mã tốt nhất tương đối, không ép đủ số lượng

=== ĐỊNH DẠNG REASON ===
Cấu trúc: [Pha thị trường] → [Tín hiệu vol/momentum] → [Tin tức] → [Điểm vào]
Ví dụ tốt: "Pha tích lũy 3 tuần, vol 5 phiên tăng 35% vs TB — dấu hiệu cá mập đang gom. Tin kết quả kinh doanh Q1 tích cực, vol xác nhận. Entry vùng hiện tại, SL dưới đáy tích lũy."
Không viết: "Cổ phiếu có tiềm năng tăng trưởng tốt."

=== OUTPUT JSON ===
Trả về DUY NHẤT một JSON hợp lệ, không có text ngoài JSON:
{
  "summary": "Nhận định tổng thể dòng tiền: bao nhiêu mã đang tích lũy, bao nhiêu phân phối, thị trường đang ở giai đoạn nào. Nếu ít cơ hội thì nói thẳng.",
  "picks": [
    {
      "symbol": "string",
      "score": number,
      "reason": "Phân tích theo framework pha + vol + tin tức",
      "entry": number,
      "tp": number,
      "sl": number
    }
  ],
  "avoid": ["HPG (phân phối, vol xả mạnh)", "VIC (momentum âm, tin xấu chưa hấp thụ)"]
}`;
}

// ================= HANDLER =================

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const symbols  = [...new Set(parsed.data.symbols)].slice(0, MAX_SYMBOLS).sort();
  const cacheKey = buildWatchlistCacheKey(parsed.data.risk_profile, symbols);

  if (!parsed.data.force_refresh) {
    const cached = getAiCache<WatchlistScanResponse>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS) });
    }
  }

  const signals          = await buildTechnicalSignals(symbols);
  const watchlistContext = buildWatchlistContext(signals);
  const fallback         = buildFallback(watchlistContext);

  const apiKey    = envServer.OPENROUTER_API_KEY;
  const aiModel   = envServer.OPENROUTER_MODEL || 'llama-3.3-70b-versatile';
  const aiPayload = trimPayloadForAI(watchlistContext);

  const aiResponse = apiKey
    ? await callOpenRouterJson<WatchlistScanResponse>(
        apiKey,
        aiModel,
        buildSystemPrompt(parsed.data.risk_profile),
        JSON.stringify({ watchlistContext: aiPayload, risk_profile: parsed.data.risk_profile }),
        fallback,
      )
    : fallback;

  const finalResponse: WatchlistScanResponse = {
    ...aiResponse,
    // newsContext = full news cho UI, không trim
    newsContext: Object.fromEntries(
      watchlistContext.map(s => [s.symbol, s.news]),
    ),
  };

  setAiCache(cacheKey, finalResponse, WATCHLIST_AI_CACHE_TTL_MS);

  return NextResponse.json({ ...finalResponse, ...buildAiCacheMeta(WATCHLIST_AI_CACHE_TTL_MS) });
    }
