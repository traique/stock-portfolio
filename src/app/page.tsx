'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

type QuoteItem = {
  symbol: string;
  price: number;
  change: number;
  pct: number;
  volume?: number;
};

type PricesResponse = {
  debug?: QuoteItem[];
  error?: string;
};

const DEFAULT_WATCHLIST = ['FPT', 'HPG', 'VCB', 'BID'];

function formatPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatVolume(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('vi-VN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function normalizeSymbol(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

function colorFor(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'var(--muted)';
  if (value > 0) return 'var(--green)';
  if (value < 0) return 'var(--red)';
  return 'var(--muted)';
}

export default function HomePage() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authMessage, setAuthMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [watchInput, setWatchInput] = useState('');
  const [watchError, setWatchError] = useState('');
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketError, setMarketError] = useState('');

  useEffect(() => {
    const savedWatchlist = localStorage.getItem('alphaboard_watchlist');
    if (savedWatchlist) {
      try {
        const parsed = JSON.parse(savedWatchlist);
        if (Array.isArray(parsed) && parsed.length) {
          setWatchlist(parsed.map((item) => normalizeSymbol(String(item))).filter(Boolean));
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('alphaboard_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const session = data.session;
      setIsLoggedIn(!!session);
      setUserEmail(session?.user?.email || '');
      setSessionChecked(true);
    }

    boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      setUserEmail(session?.user?.email || '');
      setSessionChecked(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadQuotes() {
      if (!watchlist.length) {
        setQuotes([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setMarketError('');

      try {
        const response = await fetch(
          `/api/prices?symbols=${encodeURIComponent(watchlist.join(','))}`,
          { cache: 'no-store' }
        );
        const data: PricesResponse = await response.json();

        if (!response.ok) {
          setMarketError(data?.error || 'Không lấy được dữ liệu');
          setQuotes([]);
        } else {
          setQuotes(data.debug || []);
        }
      } catch {
        setMarketError('Lỗi kết nối dữ liệu');
        setQuotes([]);
      } finally {
        setLoading(false);
      }
    }

    loadQuotes();
  }, [watchlist]);

  const breadth = useMemo(() => {
    const valid = quotes.filter((item) => Number.isFinite(item.pct));
    return {
      gainers: valid.filter((item) => item.pct > 0).length,
      losers: valid.filter((item) => item.pct < 0).length,
    };
  }, [quotes]);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingAuth(true);
    setAuthMessage('');

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        setAuthMessage(error ? error.message : 'Tạo tài khoản thành công');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setAuthMessage(error.message);
        } else {
          window.location.href = '/dashboard';
        }
      }
    } finally {
      setLoadingAuth(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function addWatchSymbol(symbolRaw?: string) {
    const symbol = normalizeSymbol(symbolRaw ?? watchInput);
    if (!symbol) {
      setWatchError('Nhập mã hợp lệ');
      return;
    }
    if (watchlist.includes(symbol)) {
      setWatchError('Mã đã có');
      return;
    }
    setWatchlist((prev) => [...prev, symbol]);
    setWatchInput('');
    setWatchError('');
  }

  function removeWatchSymbol(symbol: string) {
    setWatchlist((prev) => prev.filter((item) => item !== symbol));
  }

  if (!sessionChecked) {
    return (
      <main className="ab-page">
        <div className="ab-shell">
          <section className="ab-card">Đang tải...</section>
        </div>
      </main>
    );
  }

  return (
    <main className="ab-page">
      <div className="ab-shell">
        <AppShellHeader
          title="Danh mục đầu tư"
          isLoggedIn={isLoggedIn}
          email={userEmail}
          currentTab="home"
          onLogout={handleLogout}
        />

        {!isLoggedIn ? (
          <section id="auth" className="ab-card">
            <div className="ab-section-title">
              {authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </div>

            <form onSubmit={handleAuthSubmit} className="ab-form">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                type="email"
                required
                className="ab-input"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                type="password"
                required
                className="ab-input"
              />
              <button type="submit" className="ab-btn ab-btn-primary">
                {loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setAuthMode((prev) => (prev === 'login' ? 'signup' : 'login'))}
              className="ab-link-btn"
            >
              {authMode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập'}
            </button>

            {authMessage ? <div className="ab-note">{authMessage}</div> : null}
          </section>
        ) : null}

        <section className="ab-summary-grid">
          <div className="ab-summary-card">
            <div className="ab-label">Mã tăng</div>
            <div className="ab-summary-value">{loading ? '--' : breadth.gainers}</div>
          </div>
          <div className="ab-summary-card">
            <div className="ab-label">Mã giảm</div>
            <div className="ab-summary-value">{loading ? '--' : breadth.losers}</div>
          </div>
        </section>

        <section className="ab-card">
          <div className="ab-row-between">
            <div className="ab-section-title">Watchlist</div>
          </div>

          <div className="ab-add-row">
            <input
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              placeholder="Nhập mã"
              className="ab-input"
            />
            <button type="button" onClick={() => addWatchSymbol()} className="ab-btn ab-btn-primary">
              Thêm
            </button>
          </div>

          <div className="ab-quick-row">
            {['FPT', 'HPG', 'VCB', 'BID', 'CTG', 'MWG'].map((symbol) => (
              <button
                key={symbol}
                type="button"
                className="ab-chip"
                onClick={() => addWatchSymbol(symbol)}
              >
                + {symbol}
              </button>
            ))}
          </div>

          {watchError ? <div className="ab-error">{watchError}</div> : null}
          {marketError ? <div className="ab-error">{marketError}</div> : null}

          <div className="ab-watch-grid">
            {quotes.map((item) => (
              <article key={item.symbol} className="ab-watch-card">
                <div className="ab-row-between">
                  <div>
                    <div className="ab-symbol">{item.symbol}</div>
                    <div className="ab-muted">KL: {formatVolume(item.volume)}</div>
                  </div>

                  <button
                    type="button"
                    className="ab-delete"
                    onClick={() => removeWatchSymbol(item.symbol)}
                  >
                    Xóa
                  </button>
                </div>

                <div className="ab-price">{formatPrice(item.price)}</div>

                <div className="ab-change-row">
                  <span style={{ color: colorFor(item.change) }}>{formatPrice(item.change)}</span>
                  <span style={{ color: colorFor(item.pct) }}>{formatPct(item.pct)}</span>
                </div>
              </article>
            ))}

            {!loading && quotes.length === 0 ? <div className="ab-note">Chưa có mã</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
