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

const MARKET_SYMBOLS = ['FPT', 'HPG', 'VCB', 'BID', 'CTG', 'MWG', 'TCB', 'MBB', 'SSI', 'VND'];

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
  if (value === null || value === undefined || !Number.isFinite(value)) return '#64748b';
  if (value > 0) return '#16a34a';
  if (value < 0) return '#dc2626';
  return '#64748b';
}

function getDisplayName(email: string) {
  return email.split('@')[0] || email;
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

  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState('');

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
    async function loadMarket() {
      setMarketLoading(true);
      setMarketError('');

      try {
        const response = await fetch(
          `/api/prices?symbols=${encodeURIComponent(MARKET_SYMBOLS.join(','))}`,
          { cache: 'no-store' }
        );
        const data: PricesResponse = await response.json();

        if (!response.ok) {
          setMarketError(data?.error || 'Không lấy được dữ liệu');
          setQuotes([]);
        } else {
          setQuotes(data.debug || []);
          setUpdatedAt(data.updatedAt || '');
        }
      } catch {
        setMarketError('Lỗi kết nối dữ liệu');
        setQuotes([]);
      } finally {
        setMarketLoading(false);
      }
    }

    loadMarket();
  }, []);

  const breadth = useMemo(() => {
    const valid = quotes.filter((item) => Number.isFinite(item.pct));
    return {
      gainers: valid.filter((item) => item.pct > 0).length,
      losers: valid.filter((item) => item.pct < 0).length,
    };
  }, [quotes]);

  const top10 = useMemo(() => {
    return [...quotes]
      .filter((item) => Number.isFinite(item.pct) && item.pct > 0)
      .sort((a, b) => {
        const pctDiff = (b.pct || 0) - (a.pct || 0);
        if (Math.abs(pctDiff) > 0.0001) return pctDiff;
        return (b.volume || 0) - (a.volume || 0);
      })
      .slice(0, 10);
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

  if (!sessionChecked) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <section style={styles.card}>Đang tải...</section>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <section style={styles.hero}>
          <div style={styles.badge}>AlphaBoard</div>

          <div style={styles.heroTop}>
            <div>
              <h1 style={styles.title}>Danh mục đầu tư thông minh</h1>
              <p style={styles.subtitle}>Gọn, nhanh, dễ kiểm soát.</p>
            </div>

            {isLoggedIn ? (
              <div style={styles.accountBox}>
                <div style={styles.accountName}>{getDisplayName(userEmail)}</div>
                <div style={styles.accountActions}>
                  <Link href="/dashboard" style={styles.primaryBtn}>
                    Vào danh mục
                  </Link>
                  <button type="button" onClick={handleLogout} style={styles.secondaryBtn}>
                    Đăng xuất
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div style={styles.heroMeta}>
            <div style={styles.metaPill}>{formatDateTime(updatedAt)}</div>
            <div style={styles.metaPill}>Danh mục</div>
          </div>
        </section>

        {!isLoggedIn ? (
          <section style={styles.card}>
            <div style={styles.blockTitle}>
              {authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </div>

            <form onSubmit={handleAuthSubmit} style={styles.formGrid}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                type="email"
                required
                style={styles.input}
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                type="password"
                required
                style={styles.input}
              />
              <button type="submit" style={styles.primaryWideBtn}>
                {loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setAuthMode((prev) => (prev === 'login' ? 'signup' : 'login'))}
              style={styles.switchBtn}
            >
              {authMode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập'}
            </button>

            {authMessage ? <div style={styles.authMessage}>{authMessage}</div> : null}
          </section>
        ) : null}

        <section style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Mã tăng</div>
            <div style={styles.summaryValue}>{marketLoading ? '--' : breadth.gainers}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Mã giảm</div>
            <div style={styles.summaryValue}>{marketLoading ? '--' : breadth.losers}</div>
          </div>
        </section>

        <section style={styles.card}>
          <div style={styles.listHead}>
            <div style={styles.blockTitle}>Top 10 tăng mạnh</div>
            <div style={styles.blockSub}>ưu tiên thanh khoản</div>
          </div>

          {marketError ? <div style={styles.errorText}>{marketError}</div> : null}

          <div style={styles.topList}>
            {top10.map((item, index) => (
              <div key={item.symbol} style={styles.topRow}>
                <div style={styles.rank}>{index + 1}</div>
                <div style={styles.topMain}>
                  <div style={styles.topSymbol}>{item.symbol}</div>
                  <div style={styles.topVolume}>KL: {formatVolume(item.volume)}</div>
                </div>
                <div style={styles.topRight}>
                  <div style={styles.topPrice}>{formatPrice(item.price)}</div>
                  <div style={{ ...styles.topPct, color: colorFor(item.pct) }}>
                    {formatPct(item.pct)}
                  </div>
                </div>
              </div>
            ))}

            {!marketLoading && top10.length === 0 ? (
              <div style={styles.empty}>Chưa có dữ liệu</div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f4f7fb',
    color: '#0f172a',
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif',
  },
  container: {
    maxWidth: 1080,
    margin: '0 auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  hero: {
    background: 'linear-gradient(135deg, #0b1530, #12224a)',
    color: '#fff',
    borderRadius: 28,
    padding: 18,
    boxShadow: '0 14px 32px rgba(15,23,42,0.18)',
  },
  badge: {
    display: 'inline-flex',
    width: 'fit-content',
    padding: '7px 12px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.12)',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.02em',
  },
  heroTop: {
    display: 'grid',
    gap: 16,
    marginTop: 14,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.02,
    letterSpacing: '-0.04em',
    fontWeight: 800,
  },
  subtitle: {
    margin: '10px 0 0',
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 1.5,
  },
  accountBox: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 22,
    padding: 14,
  },
  accountName: {
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  accountActions: {
    display: 'grid',
    gap: 10,
    marginTop: 12,
  },
  heroMeta: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 16,
  },
  metaPill: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 13,
    color: '#e2e8f0',
  },
  primaryBtn: {
    border: 'none',
    borderRadius: 16,
    padding: '12px 16px',
    background: '#fff',
    color: '#0f172a',
    fontWeight: 800,
    fontSize: 15,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    borderRadius: 16,
    padding: '12px 16px',
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
  card: {
    background: '#fff',
    borderRadius: 24,
    padding: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 18px rgba(148,163,184,0.10)',
  },
  blockTitle: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  formGrid: {
    display: 'grid',
    gap: 10,
    marginTop: 14,
  },
  input: {
    width: '100%',
    border: '1px solid #dbe2ea',
    borderRadius: 16,
    padding: '12px 14px',
    background: '#fff',
    fontSize: 15,
    outline: 'none',
  },
  primaryWideBtn: {
    border: 'none',
    borderRadius: 16,
    padding: '13px 16px',
    background: '#0f172a',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  switchBtn: {
    marginTop: 10,
    border: 'none',
    background: 'transparent',
    padding: 0,
    textAlign: 'left',
    color: '#0f172a',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  authMessage: {
    marginTop: 10,
    color: '#475569',
    fontSize: 14,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  summaryCard: {
    background: '#fff',
    borderRadius: 22,
    padding: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 18px rgba(148,163,184,0.10)',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: 700,
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 34,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '-0.04em',
  },
  listHead: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  blockSub: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 700,
  },
  errorText: {
    marginTop: 12,
    color: '#be123c',
    fontSize: 13,
    fontWeight: 700,
  },
  topList: {
    display: 'grid',
    gap: 10,
    marginTop: 14,
  },
  topRow: {
    display: 'grid',
    gridTemplateColumns: '36px 1fr auto',
    gap: 12,
    alignItems: 'center',
    background: '#f8fafc',
    borderRadius: 18,
    padding: '12px 12px',
    border: '1px solid #e2e8f0',
  },
  rank: {
    width: 36,
    height: 36,
    borderRadius: 999,
    background: '#e2e8f0',
    color: '#0f172a',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
  },
  topMain: {
    minWidth: 0,
  },
  topSymbol: {
    fontSize: 18,
    fontWeight: 800,
  },
  topVolume: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
    fontWeight: 700,
  },
  topRight: {
    textAlign: 'right',
  },
  topPrice: {
    fontSize: 18,
    fontWeight: 800,
  },
  topPct: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: 800,
  },
  empty: {
    color: '#64748b',
    fontSize: 14,
  },
};
