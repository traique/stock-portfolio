import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validationErrorResponse } from '@/lib/server/api-utils';

type SystemSignal = {
  symbol: string;
  signal_type: string;
  price?: number | null;
  trading_value?: number | null;
  timestamp?: string | null;
  created_at?: string | null;
  ts?: number | null;
};

const headers = {
  Origin: 'https://sieutinhieu.vn',
  Referer: 'https://sieutinhieu.vn/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

const querySchema = z.object({
  // TỐI ƯU: Nâng max lên 200 để đồng bộ với Frontend
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  type: z.enum(['BUY', 'SELL']).optional().default('BUY'),
  timeframe: z.string().trim().toUpperCase().optional().default('1D'),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { limit, type, timeframe } = parsed.data;

  try {
    const upstream = `https://sieutinhieu.vn/api/v1/realtime-signals/live-signals/today-trend-changes?limit=${limit}&timeframe=${timeframe}&signal_type=${type}&include_all_today=false&sort_by=trading_value`;

    // TỐI ƯU: Ngắt kết nối nếu quá 10 giây (chống treo server của bạn)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(upstream, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Nguồn dữ liệu từ chối kết nối (Mã lỗi: ${response.status})` },
        { status: 502 }
      );
    }

    const payload = await response.json();
    
    // TỐI ƯU: Lấy dữ liệu an toàn và gọn gàng hơn
    const rawSignals = Array.isArray(payload?.signals) ? payload.signals
                     : Array.isArray(payload?.data?.signals) ? payload.data.signals
                     : Array.isArray(payload?.data) ? payload.data : [];

    const signals = rawSignals as SystemSignal[];

    return NextResponse.json({
      provider: 'sieutinhieu',
      type,
      updatedAt: new Date().toISOString(),
      count: signals.length,
      signals,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    const message = isTimeout 
      ? 'Hết thời gian chờ phản hồi từ máy chủ nguồn.' 
      : error instanceof Error ? error.message : 'Lỗi không xác định';
      
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
