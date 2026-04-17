'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Sparkles, TrendingDown, TrendingUp, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

type QuoteItem = { symbol: string; price: number; change: number; pct: number; volume?: number };
type PricesResponse = { debug?: QuoteItem[]; error?: string };
type AiWatchlistResponse = {
  summary: string;
  picks: Array<{ symbol: string; score: number; reason: string; entry: number; tp: number; sl: number }>;
  avoid: string[];
  cached?: boolean;
  cache_ttl_seconds?: number;
  cached_at?: string;
  error?: string;
};
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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiWatchlist, setAiWatchlist] = useState<AiWatchlistResponse | null>(null);
  const [watchlistReady, setWatchlistReady] = useState(false);
  const lastSavedPayloadRef = useRef('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const session = data.session;
      setIsLoggedIn(!!session);
      setUserEmail(session?.user?.email || '');
      setUserId(session?.user?.id || '');
      setSessionChecked(true);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsLoggedIn(!!session);
      setUserEmail(session?.user?.email || '');
      setUserId(session?.user?.id || '');
      if (session) setShowAuth(false);
      setSessionChecked(true);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  async function runAiWatchlistScan() {
    if (!watchlist.length) return;
    setAiLoading(true);
    setAiError('');
    try {
      const response = await fetch('/api/ai/watchlist-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: watchlist, risk_profile: 'balanced' }),
      });
      const payload: AiWatchlistResponse = await response.json();
      if (!response.ok) {
        setAiError(payload?.error || 'Không thể phân tích watchlist');
        setAiWatchlist(null);
      } else {
        setAiWatchlist(payload);
      }
    } catch {
      setAiError('Không thể kết nối AI');
      setAiWatchlist(null);
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      if (!sessionChecked) return;
      setWatchlistReady(false);
      if (isLoggedIn && userId) {
        try {
          const { data, error } = await supabase.from('watchlists').select('symbol').order('symbol', { ascending: true });
          if (!error && Array.isArray(data) && data.length) {
            const symbols = sortSymbols(data.map((r) => normalizeSymbol(String(r.symbol))).filter(Boolean));
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
            const symbols = sortSymbols(parsed.map((i) => normalizeSymbol(String(i))).filter(Boolean));
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
    (async () => {
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
    (async () => {
      if (!watchlistReady) return;
      if (!watchlist.length) { setQuotes([]); setLoading(false); return; }
      setLoading(true); setMarketError('');
      try {
        const response = await fetch(`/api/prices?symbols=${encodeURIComponent(watchlist.join(','))}`, { cache: 'no-store' });
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
    (async () => {
      try {
        const response = await fetch('/api/prices?symbols=VNINDEX', { cache: 'no-store' });
        const data: PricesResponse = await response.json();
        const item = data?.debug?.[0];
        setVnIndex(item && Number(item.price) > 0 ? item : null);
      } catch {
        setVnIndex(null);
      }
    })();
  }, []);

  const breadth = useMemo(() => {
    const valid = quotes.filter((i) => Number.isFinite(i.pct));
    return {
      gainers: valid.filter((i) => i.pct > 0).length,
      losers: valid.filter((i) => i.pct < 0).length,
      avgPct: valid.length ? valid.reduce((s, i) => s + i.pct, 0) / valid.length : 0,
    };
  }, [quotes]);

  const topPositive = useMemo(() => [...quotes].filter((i) => i.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3), [quotes]);

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

  async function handleLogout() { await supabase.auth.signOut(); }

  function addWatchSymbol(symbolRaw?: string) {
    const symbol = normalizeSymbol(symbolRaw ?? watchInput);
    if (!symbol) return setWatchError('Nhập mã hợp lệ');
    if (watchlist.includes(symbol)) return setWatchError('Mã đã có');
    setWatchlist((prev) => sortSymbols([...prev, symbol]));
    setWatchInput('');
    setWatchError('');
  }

  function removeWatchSymbol(symbol: string) {
    setWatchlist((prev) => sortSymbols(prev.filter((i) => i !== symbol)));
  }

  if (!sessionChecked) return <main className="ab-page"><div className="ab-shell"><section className="ab-card">Đang tải...</section></div></main>;

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Radar đầu tư" isLoggedIn={isLoggedIn} email={userEmail} currentTab="home" onLogout={handleLogout} onAuthOpen={() => setShowAuth((p) => !p)} />

        <section className="ab-premium-card ab-market-strip-pro ab-market-board-premium">
          <div className="ab-strip-vnindex">
            <span className="ab-soft-label ab-strip-head"><Activity size={14} />VN-Index</span>
            <div className="ab-strip-vnindex-main">{vnIndex ? formatPrice(vnIndex.price) : '--'}</div>
            <div className="ab-strip-vnindex-change" style={{ color: colorFor(vnIndex?.pct) }}>
              {vnIndex ? `${formatIndexChange(vnIndex.change)} · ${formatPct(vnIndex.pct)}` : 'Đang tải'}
            </div>
          </div>

          <div className="ab-strip-metrics">
            <div className="ab-metric-cell">
              <span>Mã tăng</span>
              <strong className="positive">{loading ? '--' : breadth.gainers}</strong>
            </div>
            <div className="ab-metric-cell">
              <span>Mã giảm</span>
              <strong className="negative">{loading ? '--' : breadth.losers}</strong>
            </div>
            <div className="ab-metric-cell wide">
              <span>Biến động TB</span>
              <strong style={{ color: colorFor(breadth.avgPct) }}>{Number.isFinite(breadth.avgPct) ? formatPct(breadth.avgPct) : 'N/A'}</strong>
            </div>
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
            <button type="button" onClick={() => setAuthMode((p) => (p === 'login' ? 'signup' : 'login'))} className="ab-link-btn">{authMode === 'login' ? 'Chưa có tài khoản? Tạo mới' : 'Đã có tài khoản? Đăng nhập'}</button>
            {authMessage ? <div className="ab-note">{authMessage}</div> : null}
          </section>
        ) : null}

        <section className="ab-home-grid single-focus">
          <section className="ab-premium-card ab-watch-shell compact-watch-shell">
            <div className="ab-row-between align-center">
              <div className="ab-card-kicker">Danh sách theo dõi cá nhân</div>
              <div className="ab-watch-count">{quotes.length} mã</div>
            </div>

            <div className="ab-add-row premium compact">
              <input value={watchInput} onChange={(e) => setWatchInput(e.target.value)} placeholder="Nhập mã cổ phiếu" className="ab-input" />
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
                    <div className="ab-soft-change under-price" style={{ color: colorFor(item.change) }}>{formatPrice(item.change)} · {formatPct(item.pct)}</div>
                  </article>
                ))
              ) : (
                <div className="ab-note">Chưa có mã</div>
              )}
            </div>
          </section>

          <aside className="ab-side-stack">
            <section className="ab-premium-card ab-movers-card compact-side-card">
              <div className="ab-row-between align-center">
                <div>
                  <div className="ab-card-kicker">Điểm nhấn trong ngày</div>
                  <div className="ab-card-headline small">Tăng tốt nhất</div>
                </div>
                <Sparkles size={16} />
              </div>
              <div className="ab-mini-list">
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="ab-mini-row ab-skeleton-row">
                      <div className="ab-skeleton skeleton-line short" />
                      <div className="ab-skeleton skeleton-line tiny" />
                    </div>
                  ))
                ) : topPositive.length ? topPositive.map((item) => (
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

            <section className="ab-premium-card ab-tone-card compact-side-card">
              <div className="ab-card-kicker">Nhịp thị trường</div>
              <div className="ab-tone-content">
                {breadth.gainers >= breadth.losers ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                <span>{breadth.gainers >= breadth.losers ? 'Dòng tiền đang nghiêng về phía tăng.' : 'Áp lực giảm đang chiếm ưu thế.'}</span>
              </div>
            </section>

            <section className="ab-premium-card compact-side-card">
              <div className="ab-row-between align-center" style={{ marginBottom: 8 }}>
                <div>
                  <div className="ab-card-kicker">AI Watchlist Assistant</div>
                  <div className="ab-soft-label">Quét mã và gợi ý mua + TP/SL</div>
                </div>
                <button type="button" className="ab-btn ab-btn-primary" onClick={runAiWatchlistScan} disabled={aiLoading || !watchlist.length}>
                  {aiLoading ? 'Đang quét...' : 'Quét AI'}
                </button>
              </div>
              {aiError ? <div className="ab-error">{aiError}</div> : null}
              {aiWatchlist?.cached ? <div className="ab-note">Kết quả cache ~{Math.round((aiWatchlist.cache_ttl_seconds || 0) / 60)} phút để tránh spam API.</div> : null}
              {aiWatchlist ? (
                <div className="ab-mini-list">
                  <div className="ab-note">{aiWatchlist.summary}</div>
                  {(aiWatchlist.picks || []).slice(0, 3).map((pick) => (
                    <div key={pick.symbol} className="ab-mini-row">
                      <div>
                        <div className="ab-mini-symbol">{pick.symbol} · {pick.score.toFixed(1)}</div>
                        <div className="ab-mini-price">Entry {formatPrice(pick.entry)} · TP {formatPrice(pick.tp)} · SL {formatPrice(pick.sl)}</div>
                      </div>
                    </div>
                  ))}
                  {aiWatchlist.avoid?.length ? <div className="ab-note">Cẩn trọng: {aiWatchlist.avoid.join(', ')}</div> : null}
                </div>
              ) : <div className="ab-note">Nhấn “Quét AI” để nhận gợi ý cho watchlist.</div>}
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
                                                                                                            }
