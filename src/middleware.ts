import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase-middleware-client';

const PROTECTED_PATHS = ['/dashboard'];

// Chỉ các path cần thiết — tránh chạy middleware trên mọi request (tốn invocations)
// Static assets và API routes không cần session refresh ở middleware
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── URL rewrites (không cần Supabase) ──────────────────────────────────────
  if (pathname === '/gold')     return NextResponse.rewrite(new URL('/gold-live',     request.url));
  if (pathname === '/oil')      return NextResponse.rewrite(new URL('/oil-live',      request.url));
  if (pathname === '/api/gold') return NextResponse.rewrite(new URL('/api/gold-live', request.url));
  if (pathname === '/api/oil')  return NextResponse.rewrite(new URL('/api/oil-live',  request.url));

  // ── Auth guard cho /dashboard ─────────────────────────────────────────────
  // Chỉ gọi Supabase khi thực sự cần — tránh 1 Supabase round-trip cho mọi page load
  if (PROTECTED_PATHS.some(p => pathname.startsWith(p))) {
    const { supabase, response } = createSupabaseMiddlewareClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL('/', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Chỉ match những gì cần thiết — KHÔNG dùng catch-all
    '/dashboard/:path*',
    '/gold', '/oil',
    '/api/gold', '/api/oil',
  ],
};
