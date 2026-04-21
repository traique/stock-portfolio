import { fetchMarketPrices } from '@/lib/server/market';

// --- CẬP NHẬT TYPES MỚI ĐỂ CHỨA TIN TỨC --- //
type NewsHeadline = {
  title: string;
  source: string;
  pubDate: string;
};

type PriceHistory = {
  close: number[];
  high: number[];
  low: number[];
  volume: number[];
};

export type TechnicalSignal = {
  symbol: string;
  currentPrice: number;
  trend3mPct: number;
  volatilityPct: number;
  momentum5dPct: number;
  volumeTrendPct: number; // Trung bình 5 phiên gần nhất vs 3 tháng
  suggestedTp: number;
  suggestedSl: number;
  news: NewsHeadline[]; // THÊM MẢNG TIN TỨC VÀO ĐÂY
};

export type AiInsightResult = {
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

// --- CÁC HÀM TIỆN ÍCH CŨ --- //
function roundPrice(value: number) {
  return Math.round(value / 10) * 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNumberArray(input: unknown) {
  if (!Array.isArray(input)) return [] as number[];
  return input.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
}

// --- BỘ PHẬN 1: CÀO TIN TỨC RSS (GOOGLE NEWS) --- //
// Phương pháp này nhanh, miễn phí và không bị block IP trên Vercel
async function fetchNewsRSS(symbol: string): Promise<NewsHeadline[]> {
  const query = encodeURIComponent(`${symbol} VN chứng khoán`);
  // Google News RSS feed cho khu vực VN, tiếng Việt
  const url = `https://news.google.com/rss/search?q=${query}&hl=vi&gl=VN&ceid=VN:vi`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      // Cache tin tức 10 phút để tránh gọi quá nhiều lần
      next: { revalidate: 600 }, 
    });

    if (!response.ok) return [];
    
    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    const items = xmlDoc.getElementsByTagName("item");
    
    const news: NewsHeadline[] = [];
    // Chỉ lấy 4-5 tin mới nhất để AI đỡ bị quá tải token
    const limit = Math.min(5, items.length);
    
    for (let i = 0; i < limit; i += 1) {
      const title = items[i]?.getElementsByTagName("title")?.[0]?.textContent || "";
      const source = items[i]?.getElementsByTagName("source")?.[0]?.textContent || "";
      const pubDate = items[i]?.getElementsByTagName("pubDate")?.[0]?.textContent || "";
      
      if (title) {
        // Dọn dẹp tiêu đề: thường tiêu đề Google News dính tên nguồn ở cuối như "- CafeF"
        // Chúng ta cắt nó ra để lưu source riêng cho AI dễ đọc
        const cleanTitle = title.split(' - ')[0] || title;
        news.push({ title: cleanTitle.trim(), source, pubDate });
      }
    }
    return news;
  } catch (err) {
    console.error(`Lỗi cào tin tức ${symbol}:`, err);
    return [];
  }
}

