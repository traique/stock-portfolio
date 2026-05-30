import { NextRequest, NextResponse } from 'next/server';

// NOTE: Auth guard for /dashboard is intentionally NOT done here.
// The Supabase client uses localStorage (browser) for session storage,
// so the session is not available in middleware (server-side).
// Authentication is enforced inside the dashboard page itself.

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── URL rewrites ────────────────────────────────────────────────────────────
  if (pathname === '/gold')     return NextResponse.rewrite(new URL('/gold-live',     request.url));
  if (pathname === '/oil')      return NextResponse.rewrite(new URL('/oil-live',      request.url));
  if (pathname === '/api/gold') return NextResponse.rewrite(new URL('/api/gold-live', request.url));
  if (pathname === '/api/oil')  return NextResponse.rewrite(new URL('/api/oil-live',  request.url));

  return NextResponse.next();
}

export const config = {
  matcher: ['/gold', '/oil', '/api/gold', '/api/oil'],
};
