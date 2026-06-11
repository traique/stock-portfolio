import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validationErrorResponse } from '@/lib/server/api-utils';

// TỐI ƯU: Sử dụng User-Agent chuẩn của Desktop và thêm Origin để vượt qua tường lửa
const SIEU_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Origin: 'https://sieutinhieu.vn',
  Referer: 'https://sieutinhieu.vn/',
  Accept: 'application/json',
};

const querySchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,10}$/).optional().default('HPG'),
  timeframe: z.string().trim().toUpperCase().optional().default('1D'),
  limit: z.coerce.number().int().min(1).max(10000).optional().default(5000),
  // Mặc định lùi về khoảng thời gian đủ dài nếu không truyền
  start: z.coerce.number().int().min(1).optional().default(1672531200), // 01/01/2023
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { symbol, timeframe, limit, start } = parsed.data;

  try {
    const url = `https://sieutinhieu.vn/api/v1/signals/performance?symbol=${encodeURIComponent(
      symbol
    )}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}&start=${start}`;

    // TỐI ƯU: Đặt timeout 10 giây để không làm treo server của bạn
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      headers: SIEU_HEADERS,
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Upstream API từ chối kết nối. Mã lỗi: ${res.status}`);
    }

    const payload = await res.json();
    const data = payload?.data ?? payload;

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    console.error('Performance fetch error:', isTimeout ? 'Timeout' : error);
    
    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? 'Hết thời gian chờ phản hồi từ nguồn dữ liệu.' : 'Lỗi khi tải dữ liệu backtest.',
      },
      { status: 500 }
    );
  }
}
