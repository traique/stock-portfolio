// src/app/api/history/[symbol]/route.ts
//
// Proxy Yahoo Finance OHLCV — được gọi bởi Supabase Edge Function (EOD mode).
// Vercel Washington DC có thể fetch Yahoo; Supabase Singapore bị block.
//
// GET /api/history/BID?days=90
// Trả về: { symbol, closes[], highs[], lows[], volumes[], count }

import { NextResponse, type NextRequest } from 'next/server';

const YAHOO_HOSTS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const sym  = symbol.toUpperCase();
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '90', 10);

  if (!sym || !/^[A-Z0-9]{2,10}$/.test(sym)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  // VNINDEX dùng ^VNINDEX
  const ticker = sym === 'VNINDEX' ? '^VNINDEX' : `${sym}.VN`;

  // Map days → Yahoo range param
  const range = days <= 7 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : '6mo';

  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept':     '*/*',
        },
        next: { revalidate: 3600 },
      });

      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp ?? [];
      const q = result.indicators?.quote?.[0] ?? {};

      const closes:  number[] = (q.close  ?? []).map(Number);
      const highs:   number[] = (q.high   ?? []).map(Number);
      const lows:    number[] = (q.low    ?? []).map(Number);
      const volumes: number[] = (q.volume ?? []).map(Number);

      // Filter invalid candles
      const valid = timestamps
        .map((t, i) => ({
          t,
          c: closes[i],
          h: highs[i],
          l: lows[i],
          v: volumes[i] ?? 0,
        }))
        .filter(d => Number.isFinite(d.c) && d.c > 0);

      if (valid.length < 10) continue;

      return NextResponse.json({
        symbol:       sym,
        ticker,
        host,
        count:        valid.length,
        closes:       valid.map(d => d.c),
        highs:        valid.map(d => d.h),
        lows:         valid.map(d => d.l),
        volumes:      valid.map(d => d.v),
        timestamps:   valid.map(d => d.t),
        trade_dates:  valid.map(d => new Date(d.t * 1000).toISOString().slice(0, 10)),
      });
    } catch { continue; }
  }

  return NextResponse.json(
    { error: `Yahoo fail cho ${ticker}`, symbol: sym },
    { status: 502 }
  );
      }
