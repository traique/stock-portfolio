// src/app/api/test-yahoo/route.ts
// Xóa file này sau khi test xong

import { NextResponse, type NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const sym = req.nextUrl.searchParams.get('sym') ?? 'BID';
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${sym}.VN?interval=1d&range=3mo`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
          cache: 'no-store',
        }
      );
      if (!res.ok) continue;

      const json = await res.json();
      const q = json?.chart?.result?.[0]?.indicators?.quote?.[0] ?? {};
      const closes = ((q.close as number[]) ?? []).filter(v => Number.isFinite(v) && v > 0);
      if (closes.length < 5) continue;

      return NextResponse.json({
        ok: true, symbol: sym, host,
        closes_count: closes.length,
        last_close: closes.at(-1),
        sample: closes.slice(-5),
      });
    } catch { continue; }
  }

  return NextResponse.json({ ok: false, error: `Yahoo fail cho ${sym}.VN` }, { status: 502 });
}
