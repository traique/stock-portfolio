'use client';

// src/app/auth/forgot-password/page.tsx
//
// Người dùng nhập email → Supabase gửi link reset về hộp thư.
// Link sẽ redirect về /auth/callback?type=recovery → /auth/reset-password

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

type Stage = 'form' | 'sent';

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [stage,   setStage]   = useState<Stage>('form');

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lcta.vercel.app';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${SITE_URL}/auth/callback?type=recovery`,
    });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setStage('sent');
  }

  return (
    <main className="ab-page">
      <div className="ab-shell">
        <AppShellHeader isLoggedIn={false} currentTab="home" />

        <section
          className="ab-premium-card"
          style={{ padding: 28, maxWidth: 480, width: '100%', margin: '0 auto' }}
        >
          {stage === 'form' ? (
            <>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
                Quên mật khẩu
              </h1>
              <p style={{ marginTop: 8, color: 'var(--subtle)', fontSize: 14, lineHeight: 1.6 }}>
                Nhập email đã đăng ký. Chúng tôi sẽ gửi link đặt lại mật khẩu về hộp thư của bạn.
              </p>

              <form
                onSubmit={handleSubmit}
                style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <input
                  className="ab-input"
                  type="email"
                  placeholder="Email đã đăng ký"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />

                {error && (
                  <div className="ab-error">{error}</div>
                )}

                <button
                  className="ab-btn ab-btn-primary"
                  type="submit"
                  disabled={loading}
                  style={{ marginTop: 4 }}
                >
                  {loading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}
                </button>
              </form>

              <a
                href="/auth/login"
                style={{
                  display: 'block', marginTop: 16, textAlign: 'center',
                  fontSize: 14, color: 'var(--subtle)', textDecoration: 'none',
                }}
              >
                ← Quay lại đăng nhập
              </a>
            </>
          ) : (
            <>
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 18,
                  background: 'rgba(4, 120, 87, 0.10)',
                  border: '1px solid rgba(4, 120, 87, 0.20)',
                  display: 'grid', placeItems: 'center',
                  margin: '0 auto 16px',
                  fontSize: 24,
                }}>
                  ✉️
                </div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                  Đã gửi email!
                </h2>
                <p style={{
                  marginTop: 10, color: 'var(--subtle)', fontSize: 14,
                  lineHeight: 1.7, maxWidth: 320, margin: '10px auto 0',
                }}>
                  Kiểm tra hộp thư <strong style={{ color: 'var(--text)' }}>{email}</strong> và
                  bấm vào link trong email để đặt lại mật khẩu.
                </p>
                <p style={{ marginTop: 8, color: 'var(--subtle)', fontSize: 13 }}>
                  Không thấy email? Kiểm tra thư mục Spam.
                </p>
              </div>

              <a
                href="/auth/login"
                className="ab-btn ab-btn-primary"
                style={{
                  display: 'block', textAlign: 'center',
                  marginTop: 20, textDecoration: 'none',
                }}
              >
                Về trang đăng nhập
              </a>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
