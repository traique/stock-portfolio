'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

export default function LoginPage() {
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [signupMode, setSignupMode] = useState(false);
  const [message,    setMessage]    = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (signupMode) {
      const { error } = await supabase.auth.signUp({ email, password });
      setMessage(
        error
          ? error.message
          : 'Đăng ký thành công. Bạn có thể đăng nhập ngay.',
      );
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.href = '/dashboard';
    }

    setLoading(false);
  }

  return (
    <main className="ab-page">
      <div className="ab-shell">

        {/* title prop removed — AppShellHeader does not accept it */}
        <AppShellHeader isLoggedIn={false} currentTab="home" />

        <section
          className="ab-premium-card"
          style={{ padding: 24, maxWidth: 560, width: '100%', margin: '0 auto' }}
        >
          <h1 style={{ margin: 0, fontSize: 30 }}>
            {signupMode ? 'Tạo tài khoản' : 'Đăng nhập'}
          </h1>
          <p style={{ marginTop: 8, color: 'var(--muted)', fontSize: 14 }}>
            Dùng Supabase Auth với email và mật khẩu.
          </p>

          <form
            onSubmit={handleSubmit}
            style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <input
              className="ab-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              className="ab-input"
              type="password"
              placeholder="Mật khẩu"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              className="ab-btn ab-btn-primary"
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Đang xử lý...'
                : signupMode ? 'Đăng ký' : 'Đăng nhập'}
            </button>
          </form>

          {message && (
            <p style={{ marginTop: 14, color: 'var(--muted)', fontSize: 14 }}>
              {message}
            </p>
          )}

          <button
            className="ab-btn ab-btn-subtle"
            type="button"
            onClick={() => setSignupMode(v => !v)}
            style={{ marginTop: 12, width: '100%' }}
          >
            {signupMode
              ? 'Đã có tài khoản? Đăng nhập'
              : 'Chưa có tài khoản? Đăng ký'}
          </button>
        </section>

      </div>
    </main>
  );
}
