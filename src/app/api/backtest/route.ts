import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validationErrorResponse } from '@/lib/server/api-utils';

const SIEU_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 11; SM-A705F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36',
  Referer: 'https://sieutinhieu.vn/',
  Accept: 'application/json',
};

const querySchema = z.object({
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,10}$/)
    .optional()
    .default('HPG'),
  timeframe: z.string().trim().toUpperCase().optional().default('1D'),
  limit: z.coerce.number().int().min(1).max(10000).optional().default(5000),
  start: z.coerce.number().int().min(1).optional().default(1712676508),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { symbol, timeframe, limit, start } = parsed.data;

  try {
    const url = `https://sieutinhieu.vn/api/v1/signals/performance?symbol=${encodeURIComponent(
      symbol
    )}&timeframe=${encodeURIComponent(timeframe)}&limit=${limit}&start=${start}`;

    const res = await fetch(url, {
      headers: SIEU_HEADERS,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const payload = await res.json();

    return NextResponse.json({
      success: true,
      data: payload?.data ?? payload,
    });
  } catch (error) {
    console.error('Performance fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch performance data',
      },
      { status: 500 }
    );
  }
      }
