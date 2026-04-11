import { NextResponse } from 'next/server';

const headers = {
  Origin: 'https://sieutinhieu.vn',
  Referer: 'https://sieutinhieu.vn/',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 11; SM-A705F Build/RP1A.200720.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36',
  Accept: '*/*',
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
