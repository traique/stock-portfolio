// src/app/api/test-yahoo/route.ts
// Test Yahoo Finance từ Vercel server-side (không bị CORS)
// Xóa file này sau khi test xong

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const sym = req.nextUrl.searchParams.get('sym') ?? 'BID';
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${sym}.VN?interval=1d&range=3mo`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      const q = json?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
      const closes  = (q.close  ?? []).map(Number).filter((v: number) => isFinite(v) && v > 0);
      const volumes = (q.volume ?? []).map(Number).filter((v: number) => isFinite(v) && v >= 0);
      const highs   = (q.high   ?? []).map(Number).filter((v: number) => isFinite(v) && v > 0);
      const lows    = (q.low    ?? []).map(Number).filter((v: number) => isFinite(v) && v > 0);

      if (closes.length < 5) continue;

      return NextResponse.json({
        ok:           true,
        symbol:       sym,
        host,
        closes_count: closes.length,
        last_close:   closes.at(-1),
        has_ohlcv:    highs.length > 0,
        sample: {
          closes:  closes.slice(-5),
          highs:   highs.slice(-5),
          lows:    lows.slice(-5),
          volumes: volumes.slice(-5),
        },
      });
    } catch (err) {
      continue;
    }
  }

  return NextResponse.json({
    ok:    false,
    error: `Yahoo fail cho ${sym}.VN từ cả 2 hosts`,
  }, { status: 502 });
}// src/app/api/test-yahoo/route.ts
// Test Yahoo Finance từ Vercel server-side (không bị CORS)
// Xóa file này sau khi test xong

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const sym = req.nextUrl.searchParams.get('sym') ?? 'BID';
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${sym}.VN?interval=1d&range=3mo`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      const q = json?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
      const closes  = (q.close  ?? []).map(Number).filter((v: number) => isFinite(v) && v > 0);
      const volumes = (q.volume ?? []).map(Number).filter((v: number) => isFinite(v) && v >= 0);
      const highs   = (q.high   ?? []).map(Number).filter((v: number) => isFinite(v) && v > 0);
      const lows    = (q.low    ?? []).map(Number).filter((v: number) => isFinite(v) && v > 0);

      if (closes.length < 5) continue;

      return NextResponse.json({
        ok:           true,
        symbol:       sym,
        host,
        closes_count: closes.length,
        last_close:   closes.at(-1),
        has_ohlcv:    highs.length > 0,
        sample: {
          closes:  closes.slice(-5),
          highs:   highs.slice(-5),
          lows:    lows.slice(-5),
          volumes: volumes.slice(-5),
        },
      });
    } catch (err) {
      continue;
    }
  }

  return NextResponse.json({
    ok:    false,
    error: `Yahoo fail cho ${sym}.VN từ cả 2 hosts`,
  }, { status: 502 });
        }
