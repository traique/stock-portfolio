'use client';

// src/app/auth/reset-password/page.tsx
//
// Hỗ trợ 2 luồng:
//   1. Từ link email reset  → session có type=recovery  → yêu cầu nhập mật khẩu mới
//   2. Từ dropdown khi đã đăng nhập → session bình thường → yêu cầu nhập mật khẩu cũ + mới

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

type Mode  = 'loading' | 'recovery' | 'change' | 'no-session';
type Stage = 'form' | 'success';

export default function ResetPasswordPage() {
  const [mode,        setMode]        = useState<Mode>('loading');
  const [stage,       setStage]       = useState<Stage>('form');
  const [oldPassword, setOldPassword] = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [userEmail,   setUserEmail]   = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) {
        setMode('no-session');
        return;
      }
      setUserEmail(session.user.email ?? '');
      // amr = authentication method reference — 'recovery' khi đến từ link email
      const isRecovery = (session.user as any)?.amr?.some?.(
        (a: { method: string }) => a.method === 'recovery',
      );
      setMode(isRecovery ? 'recovery' : 'change');
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

    // Luồng "đổi mật khẩu" từ dropdown → cần xác thực mật khẩu cũ trước
    if (mode === 'change') {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: oldPassword,
      });
      if (signInErr) {
        setLoading(false);
        setError('Mật khẩu hiện tại không đúng.');
        return;
      }
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setStage('success');
    setTimeout(() => { window.location.href = '/'; }, 2500);
  }

  // ── Loading ──────────────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <main className="ab-page">
        <div className="ab-shell">
          <AppShellHeader isLoggedIn={false} currentTab="home" />
          <section className="ab-premium-card"
            style={{ padding: 28, maxWidth: 480, width: '100%', margin: '0 auto', textAlign: 'center' }}>
            <div className="ab-skeleton" style={{ width: '60%', height: 28, margin: '0 auto' }} />
          </section>
        </div>
      </main>
    );
  }

  // ── Không có session (vào thẳng URL) ─────────────────────────
  if (mode === 'no-session') {
    return (
      <main className="ab-page">
        <div className="ab-shell">
          <AppShellHeader isLoggedIn={false} currentTab="home" />
          <section className="ab-premium-card"
            style={{ padding: 28, maxWidth: 480, width: '100%', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Không có quyền truy cập</h2>
            <p style={{ marginTop: 10, color: 'var(--subtle)', fontSize: 14, lineHeight: 1.6 }}>
              Vui lòng đăng nhập trước, hoặc dùng link đặt lại mật khẩu từ email.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
              <a href="/auth/login" className="ab-btn ab-btn-primary"
                style={{ textAlign: 'center', textDecoration: 'none' }}>
                Đăng nhập
              </a>
              <a href="/auth/forgot-password" className="ab-btn ab-btn-subtle"
                style={{ textAlign: 'center', textDecoration: 'none' }}>
                Quên mật khẩu?
              </a>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ── Thành công ───────────────────────────────────────────────
  if (stage === 'success') {
    return (
      <main className="ab-page">
        <div className="ab-shell">
          <AppShellHeader isLoggedIn={false} currentTab="home" />
          <section className="ab-premium-card"
            style={{ padding: 28, maxWidth: 480, width: '100%', margin: '0 auto', textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 18,
              background: 'rgba(4, 120, 87, 0.10)', border: '1px solid rgba(4, 120, 87, 0.20)',
              display: 'grid', placeItems: 'center', margin: '0 auto 16px', fontSize: 26,
            }}>✓</div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Đổi mật khẩu thành công!</h2>
            <p style={{ marginTop: 10, color: 'var(--subtle)', fontSize: 14 }}>
              Đang chuyển hướng về trang chủ...
            </p>
          </section>
        </div>
      </main>
    );
  }

  // ── Form đổi mật khẩu ────────────────────────────────────────
  const isRecovery = mode === 'recovery';

  return (
    <main className="ab-page">
      <div className="ab-shell">
        <AppShellHeader isLoggedIn={!isRecovery} currentTab="home" />

        <section className="ab-premium-card"
          style={{ padding: 28, maxWidth: 480, width: '100%', margin: '0 auto' }}>

          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
            {isRecovery ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}
          </h1>
          <p style={{ marginTop: 8, color: 'var(--subtle)', fontSize: 14, lineHeight: 1.6 }}>
            {isRecovery
              ? 'Nhập mật khẩu mới cho tài khoản của bạn.'
              : `Đang đổi mật khẩu cho tài khoản ${userEmail}`}
          </p>

          <form onSubmit={handleSubmit}
            style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Mật khẩu hiện tại — chỉ hiện ở chế độ đổi mật khẩu */}
            {!isRecovery && (
              <input
                className="ab-input"
                type="password"
                placeholder="Mật khẩu hiện tại"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                required
                autoFocus
              />
            )}

            <input
              className="ab-input"
              type="password"
              placeholder="Mật khẩu mới (ít nhất 6 ký tự)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus={isRecovery}
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

            <button className="ab-btn ab-btn-primary" type="submit"
              disabled={loading} style={{ marginTop: 4 }}>
              {loading ? 'Đang lưu...' : 'Xác nhận đổi mật khẩu'}
            </button>
          </form>

          {!isRecovery && (
            <a href="/" style={{
              display: 'block', marginTop: 14, textAlign: 'center',
              fontSize: 13, color: 'var(--subtle)', textDecoration: 'none',
            }}>
              ← Quay lại
            </a>
          )}
        </section>
      </div>
    </main>
  );
}
