import { NextResponse } from 'next/server';

const DNSE_SECURITIES_URL = 'https://services.entrade.com.vn/dnse-financial-product/securities';
const REQUEST_TIMEOUT_MS = 6000;

// Rút gọn tên pháp lý dài cho gọn badge:
// "CTCP Chứng khoán Sài Gòn Hà Nội" -> "Chứng khoán Sài Gòn Hà Nội"
function cleanName(issuer: string): string {
  return issuer
    .replace(/^CTCP\s+/i, '')
    .replace(/^Công ty Cổ phần\s+/i, '')
    .replace(/^Công ty cổ phần\s+/i, '')
    .replace(/^Tổng Công ty\s+/i, 'TCT ')
    .trim();
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Next cache 24h -> 1 mã gọi DNSE tối đa 1 lần/ngày
    return await fetch(url, { signal: ctrl.signal, next: { revalidate: 86400 } });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const sym = (symbol ?? '').trim().toUpperCase();

  if (!sym || !/^[A-Z0-9]{1,12}$/.test(sym)) {
    return NextResponse.json({ symbol: sym, name: null }, { status: 200 });
  }

  try {
    const res = await fetchWithTimeout(`${DNSE_SECURITIES_URL}/${sym}`);
    if (!res.ok) {
      return NextResponse.json({ symbol: sym, name: null }, { status: 200 });
    }
    const data = (await res.json()) as { issuer?: string };
    const name = data?.issuer ? cleanName(data.issuer) : null;

    return NextResponse.json(
      { symbol: sym, name },
      {
        status: 200,
        // Cache ở CDN của Vercel để nhẹ tải
        headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800' },
      },
    );
  } catch {
    return NextResponse.json({ symbol: sym, name: null }, { status: 200 });
  }
}
