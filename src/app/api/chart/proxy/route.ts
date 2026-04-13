import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  if (!url || !url.includes('sieutinhieu.vn')) {
    return NextResponse.json({ error: 'Invalid or unauthorized URL' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Referer': 'https://sieutinhieu.vn/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ error: `Sieutinhieu returned ${res.status}` }, { status: res.status });
    }

    let html = await res.text();

    // Xóa các header bảo mật gây block iframe
    html = html
      // Xóa CSP meta tag
      .replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')
      // Xóa X-Frame-Options nếu có trong HTML (hiếm)
      .replace(/X-Frame-Options/gi, 'X-Frame-Options-Removed');

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'ALLOWALL',                    // Quan trọng nhất
        'Content-Security-Policy': "frame-ancestors 'self' *; default-src * 'unsafe-inline' 'unsafe-eval';",
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('Chart Proxy Error:', error.message);
    return NextResponse.json(
      { error: 'Proxy failed: ' + (error.name === 'AbortError' ? 'Timeout' : error.message) },
      { status: 502 }
    );
  }
}
