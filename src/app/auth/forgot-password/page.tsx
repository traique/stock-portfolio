'use client';

// src/app/auth/reset-password/page.tsx
//
// Người dùng đến đây sau khi bấm link trong email reset.
// Session đã được tạo bởi /auth/callback → chỉ cần gọi updateUser.

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

type Stage = 'form' | 'success' | 'invalid';

export default function ResetPasswordPage() {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [stage,     setStage]     = useState<Stage>('form');

  // Kiểm tra session hợp lệ khi vào trang
  // (Supabase đã set session qua /auth/callback)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setStage('invalid');
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Mật khẩu phải ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirm) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setStage('success');

    // Tự chuyển về trang chủ sau 2.5 giây
    setTimeout(() => { window.location.href = '/'; }, 2500);
  }

  if (stage === 'invalid') {
    return (
      <main className="ab-page">
        <div className="ab-shell">
          <AppShellHeader isLoggedIn={false} currentTab="home" />
          <section
            className="ab-premium-card"
            style={{ padding: 28, maxWidth: 480, width: '100%', margin: '0 auto', textAlign: 'center' }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Link đã hết hạn</h2>
            <p style={{ marginTop: 10, color: 'var(--subtle)', fontSize: 14, lineHeight: 1.6 }}>
              Link đặt lại mật khẩu chỉ dùng được một lần và hết hạn sau 1 giờ.
              Vui lòng yêu cầu link mới.
            </p>
            <a
              href="/auth/forgot-password"
              className="ab-btn ab-btn-primary"
              style={{ display: 'block', textAlign: 'center', marginTop: 20, textDecoration: 'none' }}
            >
              Gửi lại link mới
            </a>
          </section>
        </div>
      </main>
    );
  }

  if (stage === 'success') {
    return (
      <main className="ab-page">
        <div className="ab-shell">
          <AppShellHeader isLoggedIn={false} currentTab="home" />
          <section
            className="ab-premium-card"
            style={{ padding: 28, maxWidth: 480, width: '100%', margin: '0 auto', textAlign: 'center' }}
          >
            <div style={{
              width: 56, height: 56, borderRadius: 18,
              background: 'rgba(4, 120, 87, 0.10)',
              border: '1px solid rgba(4, 120, 87, 0.20)',
              display: 'grid', placeItems: 'center',
              margin: '0 auto 16px', fontSize: 24,
            }}>
              ✓
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Đổi mật khẩu thành công!</h2>
            <p style={{ marginTop: 10, color: 'var(--subtle)', fontSize: 14 }}>
              Đang chuyển hướng về trang chủ...
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="ab-page">
      <div className="ab-shell">
        <AppShellHeader isLoggedIn={false} currentTab="home" />

        <section
          className="ab-premium-card"
          style={{ padding: 28, maxWidth: 480, width: '100%', margin: '0 auto' }}
        >
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
            Đặt mật khẩu mới
          </h1>
          <p style={{ marginTop: 8, color: 'var(--subtle)', fontSize: 14, lineHeight: 1.6 }}>
            Nhập mật khẩu mới cho tài khoản của bạn.
          </p>

          <form
            onSubmit={handleSubmit}
            style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <input
              className="ab-input"
              type="password"
              placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              minLength={6}
            />
            <input
              className="ab-input"
              type="password"
              placeholder="Xác nhận mật khẩu mới"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />

            {error && <div className="ab-error">{error}</div>}

            <button
              className="ab-btn ab-btn-primary"
              type="submit"
              disabled={loading}
              style={{ marginTop: 4 }}
            >
              {loading ? 'Đang lưu...' : 'Xác nhận đổi mật khẩu'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
