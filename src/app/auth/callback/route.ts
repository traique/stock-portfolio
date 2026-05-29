// src/app/auth/callback/route.ts
//
// Xử lý redirect từ Supabase sau khi:
//   - Xác nhận email đăng ký  (type = signup)
//   - Reset mật khẩu          (type = recovery)
//
// Supabase gửi link dạng:
//   https://lcta.vercel.app/auth/callback?code=xxx   (PKCE flow)
// hoặc hash fragment (implicit flow — xử lý phía client)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lcta.vercel.app';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code  = searchParams.get('code');
  const type  = searchParams.get('type');   // 'signup' | 'recovery' | null
  const next  = searchParams.get('next') ?? '/';

  // ── PKCE code exchange ──────────────────────────────────────
  if (code) {
    const supabase = makeSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[Auth Callback] exchangeCodeForSession error:', error.message);
      return NextResponse.redirect(
        `${SITE_URL}/auth/login?error=${encodeURIComponent(error.message)}`,
      );
    }

    // Recovery (reset password) → đưa đến trang đặt mật khẩu mới
    if (type === 'recovery') {
      return NextResponse.redirect(`${SITE_URL}/auth/reset-password`);
    }

    // Signup confirmation → về trang chủ hoặc next param
    return NextResponse.redirect(`${SITE_URL}${next}`);
  }

  // ── Không có code → về login ────────────────────────────────
  return NextResponse.redirect(`${SITE_URL}/auth/login`);
}
