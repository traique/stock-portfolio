'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type QuoteItem = {
  symbol: string;
  ticker?: string;
  price: number;
  change: number;
  pct: number;
  previousClose?: number;
  marketTime?: number | null;
  currency?: string;
  volume?: number;
  error?: string;
};

type PricesResponse = {
  prices?: Record<string, number>;
  debug?: QuoteItem[];
  updatedAt?: string;
  provider?: string;
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

function formatDateTime(value?: string) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function colorFor(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'var(--muted)';
  if (value > 0) return 'var(--green)';
  if (value < 0) return 'var(--red)';
  return 'var(--muted)';
}

function normalizeSymbol(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

function getDisplayName(email: string) {
  return email.split('@')[0] || email;
}

type ThemeMode = 'light' | 'dark';

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
  const [updatedAt, setUpdatedAt] = useState('');
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState('');

  const [theme, setTheme] = useState<ThemeMode>('light');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('alphaboard_theme') as ThemeMode | null;
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    } else {
      document.documentElement.dataset.theme = 'light';
    }

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
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('alphaboard_theme', theme);
  }, [theme]);

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

  async function fetchQuotes(symbols: string[]) {
    if (!symbols.length) return { debug: [], updatedAt: '' };

    const response = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols.join(','))}`, {
      cache: 'no-store',
    });

    const data: PricesResponse = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'Không lấy được dữ liệu');
    }

    return {
      debug: data.debug || [],
      updatedAt: data.updatedAt || '',
    };
  }

  useEffect(() => {
    async function loadMarket() {
      setMarketLoading(true);
      setMarketError('');

      try {
        const data = await fetchQuotes(watchlist);
        setQuotes(data.debug);
        setUpdatedAt(data.updatedAt);
      } catch (error) {
        setMarketError(error instanceof Error ? error.message : 'Lỗi dữ liệu');
        setQuotes([]);
      } finally {
        setMarketLoading(false);
      }
    }

    loadMarket();
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
        <section className="ab-hero">
          <div className="ab-hero-top">
            <div className="ab-badge">AlphaBoard</div>

            <button
              type="button"
              className="ab-icon-btn"
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-label="Tùy chỉnh"
            >
              ⚙️
            </button>
          </div>

          <h1 className="ab-title">Danh mục đầu tư</h1>

          <div className="ab-meta-row">
            <div className="ab-pill">{formatDateTime(updatedAt)}</div>
          </div>

          {settingsOpen ? (
            <div className="ab-settings">
              <button
                type="button"
                className={`ab-chip ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
              >
                Sáng
              </button>
              <button
                type="button"
                className={`ab-chip ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                Tối
              </button>
            </div>
          ) : null}
        </section>

        {!isLoggedIn ? (
          <section className="ab-card">
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
        ) : (
          <section className="ab-card">
            <div className="ab-row-between">
              <div>
                <div className="ab-label">Tài khoản</div>
                <div className="ab-name">{getDisplayName(userEmail)}</div>
              </div>

              <div className="ab-action-stack">
                <Link href="/dashboard" className="ab-btn ab-btn-primary">
                  Vào danh mục
                </Link>
                <button type="button" onClick={handleLogout} className="ab-btn ab-btn-secondary">
                  Đăng xuất
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="ab-summary-grid">
          <div className="ab-summary-card">
            <div className="ab-label">Mã tăng</div>
            <div className="ab-summary-value">{marketLoading ? '--' : breadth.gainers}</div>
          </div>
          <div className="ab-summary-card">
            <div className="ab-label">Mã giảm</div>
            <div className="ab-summary-value">{marketLoading ? '--' : breadth.losers}</div>
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

            {!marketLoading && quotes.length === 0 ? <div className="ab-note">Chưa có mã</div> : null}
          </div>
        </section>
      </div>

      <style jsx>{`
        .ab-page {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family:
            Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial,
            'Noto Sans', sans-serif;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .ab-shell {
          max-width: 1100px;
          margin: 0 auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .ab-hero,
        .ab-card,
        .ab-summary-card,
        .ab-watch-card {
          transition:
            background 0.2s ease,
            border-color 0.2s ease,
            color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .ab-hero {
          background: linear-gradient(135deg, #0b1530, #12224a);
          color: #fff;
          border-radius: 28px;
          padding: 18px;
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.18);
        }

        .ab-hero-top,
        .ab-row-between {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .ab-badge {
          display: inline-flex;
          width: fit-content;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.12);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .ab-icon-btn {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 18px;
          cursor: pointer;
        }

        .ab-title {
          margin: 14px 0 0;
          font-size: 34px;
          line-height: 1.02;
          letter-spacing: -0.04em;
          font-weight: 800;
        }

        .ab-meta-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .ab-pill {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          color: #e2e8f0;
        }

        .ab-settings {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .ab-chip {
          border: 1px solid var(--border);
          background: var(--soft);
          color: var(--text);
          border-radius: 999px;
          padding: 8px 10px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }

        .ab-chip.active {
          background: var(--text);
          color: var(--card);
          border-color: var(--text);
        }

        .ab-card {
          background: var(--card);
          border-radius: 24px;
          padding: 16px;
          border: 1px solid var(--border);
          box-shadow: 0 8px 18px rgba(148, 163, 184, 0.1);
        }

        .ab-section-title {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .ab-label {
          font-size: 13px;
          color: var(--muted);
          font-weight: 700;
        }

        .ab-name {
          margin-top: 6px;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.03em;
          word-break: break-word;
        }

        .ab-action-stack {
          display: grid;
          gap: 10px;
          min-width: 160px;
        }

        .ab-btn {
          border-radius: 16px;
          padding: 12px 16px;
          font-weight: 800;
          font-size: 15px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .ab-btn-primary {
          border: none;
          background: var(--primary);
          color: #fff;
        }

        .ab-btn-secondary {
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text);
        }

        .ab-form {
          display: grid;
          gap: 10px;
          margin-top: 14px;
        }

        .ab-input {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 12px 14px;
          background: var(--card);
          color: var(--text);
          font-size: 15px;
          outline: none;
        }

        .ab-link-btn {
          margin-top: 10px;
          border: none;
          background: transparent;
          padding: 0;
          text-align: left;
          color: var(--text);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .ab-note {
          margin-top: 10px;
          color: var(--muted);
          font-size: 14px;
        }

        .ab-error {
          margin-top: 10px;
          color: var(--red);
          font-size: 13px;
          font-weight: 700;
        }

        .ab-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .ab-summary-card {
          background: var(--card);
          border-radius: 22px;
          padding: 16px;
          border: 1px solid var(--border);
          box-shadow: 0 8px 18px rgba(148, 163, 184, 0.1);
        }

        .ab-summary-value {
          margin-top: 8px;
          font-size: 34px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
        }

        .ab-add-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-top: 14px;
        }

        .ab-quick-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .ab-watch-grid {
          display: grid;
          gap: 10px;
          margin-top: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .ab-watch-card {
          background: var(--soft);
          border-radius: 20px;
          padding: 14px;
          border: 1px solid var(--border);
        }

        .ab-symbol {
          font-size: 30px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
        }

        .ab-muted {
          margin-top: 6px;
          font-size: 13px;
          color: var(--muted);
        }

        .ab-delete {
          border: 1px solid #fecaca;
          background: var(--card);
          color: var(--red);
          border-radius: 14px;
          padding: 8px 10px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }

        .ab-price {
          margin-top: 14px;
          font-size: 40px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
        }

        .ab-change-row {
          margin-top: 10px;
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          font-size: 18px;
          font-weight: 800;
        }

        :global(:root) {
          --bg: #f4f7fb;
          --card: #ffffff;
          --soft: #f8fafc;
          --text: #0f172a;
          --muted: #64748b;
          --border: #dbe2ea;
          --primary: #0f172a;
          --green: #16a34a;
          --red: #dc2626;
        }

        :global(:root[data-theme='dark']) {
          --bg: #0b1220;
          --card: #111827;
          --soft: #172033;
          --text: #f8fafc;
          --muted: #94a3b8;
          --border: #243041;
          --primary: #2563eb;
          --green: #22c55e;
          --red: #f87171;
        }

        @media (max-width: 900px) {
          .ab-watch-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .ab-row-between,
          .ab-hero-top {
            flex-direction: column;
          }

          .ab-action-stack {
            width: 100%;
            min-width: 0;
          }

          .ab-add-row {
            grid-template-columns: 1fr;
          }

          .ab-summary-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </main>
  );
  }
