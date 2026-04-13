import { NextResponse } from 'next/server';

const SIEU_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SM-A705F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36',
  Referer: 'https://sieutinhieu.vn/',
  Accept: 'application/json',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get('symbol') || 'HPG').toUpperCase();
  const timeframe = (searchParams.get('timeframe') || '1D').toUpperCase();
  const limit = Number(searchParams.get('limit') || '5000');
  const start = Number(searchParams.get('start') || '1712676508');

  try {
    const url = `https://sieutinhieu.vn/api/v1/signals/performance?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(
      timeframe
    )}&limit=${Number.isFinite(limit) ? limit : 5000}&start=${Number.isFinite(start) ? start : 1712676508}`;

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
