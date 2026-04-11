import { NextResponse } from 'next/server';

const headers = {
  Origin: 'https://sieutinhieu.vn',
  Referer: 'https://sieutinhieu.vn/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    const timeframe = (searchParams.get('timeframe') || '1D').toUpperCase();

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
    }

    const upstream = `https://sieutinhieu.vn/api/v1/signals/performance?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=5000&start=1712676508`;
    const response = await fetch(upstream, { headers, cache: 'no-store' });

    if (!response.ok) {
      return NextResponse.json({ error: `Upstream failed: ${response.status}` }, { status: 502 });
    }

    const payload = await response.json();
    const data = payload?.data ?? payload;

    return NextResponse.json({
      provider: 'sieutinhieu',
      symbol,
      timeframe,
      updatedAt: new Date().toISOString(),
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
