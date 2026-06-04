// src/app/api/debug/datasources/route.ts
//
// Endpoint kiểm tra tất cả data sources: VCI, CafeF, SSI
// CHỈ dùng để debug — xoá sau khi kiểm tra xong
// Bảo vệ bằng CRON_SECRET để không ai khác gọi được

import { NextRequest, NextResponse } from 'next/server';

async function testEndpoint(
  name: string,
  url: string,
  options: RequestInit = {},
): Promise<{ name: string; ok: boolean; status?: number; sample?: unknown; error?: string; latencyMs: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
    const latencyMs = Date.now() - t0;
    const text = await res.text();
    let sample: unknown = text.slice(0, 300);
    try { sample = JSON.parse(text); sample = JSON.stringify(sample).slice(0, 300); } catch {}
    return { name, ok: res.ok, status: res.status, sample, latencyMs };
  } catch (e) {
    return { name, ok: false, error: String(e), latencyMs: Date.now() - t0 };
  }
}

export async function GET(req: NextRequest) {
  // Basic auth bằng cron secret
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const symbol = req.nextUrl.searchParams.get('symbol') ?? 'HPG';
  const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' };

  const results = await Promise.all([

    // 1. VCI Financial Summary (dùng trong earnings-analyzer.ts)
    testEndpoint(
      'VCI financial-summary',
      `https://mt.vietcap.com.vn/api/price/v1/ticker-info/financial-summary?tickers=${symbol}&language=vi`,
      { headers: { ...HEADERS, Accept: 'application/json' } },
    ),

    // 2. VCI Trading prices (dùng trong vci-edge.ts)
    testEndpoint(
      'VCI trading prices (POST)',
      'https://trading.vietcap.com.vn/api/price/symbols/getList',
      {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json', 'Referer': 'https://trading.vietcap.com.vn/', 'Origin': 'https://trading.vietcap.com.vn/' },
        body: JSON.stringify({ symbols: [symbol], exchange: 'HOSE' }),
      },
    ),

    // 3. CafeF NetProfit (fallback trong earnings-analyzer.ts)
    testEndpoint(
      'CafeF NetProfit',
      `https://s.cafef.vn/Ajax/PageNew/DataFinancial/NetProfit.ashx?symbol=${symbol}&type=2&pageindex=1&pagesize=4`,
      { headers: { ...HEADERS, 'Referer': `https://cafef.vn/du-lieu-chung-khoan/bao-cao-tai-chinh/${symbol.toLowerCase()}/` } },
    ),

    // 4. SSI iBoard stock-price (money-flow.ts)
    testEndpoint(
      'SSI iBoard stock-price',
      `https://iboard-query.ssi.com.vn/v2/stock-price/${symbol}`,
      { headers: { ...HEADERS, Accept: 'application/json', Origin: 'https://iboard.ssi.com.vn', Referer: 'https://iboard.ssi.com.vn/' } },
    ),

    // 5. SSI iBoard investor history (money-flow.ts)
    testEndpoint(
      'SSI iBoard investor history',
      `https://iboard-query.ssi.com.vn/v2/intraday/his/investor/${symbol}?limit=5`,
      { headers: { ...HEADERS, Accept: 'application/json', Origin: 'https://iboard.ssi.com.vn', Referer: 'https://iboard.ssi.com.vn/' } },
    ),

    // 6. Yahoo Finance v8 history (đang dùng cho giá)
    testEndpoint(
      'Yahoo Finance v8 chart',
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.VN?interval=1d&range=5d`,
      { headers: HEADERS },
    ),

    // 7. Supabase Edge Function VCI prices
    testEndpoint(
      'Supabase Edge Function (vci-prices)',
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/quick-task`,
      {
        method: 'POST',
        headers: { ...HEADERS, 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ mode: 'realtime', symbols: [symbol] }),
      },
    ),
  ]);

  // Summary
  const summary = results.map(r => ({
    name:      r.name,
    status:    r.ok ? '✅ OK' : `❌ FAIL (${r.status ?? r.error?.slice(0, 50)})`,
    latencyMs: r.latencyMs,
    sample:    r.ok ? r.sample : undefined,
  }));

  return NextResponse.json({
    testedAt: new Date().toISOString(),
    symbol,
    results: summary,
  }, { status: 200 });
        }
