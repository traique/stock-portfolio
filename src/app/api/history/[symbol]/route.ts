// src/app/api/history/[symbol]/route.ts
//
// Proxy Yahoo Finance OHLCV — được gọi bởi Supabase Edge Function (EOD mode).
// HOSE: Yahoo trả data OK
// HNX/UPCOM: Yahoo trả 404 → trả { count: 0 } thay vì error 502
//            Edge Function sẽ skip symbol này (không crash)

import { NextResponse, type NextRequest } from 'next/server';
import { getExchange } from '@/lib/server/exchanges/exchange';

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

  // HNX/UPCOM — Yahoo không có data, trả empty ngay (không waste request)
  const exchange = getExchange(sym);
  if (exchange === 'HNX' || exchange === 'UPCOM') {
    return NextResponse.json({
      symbol, exchange, count: 0,
      closes: [], highs: [], lows: [], volumes: [], timestamps: [], trade_dates: [],
      note: `${exchange} không có trên Yahoo Finance`,
    });
  }

  const ticker = sym === 'VNINDEX' ? '^VNINDEX' : `${sym}.VN`;
  const range  = days <= 7 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : '6mo';

  for (const host of YAHOO_HOSTS) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
          },
          next: { revalidate: 3600 },
        }
      );
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp ?? [];
      const q = result.indicators?.quote?.[0] ?? {};

      const valid = timestamps
        .map((t, i) => ({
          t,
          c: Number(q.close?.[i]),
          h: Number(q.high?.[i]),
          l: Number(q.low?.[i]),
          v: Number(q.volume?.[i] ?? 0),
        }))
        .filter(d => Number.isFinite(d.c) && d.c > 0);

      if (valid.length < 5) continue;

      return NextResponse.json({
        symbol, ticker, host, exchange: exchange ?? 'HOSE',
        count:       valid.length,
        closes:      valid.map(d => d.c),
        highs:       valid.map(d => d.h),
        lows:        valid.map(d => d.l),
        volumes:     valid.map(d => d.v),
        timestamps:  valid.map(d => d.t),
        trade_dates: valid.map(d => new Date(d.t * 1000).toISOString().slice(0, 10)),
      });
    } catch { continue; }
  }

  // Yahoo fail nhưng không crash — trả empty để Edge Function skip
  return NextResponse.json({
    symbol, exchange: exchange ?? 'HOSE', count: 0,
    closes: [], highs: [], lows: [], volumes: [], timestamps: [], trade_dates: [],
    note: `Yahoo fail cho ${ticker}`,
  });
}
