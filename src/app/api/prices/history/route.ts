// src/app/api/prices/history/route.ts
//
// GET /api/prices/history?symbol=VNINDEX&range=7d|30d|90d|180d|1y|all
//
// Lấy OHLCV ngày trực tiếp từ DNSE Entrade (public, không auth, không geo-block,
// chạy tốt từ Vercel). KHÔNG spawn python3. Self-contained — không import module
// provider khác để tránh kéo theo import lỗi (`../exchanges/exchange`) vào build.
// Trả về: { history: Array<{ date: string; close: number }> }

import { NextRequest, NextResponse } from 'next/server';

type RangeKey = '7d' | '30d' | '90d' | '180d' | '1y' | 'all';

const RANGE_DAYS: Record<RangeKey, number> = {
  '7d': 7, '30d': 30, '90d': 90, '180d': 180, '1y': 365, all: 5000,
};

// ✅ Whitelist mã: chỉ chữ HOA + số, 2–10 ký tự. Chặn mọi ký tự injection.
const SYMBOL_RE = /^[A-Z0-9]{2,10}$/;

// DNSE trả giá theo NGHÌN VND (18.3) → nhân để ra VND thô (18300).
const PRICE_SCALE = 1000;
const DNSE_OHLC_BASE = 'https://' + 'services.entrade.com.vn/chart-api/v2/ohlcs';

// Mã chỉ số dùng endpoint /ohlcs/index; cổ phiếu dùng /ohlcs/stock.
const INDEX_SYMBOLS = new Set([
  'VNINDEX', 'VN30', 'VN100', 'HNX', 'HNXINDEX', 'HNX30', 'UPCOM', 'UPCOMINDEX',
]);

export async function GET(request: NextRequest) {
  const sp     = request.nextUrl.searchParams;
  const symbol = (sp.get('symbol') ?? 'VNINDEX').trim().toUpperCase();
  const range  = (sp.get('range')  ?? '180d') as RangeKey;

  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'symbol không hợp lệ' }, { status: 400 });
  }
  if (!(range in RANGE_DAYS)) {
    return NextResponse.json({ error: 'range không hợp lệ' }, { status: 400 });
  }

  const days     = RANGE_DAYS[range];
  const isIndex  = INDEX_SYMBOLS.has(symbol);
  const dnseSym  = isIndex ? 'VNINDEX' : symbol;
  const endpoint = isIndex ? `${DNSE_OHLC_BASE}/index` : `${DNSE_OHLC_BASE}/stock`;

  const to   = Math.floor(Date.now() / 1000);
  const from = to - Math.ceil(days * 1.6 + 10) * 86400;

  const url =
    `${endpoint}?from=${from}&to=${to}` +
    `&symbol=${encodeURIComponent(dnseSym)}&resolution=1D`;

  try {
    // ✅ Fetch trực tiếp DNSE — KHÔNG spawn python3 (Vercel không có Python/vnstock).
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ history: [] });

    const data = await res.json();
    const rawT: unknown = data?.t;
    const rawC: unknown = data?.c;
    const tArr: number[] = Array.isArray(rawT) ? rawT.map(Number) : [];
    const cArr: number[] = Array.isArray(rawC) ? rawC.map(Number) : [];
    if (tArr.length === 0) return NextResponse.json({ history: [] });

    // Zip timestamp + close → lọc giá hợp lệ → sort tăng dần → cắt theo số ngày.
    const bars = tArr
      .map((raw, i) => ({
        sec:   raw > 1e12 ? Math.floor(raw / 1000) : raw,
        close: cArr[i],
      }))
      .filter(b => Number.isFinite(b.close) && b.close > 0)
      .sort((a, b) => a.sec - b.sec)
      .slice(-days);

    const history = bars.map(b => ({
      date:  new Date(b.sec * 1000).toISOString().slice(0, 10),
      close: Math.round(b.close * PRICE_SCALE), // VND thô
    }));

    return NextResponse.json(
      { history },
      { headers: { 'Cache-Control': 'public, max-age=900, s-maxage=900' } }, // cache 15 phút
    );
  } catch {
    // Lỗi mạng / timeout → trả mảng rỗng, chart tự ẩn VN-Index
    return NextResponse.json({ history: [] });
  }
}
