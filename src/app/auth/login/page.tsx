'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupMode, setSignupMode] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    if (signupMode) {
      const { error } = await supabase.auth.signUp({ email, password });
      setMessage(error ? error.message : 'Đăng ký thành công. Bạn có thể đăng nhập ngay nếu dự án không bật email confirm.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        window.location.href = '/dashboard';
      }
    }

    setLoading(false);
  }

  return (
    <main className="container" style={{ maxWidth: 520, minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <section className="card" style={{ padding: 24, width: '100%' }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>{signupMode ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Dùng Supabase Auth với email và mật khẩu.
        </p>
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Tài khoản" isLoggedIn={false} currentTab="home" />

        <form onSubmit={handleSubmit} className="stack" style={{ marginTop: 20 }}>
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Đang xử lý...' : signupMode ? 'Đăng ký' : 'Đăng nhập'}
          </button>
        </form>
        <section className="ab-premium-card" style={{ padding: 24, maxWidth: 560, width: '100%', margin: '0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 30 }}>{signupMode ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
          <p className="ab-soft-label" style={{ marginTop: 8 }}>
            Dùng Supabase Auth với email và mật khẩu.
          </p>

          <form onSubmit={handleSubmit} className="ab-form-grid" style={{ marginTop: 20 }}>
            <input
              className="ab-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="ab-input"
              type="password"
              placeholder="Mật khẩu"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="ab-btn ab-btn-primary" type="submit" disabled={loading}>
              {loading ? 'Đang xử lý...' : signupMode ? 'Đăng ký' : 'Đăng nhập'}
            </button>
          </form>

        {message ? <p style={{ marginTop: 14, color: '#475569' }}>{message}</p> : null}
          {message ? <p style={{ marginTop: 14, color: 'var(--muted)' }}>{message}</p> : null}

        <button
          className="btn"
          type="button"
          onClick={() => setSignupMode((current) => !current)}
          style={{ marginTop: 10, background: 'transparent', paddingLeft: 0, color: '#0f172a' }}
        >
          {signupMode ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
        </button>
      </section>
          <button
            className="ab-btn ab-btn-subtle"
            type="button"
            onClick={() => setSignupMode((current) => !current)}
            style={{ marginTop: 12 }}
          >
            {signupMode ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
          </button>
        </section>
      </div>
    </main>
  );
}
