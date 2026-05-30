import { NextRequest, NextResponse } from 'next/server';

// Routes that require authentication — unauthenticated users are redirected to /
const PROTECTED_PATHS = ['/dashboard'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Auth guard ──────────────────────────────────────────────────────────────
  // Supabase stores the session in a cookie named 'sb-*-auth-token'.
  // We check for its presence as a fast gate; the actual token validity is
  // verified server-side inside each protected page/API route.
  if (PROTECTED_PATHS.some(p => pathname.startsWith(p))) {
    const hasSession = [...request.cookies.getAll()].some(c =>
      c.name.startsWith('sb-') && c.name.endsWith('-auth-token'),
    );
    if (!hasSession) {
      const loginUrl = new URL('/', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── URL rewrites ────────────────────────────────────────────────────────────
  if (pathname === '/gold')     return NextResponse.rewrite(new URL('/gold-live',    request.url));
  if (pathname === '/oil')      return NextResponse.rewrite(new URL('/oil-live',     request.url));
  if (pathname === '/api/gold') return NextResponse.rewrite(new URL('/api/gold-live', request.url));
  if (pathname === '/api/oil')  return NextResponse.rewrite(new URL('/api/oil-live',  request.url));

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/gold', '/oil', '/api/gold', '/api/oil'],
};
