// src/app/auth/callback/route.ts
//
// Xử lý redirect từ Supabase sau khi:
//   - Xác nhận email đăng ký  (type = signup)
//   - Reset mật khẩu          (type = recovery)
//
// Dùng @supabase/ssr để exchangeCodeForSession ghi session vào cookie,
// middleware có thể đọc được sau redirect.

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server-client';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lcta.vercel.app';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[Auth Callback] exchangeCodeForSession error:', error.message);
      return NextResponse.redirect(
        `${SITE_URL}/auth/login?error=${encodeURIComponent(error.message)}`,
      );
    }

    if (type === 'recovery') {
      return NextResponse.redirect(`${SITE_URL}/auth/reset-password`);
    }

    return NextResponse.redirect(`${SITE_URL}${next}`);
  }

  return NextResponse.redirect(`${SITE_URL}/auth/login`);
}
