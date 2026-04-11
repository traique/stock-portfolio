import { NextResponse } from 'next/server';

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
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 30), 1), 100);
    const signalType = (searchParams.get('type') || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';

    const timeframe = (searchParams.get('timeframe') || '1D').toUpperCase();
    const upstream = `https://sieutinhieu.vn/api/v1/realtime-signals/live-signals/today-trend-changes?limit=${limit}&timeframe=${timeframe}&signal_type=${signalType}&include_all_today=false&sort_by=trading_value`;

    const response = await fetch(upstream, {
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Upstream failed: ${response.status}` }, { status: 502 });
    }

    const payload = await response.json();
    const signals = Array.isArray(payload?.signals)
      ? (payload.signals as SystemSignal[])
      : Array.isArray(payload?.data?.signals)
      ? (payload.data.signals as SystemSignal[])
      : Array.isArray(payload?.data)
      ? (payload.data as SystemSignal[])
      : [];

    return NextResponse.json({
      provider: 'sieutinhieu',
      type: signalType,
      updatedAt: new Date().toISOString(),
      count: signals.length,
      signals,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
