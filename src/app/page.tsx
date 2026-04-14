'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, BriefcaseBusiness, Sparkles, Trash2, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

type QuoteItem = { symbol: string; price: number; change: number; pct: number; volume?: number };
type PricesResponse = { debug?: QuoteItem[]; error?: string; cached?: boolean };

const DEFAULT_WATCHLIST = ['BID', 'FPT', 'HPG', 'VCB'];
const formatPrice = (v?: number | null) => (v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v));
const formatPct = (v?: number | null) => (v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : v < 0 ? '' : ''}${v.toFixed(2)}%`);
const formatIndexChange = (v?: number | null) => (v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : v < 0 ? '' : ''}${v.toFixed(2)}`);
const normalizeSymbol = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const sortSymbols = (s: string[]) => [...s].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
const colorFor = (v?: number | null) => !Number.isFinite(v as number) ? 'var(--muted)' : (v as number) > 0 ? 'var(--green)' : (v as number) < 0 ? 'var(--red)' : 'var(--muted)';
const getWatchlistKey = (email?: string) => `lcta_watchlist_${email ? email.toLowerCase() : 'guest'}`;

function LoadingCard() {
  return (
    <article className="ab-watch-card premium ab-skeleton-card">
      <div className="ab-skeleton skeleton-title" />
      <div className="ab-skeleton skeleton-price" />
      <div className="ab-skeleton skeleton-line" />
    </article>
  );
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
  const [vnIndex, setVnIndex] = useState<QuoteItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketError, setMarketError] = useState('');
  const [watchlistReady, setWatchlistReady] = useState(false);
  const lastSavedPayloadRef = useRef('');

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const session = data.session;
      setIsLoggedIn(Boolean(session));
      setUserEmail(session?.user?.email || '');
      setUserId(session?.user?.id || '');
      setSessionChecked(true);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
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
    void (async () => {
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

      const saved = localStorage.getItem(getWatchlistKey(userEmail || undefined));
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
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
    })();
  }, [sessionChecked, isLoggedIn, userEmail, userId]);

  useEffect(() => {
    if (!sessionChecked || !watchlistReady) return;
    const sorted = sortSymbols(watchlist);
    const payload = JSON.stringify(sorted);
    localStorage.setItem(getWatchlistKey(userEmail || undefined), payload);
    if (payload === lastSavedPayloadRef.current) return;

    void (async () => {
      if (isLoggedIn && userId) {
        try {
          await supabase.from('watchlists').delete().eq('user_id', userId);
          if (sorted.length) await supabase.from('watchlists').insert(sorted.map((symbol) => ({ user_id: userId, symbol })));
        } catch {}
      }
      lastSavedPayloadRef.current = payload;
    })();
  }, [watchlist, userEmail, userId, isLoggedIn, sessionChecked, watchlistReady]);

  useEffect(() => {
    void (async () => {
      if (!watchlistReady) return;
      if (!watchlist.length) {
        setQuotes([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setMarketError('');
      try {
        const response = await fetch(`/api/prices-cache?symbols=${encodeURIComponent(watchlist.join(','))}`, { cache: 'no-store' });
        const data: PricesResponse = await response.json();
        if (!response.ok) {
          setMarketError(data?.error || 'Không lấy được dữ liệu');
          setQuotes([]);
        } else {
          setQuotes([...(data.debug || [])].sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true })));
        }
      } catch {
        setMarketError('Lỗi kết nối dữ liệu');
        setQuotes([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [watchlist, watchlistReady]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/prices-cache?symbols=VNINDEX', { cache: 'no-store' });
        const data: PricesResponse = await response.json();
        const item = data?.debug?.[0];
        setVnIndex(item && Number(item.price) > 0 ? item : null);
      } catch {
        setVnIndex(null);
      }
    })();
  }, []);

  const bestMover = useMemo(() => [...quotes].sort((a, b) => b.pct - a.pct)[0] || null, [quotes]);

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
    if (!symbol) return setWatchError('Nhập mã hợp lệ');
    if (watchlist.includes(symbol)) return setWatchError('Mã đã có');
    setWatchlist((prev) => sortSymbols([...prev, symbol]));
    setWatchInput('');
    setWatchError('');
  }

  function removeWatchSymbol(symbol: string) {
    setWatchlist((prev) => sortSymbols(prev.filter((item) => item !== symbol)));
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
      <div className="ab-shell premium-gap">
        <AppShellHeader
          title="Watchlist"
          isLoggedIn={isLoggedIn}
          email={userEmail}
          currentTab="home"
          onLogout={handleLogout}
          onAuthOpen={() => setShowAuth((prev) => !prev)}
        />

        <section className="ab-premium-card ab-market-strip-pro" style={{ display: 'grid', gap: 12 }}>
          <div className="ab-row-between align-center" style={{ flexWrap: 'wrap' }}>
            <div>
              <div className="ab-card-kicker">Nhìn nhanh thị trường</div>
              <div className="ab-card-headline small">Một màn hình, đúng thứ cần xem</div>
            </div>
            <div className="ab-strip-vnindex" style={{ minWidth: 220 }}>
              <span className="ab-soft-label ab-strip-head"><Activity size={14} />VN-Index</span>
              <div className="ab-strip-vnindex-main">{vnIndex ? formatPrice(vnIndex.price) : '--'}</div>
              <div className="ab-strip-vnindex-change" style={{ color: colorFor(vnIndex?.pct) }}>
                {vnIndex ? `${formatIndexChange(vnIndex.change)} · ${formatPct(vnIndex.pct)}` : 'Đang tải'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <Link href="/dashboard" className="ab-premium-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
              <div className="ab-row-between align-center"><span className="ab-card-kicker">Trung tâm</span><BriefcaseBusiness size={16} /></div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Danh mục</div>
              <div className="ab-soft-label">NAV, PnL, holdings và lịch sử giao dịch.</div>
            </Link>

            <Link href="/market" className="ab-premium-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
              <div className="ab-row-between align-center"><span className="ab-card-kicker">Dữ liệu</span><Sparkles size={16} /></div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Market</div>
              <div className="ab-soft-label">Top Buy/Sell và nhịp thị trường trong ngày.</div>
            </Link>

            <Link href="/tools" className="ab-premium-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
              <div className="ab-row-between align-center"><span className="ab-card-kicker">Tiện ích</span><Wrench size={16} /></div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Tools</div>
              <div className="ab-soft-label">Backtest, giá vàng và giá xăng ở một chỗ riêng.</div>
            </Link>
          </div>
        </section>

        {showAuth && !isLoggedIn ? (
          <section id="auth" className="ab-premium-card ab-auth-card compact">
            <div className="ab-card-headline">{authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</div>
            <form onSubmit={handleAuthSubmit} className="ab-form two-col-premium">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required className="ab-input" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" type="password" required className="ab-input" />
              <button type="submit" className="ab-btn ab-btn-primary ab-btn-full ab-auth-full">{loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</button>
            </form>
            <button type="button" onClick={() => setAuthMode((prev) => (prev === 'login' ? 'signup' : 'login'))} className="ab-link-btn">
              {authMode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập'}
            </button>
            {authMessage ? <div className="ab-note">{authMessage}</div> : null}
          </section>
        ) : null}

        <section className="ab-home-grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 0.9fr)' }}>
          <section className="ab-premium-card ab-watch-shell compact-watch-shell">
            <div className="ab-row-between align-center">
              <div>
                <div className="ab-card-kicker">Theo dõi cá nhân</div>
                <div className="ab-card-headline small">Watchlist của bạn</div>
              </div>
              <div className="ab-watch-count">{quotes.length} mã</div>
            </div>

            <div className="ab-add-row premium compact">
              <input
                value={watchInput}
                onChange={(event) => setWatchInput(event.target.value)}
                placeholder="Nhập mã cổ phiếu"
                className="ab-input"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addWatchSymbol();
                  }
                }}
              />
              <button type="button" onClick={() => addWatchSymbol()} className="ab-btn ab-btn-primary">Thêm</button>
            </div>

            {watchError ? <div className="ab-error">{watchError}</div> : null}
            {marketError ? <div className="ab-error">{marketError}</div> : null}

            <div className="ab-watch-grid premium compact">
              {loading ? (
                Array.from({ length: Math.min(4, Math.max(2, watchlist.length || 2)) }).map((_, index) => <LoadingCard key={index} />)
              ) : quotes.length ? (
                quotes.map((item) => (
                  <article key={item.symbol} className="ab-watch-card premium compact tighter">
                    <div className="ab-row-between align-start">
                      <div className="ab-symbol-wrap">
                        <div className="ab-symbol premium compact">{item.symbol}</div>
                        <div className="ab-soft-label mini-top">Theo dõi</div>
                      </div>
                      <button type="button" className="ab-delete icon-only" onClick={() => removeWatchSymbol(item.symbol)} aria-label={`Xóa ${item.symbol}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="ab-price premium compact">{formatPrice(item.price)}</div>
                    <div className="ab-soft-change under-price" style={{ color: colorFor(item.change) }}>
                      {formatPrice(item.change)} · {formatPct(item.pct)}
                    </div>
                  </article>
                ))
              ) : (
                <div className="ab-note">Chưa có mã trong watchlist.</div>
              )}
            </div>
          </section>

          <aside className="ab-side-stack">
            <section className="ab-premium-card compact-side-card" style={{ display: 'grid', gap: 10 }}>
              <div className="ab-row-between align-center">
                <div>
                  <div className="ab-card-kicker">Điểm nhấn nhanh</div>
                  <div className="ab-card-headline small">Mã nổi bật nhất</div>
                </div>
                <ArrowRight size={16} />
              </div>

              {bestMover ? (
                <div className="ab-mini-card premium">
                  <div className="ab-row-between align-center">
                    <div style={{ fontSize: 28, fontWeight: 900 }}>{bestMover.symbol}</div>
                    <div className="ab-mini-pct positive" style={{ fontSize: 16 }}>{formatPct(bestMover.pct)}</div>
                  </div>
                  <div className="ab-soft-label" style={{ marginTop: 6 }}>Giá hiện tại: {formatPrice(bestMover.price)}</div>
                </div>
              ) : (
                <div className="ab-note">Chưa có dữ liệu nổi bật.</div>
              )}
            </section>

            <section className="ab-premium-card compact-side-card" style={{ display: 'grid', gap: 10 }}>
              <div className="ab-card-kicker">Gợi ý điều hướng</div>
              <Link href="/dashboard" className="ab-mini-row" style={{ padding: '6px 0' }}>
                <div>
                  <div className="ab-mini-symbol">Danh mục</div>
                  <div className="ab-mini-price">Xem NAV và PnL tổng</div>
                </div>
                <ArrowRight size={16} />
              </Link>
              <Link href="/market" className="ab-mini-row" style={{ padding: '6px 0' }}>
                <div>
                  <div className="ab-mini-symbol">Market</div>
                  <div className="ab-mini-price">Theo dõi Top Buy/Sell</div>
                </div>
                <ArrowRight size={16} />
              </Link>
              <Link href="/tools" className="ab-mini-row" style={{ padding: '6px 0' }}>
                <div>
                  <div className="ab-mini-symbol">Tools</div>
                  <div className="ab-mini-price">Backtest và giá hàng hóa</div>
                </div>
                <ArrowRight size={16} />
              </Link>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
                  }
