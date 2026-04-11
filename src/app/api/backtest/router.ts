import { NextResponse } from 'next/server';
import { fetchBacktestData } from './service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
    const timeframe = (searchParams.get('timeframe') || '1D').toUpperCase();
    const limit = Number(searchParams.get('limit') || '5000');
    const start = Number(searchParams.get('start') || '1712824910');

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
    }

    const data = await fetchBacktestData(symbol, timeframe, limit, start);

    return NextResponse.json({
      provider: 'sieutinhieu',
      symbol,
      timeframe,
      limit: Number.isFinite(limit) ? limit : 5000,
      start: Number.isFinite(start) ? start : 1712824910,
      updatedAt: new Date().toISOString(),
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message === 'Missing symbol' ? 400 : message.startsWith('Upstream failed:') ? 502 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