// --- CÁC HÀM LẤY GIÁ & VOLUME CŨ --- //
async function fetchHistory(symbol: string): Promise<PriceHistory> {
  const ticker = symbol === 'VNINDEX' ? '^VNINDEX' : `${symbol}.VN`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?interval=1d&range=3mo`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
    cache: 'no-store',
  });

  if (!response.ok) return { close: [], high: [], low: [], volume: [] };

  const payload = await response.json();
  const quote = payload?.chart?.result?.[0]?.indicators?.quote?.[0] || {};

  return {
    close: toNumberArray(quote.close),
    high: toNumberArray(quote.high),
    low: toNumberArray(quote.low),
    volume: toNumberArray(quote.volume),
  };
}

function calcVolatilityFromCloses(closes: number[]) {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0 && curr > 0) returns.push((curr - prev) / prev);
  }
  if (!returns.length) return 2;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.length > 1 ? returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1) : 0;
  return Math.sqrt(Math.max(variance, 0)) * 100;
}

function calcSignalsFromHistory(history: PriceHistory, currentPrice: number) {
  const { close: closes, volume: volumes } = history;
  if (!closes.length || currentPrice <= 0) {
    return { trend3mPct: 0, volatilityPct: 2, momentum5dPct: 0, volumeTrendPct: 0, suggestedTp: roundPrice(currentPrice * 1.08), suggestedSl: roundPrice(currentPrice * 0.95) };
  }

  const lastIdx = closes.length - 1;
  const first = closes[0];
  const last = closes[lastIdx];
  
  const trend3mPct = first > 0 ? ((last - first) / first) * 100 : 0;
  const lookback = Math.min(5, lastIdx);
  const momentumBase = closes[Math.max(0, lastIdx - lookback)] || last;
  const momentum5dPct = momentumBase > 0 ? ((last - momentumBase) / momentumBase) * 100 : 0;

  // Phân tích Dòng tiền
  const avgVolume = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const volumeTrendPct = avgVolume > 0 ? ((recentVolume - avgVolume) / avgVolume) * 100 : 0;

  const volatilityPct = calcVolatilityFromCloses(closes);
  
  // Logic TP/SL linh hoạt theo độ biến động
  const baseRiskPct = clamp(volatilityPct * 1.5, 3, 10);
  const rewardMultiplier = volumeTrendPct > 20 && momentum5dPct > 0 ? 3 : 2;

  return {
    trend3mPct,
    volatilityPct,
    momentum5dPct,
    volumeTrendPct,
    suggestedTp: roundPrice(currentPrice * (1 + (baseRiskPct * rewardMultiplier) / 100)),
    suggestedSl: roundPrice(currentPrice * (1 - baseRiskPct / 100)),
  };
}

// --- BỘ PHẬN 2: GHÉP NỐI DỮ LIỆU KỸ THUẬT & TIN TỨC --- //
export async function buildTechnicalSignals(symbols: string[]): Promise<TechnicalSignal[]> {
  const payload = await fetchMarketPrices(symbols, true);
  return await Promise.all(symbols.map(async (symbol) => {
    const currentPrice = Number(payload.prices[symbol] || 0);
    
    // Gọi song song cả lịch sử giá và tin tức để tối ưu tốc độ
    const [history, news] = await Promise.all([
      fetchHistory(symbol),
      fetchNewsRSS(symbol), // Gọi hàm cào tin
    ]);
    
    const stats = calcSignalsFromHistory(history, currentPrice);
    
    return { 
      symbol, 
      currentPrice, 
      trend3mPct: stats.trend3mPct, 
      volatilityPct: stats.volatilityPct, 
      momentum5dPct: stats.momentum5dPct,
      volumeTrendPct: stats.volumeTrendPct,
      suggestedTp: stats.suggestedTp, 
      suggestedSl: stats.suggestedSl,
      news, // Đưa tin tức vào Signal gửi đi
    } satisfies TechnicalSignal;
  }));
}

function extractJsonFromText(input: string) {
  const match = input.match(/\{[\s\S]*\}/);
  return match ? match[0] : input;
}

export async function callOpenRouterJson<T>(
  apiKey: string | undefined,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  fallback: T
): Promise<T> {
  if (!apiKey) return fallback;

  // --- BỘ PHẬN 3: PROMPT CHUYÊN GIA TÌNH BÁO THỊ TRƯỜNG --- //
  const expertSystemPrompt = `${systemPrompt}
  
NHẬM VAI: Bạn là một Giám đốc Chiến lược & Tình báo Tự doanh Chứng khoán Việt Nam. Bạn có 20 năm kinh nghiệm kết hợp VSA (Volume Spread Analysis) và tin tức vĩ mô/tin đồn doanh nghiệp.

NHIỆM VỤ QUAN TRỌNG NHẤT: Phân tích danh mục dựa trên tương quan giữa GIÁ, DÒNG TIỀN (Khối lượng) và TIN TỨC.

TƯ DUY PHÂN TÍCH (Lưu ý T+2.5 và Vùng 1300):
1. Đọc News Sentiment: Nhận diện tin tức là Tích cực (Lãi lớn, M&A...), Tiêu cực (Bắt bớ, Thua lỗ, Margin Call...) hay chỉ là Tin đồn đồn thổi thất thiệt?
2. Đối chiếu Tin tức vs Dòng tiền (VSA): 
   - Nếu Tin Tích cực + Volume nổ mạnh (volumeTrendPct dương lớn): Confirm dòng tiền lớn vào, "Tin ra để gom hàng dứt khoát".
   - Nếu Tin Tích cực + Volume sụt giảm: Cảnh báo "Kéo xả/Bull-trap", "Tin ra để bán ròng".
   - Nếu Tin Tiêu cực + Volume lớn: "Xả hàng tháo chạy", "Margin Call diện rộng".
   - Nếu Tin Tiêu cực + Volume cạn kiệt (volumeTrendPct âm): "Rũ bỏ cạn cung", "Dấu hiệu test đáy thành công".
3. Nhạy bén thị trường: Am hiểu các yếu tố vĩ mô thực tế (áp lực tỷ giá SBV, KRX, phái sinh đáo hạn).

VĂN PHONG VÀ THUẬT NGỮ VN-INDEX:
- Dùng từ ngữ thực chiến: Cạn cung, test đáy, bùng nổ, phân phối ngầm, rũ bỏ kịch liệt, bẫy tăng giá (bull-trap), gãy nền, tháo chạy, margin call, thoái vốn, 'game'.
- Lý do (reason) phải ngắn gọn, sắc nét, thể hiện sự am hiểu tương quan Giá/Vol/Tin.

YÊU CẦU TRẢ VỀ JSON DUY NHẤT. KHÔNG CÓ VĂN BẢN THỪA.`;

  let retries = 2;
  while (retries >= 0) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          temperature: 0.15,
          response_format: { type: "json_object" },
          messages: [
            { role: 'system', content: expertSystemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        cache: 'no-store',
      });

      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        retries--;
        continue;
      }

      if (!response.ok) return fallback;
      const payload = await response.json();
      const text = payload?.choices?.[0]?.message?.content;
      if (!text) return fallback;

      return JSON.parse(extractJsonFromText(text)) as T;
    } catch (err) {
      console.error("Lỗi AI:", err);
      return fallback;
    }
  }
  return fallback;
}
