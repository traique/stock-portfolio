'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
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

const DEFAULT_WATCHLIST = ['BID', 'FPT', 'HPG', 'VCB'];

function formatPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function normalizeSymbol(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sortSymbols(symbols: string[]) {
  return [...symbols].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
}

function colorFor(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'var(--muted)';
  if (value > 0) return 'var(--green)';
  if (value < 0) return 'var(--red)';
  return 'var(--muted)';
}

function getWatchlistKey(email?: string) {
  return `lcta_watchlist_${email ? email.toLowerCase() : 'guest'}`;
}

export default function HomePage() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [showAuth, setShowAuth] = useState(false);
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
  const [watchlistReady, setWatchlistReady] = useState(false);
  const lastSavedPayloadRef = useRef('');

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const session = data.session;
      setIsLoggedIn(!!session);
      setUserEmail(session?.user?.email || '');
      setUserId(session?.user?.id || '');
      setSessionChecked(true);
    }

    boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      setUserEmail(session?.user?.email || '');
      setUserId(session?.user?.id || '');
      if (session) setShowAuth(false);
      setSessionChecked(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadWatchlist() {
      if (!sessionChecked) return;
      setWatchlistReady(false);

      if (isLoggedIn && userId) {
        try {
          const { data, error } = await supabase.from('watchlists').select('symbol').order('symbol', { ascending: true });
          if (!error && Array.isArray(data) && data.length) {
            const symbols = sortSymbols(data.map((row) => normalizeSymbol(String(row.symbol))).filter(Boolean));
            setWatchlist(symbols);
            lastSavedPayloadRef.current = JSON.stringify(symbols);
            setWatchlistReady(true);
            return;
          }
        } catch {}
      }

      const key = getWatchlistKey(userEmail || undefined);
      const savedWatchlist = localStorage.getItem(key);
      if (savedWatchlist) {
        try {
          const parsed = JSON.parse(savedWatchlist);
          if (Array.isArray(parsed) && parsed.length) {
            const symbols = sortSymbols(parsed.map((item) => normalizeSymbol(String(item))).filter(Boolean));
            setWatchlist(symbols);
            lastSavedPayloadRef.current = JSON.stringify(symbols);
            setWatchlistReady(true);
            return;
          }
        } catch {}
      }

      const fallback = sortSymbols(DEFAULT_WATCHLIST);
      setWatchlist(fallback);
      lastSavedPayloadRef.current = JSON.stringify(fallback);
      setWatchlistReady(true);
    }

    loadWatchlist();
  }, [sessionChecked, isLoggedIn, userEmail, userId]);

  useEffect(() => {
    if (!sessionChecked || !watchlistReady) return;
    const sorted = sortSymbols(watchlist);
    const payload = JSON.stringify(sorted);
    localStorage.setItem(getWatchlistKey(userEmail || undefined), payload);
    if (payload === lastSavedPayloadRef.current) return;

    async function persist() {
      if (isLoggedIn && userId) {
        try {
          await supabase.from('watchlists').delete().eq('user_id', userId);
          if (sorted.length) {
            await supabase.from('watchlists').insert(sorted.map((symbol) => ({ user_id: userId, symbol })));
          }
        } catch {}
      }
      lastSavedPayloadRef.current = payload;
    }

    persist();
  }, [watchlist, userEmail, userId, isLoggedIn, sessionChecked, watchlistReady]);

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
        const response = await fetch(`/api/prices?symbols=${encodeURIComponent(watchlist.join(','))}`, { cache: 'no-store' });
        const data: PricesResponse = await response.json();
        if (!response.ok) {
          setMarketError(data?.error || 'Không lấy được dữ liệu');
          setQuotes([]);
        } else {
          const sorted = [...(data.debug || [])].sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true }));
          setQuotes(sorted);
        }
      } catch {
        setMarketError('Lỗi kết nối dữ liệu');
        setQuotes([]);
      } finally {
        setLoading(false);
      }
    }

    if (watchlistReady) loadQuotes();
  }, [watchlist, watchlistReady]);

  const breadth = useMemo(() => {
    const valid = quotes.filter((item) => Number.isFinite(item.pct));
    return {
      gainers: valid.filter((item) => item.pct > 0).length,
      losers: valid.filter((item) => item.pct < 0).length,
      avgPct: valid.length ? valid.reduce((sum, item) => sum + item.pct, 0) / valid.length : 0,
    };
  }, [quotes]);

  const topPositive = useMemo(() => {
    return [...quotes].filter((item) => item.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
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
        if (error) setAuthMessage(error.message);
        else window.location.href = '/dashboard';
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
    setWatchlist((prev) => sortSymbols([...prev, symbol]));
    setWatchInput('');
    setWatchError('');
  }

  function removeWatchSymbol(symbol: string) {
    setWatchlist((prev) => sortSymbols(prev.filter((item) => item !== symbol)));
  }

  if (!sessionChecked) {
    return <main className="ab-page"><div className="ab-shell"><section className="ab-card">Đang tải...</section></div></main>;
  }

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader
          title="Thị trường & watchlist"
          isLoggedIn={isLoggedIn}
          email={userEmail}
          currentTab="home"
          onLogout={handleLogout}
          onAuthOpen={() => setShowAuth((prev) => !prev)}
        />

        <section className="ab-overview-grid">
          <article className="ab-premium-card ab-market-card">
            <div className="ab-card-kicker">Tổng quan nhanh</div>
            <div className="ab-market-grid">
              <div>
                <div className="ab-soft-label">Mã tăng</div>
                <div className="ab-big-number positive">{loading ? '--' : breadth.gainers}</div>
              </div>
              <div>
                <div className="ab-soft-label">Mã giảm</div>
                <div className="ab-big-number negative">{loading ? '--' : breadth.losers}</div>
              </div>
              <div className="ab-market-wide">
                <div className="ab-soft-label">Biến động trung bình</div>
                <div className="ab-medium-number" style={{ color: colorFor(breadth.avgPct) }}>
                  {Number.isFinite(breadth.avgPct) ? formatPct(breadth.avgPct) : 'N/A'}
                </div>
              </div>
            </div>
          </article>

          <article className="ab-premium-card ab-signin-card">
            <div className="ab-card-kicker">Tài khoản</div>
            {isLoggedIn ? (
              <>
                <div className="ab-user-name">{userEmail.split('@')[0]}</div>
                <Link href="/dashboard" className="ab-btn ab-btn-primary ab-btn-full">Vào danh mục</Link>
              </>
            ) : (
              <>
                <div className="ab-user-name">Đăng nhập để đồng bộ dữ liệu</div>
                <button type="button" className="ab-btn ab-btn-primary ab-btn-full" onClick={() => setShowAuth((prev) => !prev)}>
                  {showAuth ? 'Ẩn đăng nhập' : 'Mở đăng nhập'}
                </button>
              </>
            )}
          </article>
        </section>

        {showAuth && !isLoggedIn ? (
          <section id="auth" className="ab-premium-card ab-auth-card">
            <div className="ab-card-headline">{authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</div>
            <form onSubmit={handleAuthSubmit} className="ab-form two-col-premium">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required className="ab-input" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" type="password" required className="ab-input" />
              <button type="submit" className="ab-btn ab-btn-primary ab-btn-full ab-auth-full">
                {loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </form>
            <button type="button" onClick={() => setAuthMode((prev) => (prev === 'login' ? 'signup' : 'login'))} className="ab-link-btn">
              {authMode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập'}
            </button>
            {authMessage ? <div className="ab-note">{authMessage}</div> : null}
          </section>
        ) : null}

        <section className="ab-home-grid">
          <section className="ab-premium-card ab-watch-shell">
            <div className="ab-row-between align-center">
              <div>
                <div className="ab-card-kicker">Theo dõi cá nhân</div>
                <div className="ab-card-headline">Watchlist</div>
              </div>
              <div className="ab-watch-count">{quotes.length} mã</div>
            </div>

            <div className="ab-add-row premium">
              <input value={watchInput} onChange={(e) => setWatchInput(e.target.value)} placeholder="Nhập mã cổ phiếu" className="ab-input" />
              <button type="button" onClick={() => addWatchSymbol()} className="ab-btn ab-btn-primary">Thêm</button>
            </div>

            {watchError ? <div className="ab-error">{watchError}</div> : null}
            {marketError ? <div className="ab-error">{marketError}</div> : null}

            <div className="ab-watch-grid premium">
              {quotes.map((item) => (
                <article key={item.symbol} className="ab-watch-card premium">
                  <div className="ab-row-between align-start">
                    <div className="ab-symbol-wrap">
                      <div className="ab-symbol premium">{item.symbol}</div>
                      <div className="ab-soft-change" style={{ color: colorFor(item.change) }}>
                        {formatPrice(item.change)} · {formatPct(item.pct)}
                      </div>
                    </div>
                    <button type="button" className="ab-delete ghost" onClick={() => removeWatchSymbol(item.symbol)}>Xóa</button>
                  </div>
                  <div className="ab-price premium">{formatPrice(item.price)}</div>
                </article>
              ))}
              {!loading && quotes.length === 0 ? <div className="ab-note">Chưa có mã</div> : null}
            </div>
          </section>

          <aside className="ab-side-stack">
            <section className="ab-premium-card ab-movers-card">
              <div className="ab-row-between align-center">
                <div>
                  <div className="ab-card-kicker">Điểm nhấn trong ngày</div>
                  <div className="ab-card-headline small">Tăng tốt nhất</div>
                </div>
                <Sparkles size={16} />
              </div>
              <div className="ab-mini-list">
                {topPositive.length ? topPositive.map((item) => (
                  <div key={item.symbol} className="ab-mini-row">
                    <div>
                      <div className="ab-mini-symbol">{item.symbol}</div>
                      <div className="ab-mini-price">{formatPrice(item.price)}</div>
                    </div>
                    <div className="ab-mini-pct positive">{formatPct(item.pct)}</div>
                  </div>
                )) : <div className="ab-note">Chưa có dữ liệu tăng giá.</div>}
              </div>
            </section>

            <section className="ab-premium-card ab-tone-card">
              <div className="ab-card-kicker">Cảm giác thị trường</div>
              <div className="ab-tone-content">
                {breadth.gainers >= breadth.losers ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                <span>{breadth.gainers >= breadth.losers ? 'Dòng tiền đang nghiêng về phía tăng.' : 'Áp lực giảm đang chiếm ưu thế.'}</span>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
