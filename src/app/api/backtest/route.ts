import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validationErrorResponse } from '@/lib/server/api-utils';

const SIEU_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Origin: 'https://sieutinhieu.vn',
  Referer: 'https://sieutinhieu.vn/',
  Accept: 'application/json',
};
const BASE = 'https://sieutinhieu.vn/api/v1';

const querySchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,10}$/).optional().default('HPG'),
  timeframe: z.enum(['1D']).optional().default('1D'),
  limit: z.coerce.number().int().min(1).max(10000).optional().default(5000),
  start: z.coerce.number().int().min(1).optional().default(1672531200), // 01/01/2023
});

// HỆ SỐ ƯỚC LƯỢNG từ mẫu SHS @18.40 (Vùng vào 18.2–18.6, TP1 20.1, SL 17.3).
// CẦN CALIBRATE thêm vài mã rồi chỉnh cho khớp app thật.
const PLAN_CONFIG = { ENTRY_BAND: 0.011, TP_PCT: 0.09, SL_PCT: 0.06 };
const r1 = (n: number) => Math.round(n * 10) / 10;

type RawSignal = {
  signal_type: 'BUY' | 'SELL';
  price: string;
  timestamp: string;
  ma20_value: string | null;
  macd_value: string | null;
  macd_histogram: string | null;
  volume: number | null;
};

async function fetchSieu<T>(
  path: string,
  params: Record<string, string>,
  timeoutMs = 10000
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: SIEU_HEADERS,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPlan(type: 'BUY' | 'SELL', price: number) {
  const { ENTRY_BAND, TP_PCT, SL_PCT } = PLAN_CONFIG;
  const isBuy = type === 'BUY';
  const tp = isBuy ? price * (1 + TP_PCT) : price * (1 - TP_PCT);
  const sl = isBuy ? price * (1 - SL_PCT) : price * (1 + SL_PCT);
  const reward = Math.abs(tp - price);
  const risk = Math.abs(price - sl);
  return {
    entry_low: r1(price * (1 - ENTRY_BAND)),
    entry_high: r1(price * (1 + ENTRY_BAND)),
    take_profit: r1(tp),
    stop_loss: r1(sl),
    profit_pct: +(TP_PCT * 100).toFixed(1),
    risk_reward: risk > 0 ? +(reward / risk).toFixed(2) : null,
  };
}

function deriveStrength(s: RawSignal): string {
  const hist = Number(s.macd_histogram ?? 0);
  const isBuy = s.signal_type === 'BUY';
  const strong = isBuy ? hist > 0 : hist < 0;
  return strong ? (isBuy ? 'STRONG BUY' : 'STRONG SELL') : s.signal_type;
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) return validationErrorResponse(parsed.error);
  const { symbol, timeframe, limit, start } = parsed.data;

  try {
    // Gọi song song: backtest performance + tín hiệu mới nhất
    const [perf, signals] = await Promise.all([
      fetchSieu<Record<string, unknown>>('/signals/performance', {
        symbol,
        timeframe,
        limit: String(limit),
        start: String(start),
      }),
      fetchSieu<RawSignal[]>('/signals/latest', {
        symbol,
        timeframe,
        limit: '1',
      }).catch(() => null), // tín hiệu là phụ, lỗi thì bỏ qua
    ]);

    const base = ((perf as any)?.data ?? perf ?? {}) as Record<string, unknown>;
    const latest = Array.isArray(signals) ? signals[0] : null;

    let signal: unknown = null;
    let plan: unknown = null;
    if (latest) {
      const price = Number(latest.price);
      signal = {
        type: deriveStrength(latest),
        raw_type: latest.signal_type,
        confirmed_at: price,
        timestamp: latest.timestamp,
      };
      plan = buildPlan(latest.signal_type, price);
    }

    return NextResponse.json({
      success: true,
      data: { ...base, symbol, signal, plan },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    console.error('Backtest fetch error:', isTimeout ? 'Timeout' : error);
    return NextResponse.json(
      {
        success: false,
        error: isTimeout
          ? 'Hết thời gian chờ phản hồi từ nguồn dữ liệu.'
          : 'Lỗi khi tải dữ liệu backtest.',
      },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
