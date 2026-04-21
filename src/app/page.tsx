'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Sparkles, Trash2, RefreshCw, Newspaper, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

// --- TYPES ---
type QuoteItem = { symbol: string; price: number; change: number; pct: number; volume?: number };
type PricesResponse = { debug?: QuoteItem[]; error?: string };
type NewsItem = { title: string; source: string; pubDate: string };

type AiWatchlistResponse = {
  summary: string;
  picks: Array<{ symbol: string; score: number; reason: string; entry: number; tp: number; sl: number }>;
  avoid: string[];
  newsContext?: Record<string, NewsItem[]>;
  cached?: boolean;
  cache_ttl_seconds?: number;
  cached_at?: string;
  error?: string;
};

// --- CONSTANTS & HELPERS ---
const DEFAULT_WATCHLIST = ['BID', 'FPT', 'HPG', 'VCB'];

const priceFormatter = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatPrice = (v?: number | null) => (v == null || !Number.isFinite(v) ? 'N/A' : priceFormatter.format(v));
const formatPct = (v?: number | null) => (v == null || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);
const formatIndexChange = (v?: number | null) => (v == null || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);

const normalizeSymbol = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const sortSymbols = (s: string[]) => [...s].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
const colorFor = (v?: number | null) => (!Number.isFinite(v as number) ? 'var(--muted)' : (v as number) > 0 ? 'var(--green)' : (v as number) < 0 ? 'var(--red)' : 'var(--muted)');
const getWatchlistKey = (email?: string) => `lcta_watchlist_${email ? email.toLowerCase() : 'guest'}`;

function LoadingCard() {
  return (
    <article className="ab-watch-card premium ab-skeleton-card">
      <div className="ab-skeleton skeleton-title" style={{ width: '40%' }} />
      <div className="ab-skeleton skeleton-price" style={{ width: '60%' }} />
      <div className="ab-skeleton skeleton-line" style={{ width: '50%' }} />
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
  const [watchlistReady, setWatchlistReady] = useState(false);
  const lastSavedPayloadRef = useRef('');

  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [vnIndex, setVnIndex] = useState<QuoteItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [marketError, setMarketError] = useState('');
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiWatchlist, setAiWatchlist] = useState<AiWatchlistResponse | null>(null);

  const [newsModal, setNewsModal] = useState<{ isOpen: boolean; symbol: string; news: NewsItem[] }>({ isOpen: false, symbol: '', news: [] });

  // 1. Quản lý Session
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

  // 2. LocalStorage Persistence cho AI
  useEffect(() => {
    const savedAi = localStorage.getItem('lcta_ai_watchlist_result');
    if (savedAi) {
      try { setAiWatchlist(JSON.parse(savedAi)); } catch {}
    }
  }, []);

  useEffect(() => {
    if (aiWatchlist) {
      localStorage.setItem('lcta_ai_watchlist_result', JSON.stringify(aiWatchlist));
    }
  }, [aiWatchlist]);

  // 3. Chạy quét AI (Force Refresh)
  async function runAiWatchlistScan() {
    if (!watchlist.length) return;
    setAiLoading(true);
    setAiError('');
    try {
      const response = await fetch('/api/ai/watchlist-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: watchlist, risk_profile: 'balanced', force_refresh: true }),
      });
      const payload: AiWatchlistResponse = await response.json();
      if (!response.ok) {
        setAiError(payload?.error || 'Không thể phân tích watchlist');
      } else {
        setAiWatchlist(payload);
      }
    } catch {
      setAiError('Không thể kết nối với dịch vụ AI.');
    } finally {
      setAiLoading(false);
    }
  }

  // 4. Khôi phục & Lưu Watchlist
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

  // 5. Load giá thị trường
  useEffect(() => {
    (async () => {
      if (!watchlistReady) return;
      if (!watchlist.length) { setQuotes([]); setLoading(false); return; }
      setLoading(true); 
      try {
        const response = await fetch(`/api/prices?symbols=${encodeURIComponent(watchlist.join(','))}`, { cache: 'no-store' });
        const data: PricesResponse = await response.json();
        if (response.ok) setQuotes([...(data.debug || [])].sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true })));
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
      } catch {}
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
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        setAuthMessage(error ? error.message : 'Kiểm tra email để xác nhận tài khoản.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setAuthMessage(error.message);
        else window.location.href = '/';
      }
    } finally {
      setLoadingAuth(false);
    }
  }

  function handleOpenNews(symbol: string) {
    const newsData = aiWatchlist?.newsContext?.[symbol] || [];
    setNewsModal({ isOpen: true, symbol, news: newsData });
  }

  if (!sessionChecked) return <main className="ab-page"><div className="ab-shell"><div className="ab-soft-label" style={{textAlign: 'center', padding: 40}}>Đang đồng bộ dữ liệu...</div></div></main>;

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Radar đầu tư" isLoggedIn={isLoggedIn} email={userEmail} currentTab="home" onLogout={async () => await supabase.auth.signOut()} onAuthOpen={() => setShowAuth((p) => !p)} />

        {/* --- VN-INDEX SECTION (NÂNG CẤP FONT QUYỀN LỰC) --- */}
        <section className="ab-premium-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05), var(--card))' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="ab-card-kicker" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={14} color="var(--green)" /> VN-INDEX MARKET PULSE
            </span>
            <div style={{ 
              fontSize: 'clamp(32px, 5vw, 44px)', 
              fontWeight: 700, 
              fontFamily: '"Playfair Display", serif', 
              lineHeight: 1.1,
              color: 'var(--text)'
            }}>
              {vnIndex ? formatPrice(vnIndex.price) : '--'}
            </div>
            <div style={{ color: colorFor(vnIndex?.pct), fontWeight: 700, fontSize: 15 }}>
              {vnIndex ? `${formatIndexChange(vnIndex.change)} (${formatPct(vnIndex.pct)})` : 'Đang lấy dữ liệu...'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 32 }}>
            <div style={{ textAlign: 'right' }}>
              <span className="ab-soft-label">Mã tăng</span>
              <div style={{ color: 'var(--green)', fontSize: 22, fontWeight: 800 }}>{loading ? '--' : breadth.gainers}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="ab-soft-label">Mã giảm</span>
              <div style={{ color: 'var(--red)', fontSize: 22, fontWeight: 800 }}>{loading ? '--' : breadth.losers}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="ab-soft-label">Biến động TB</span>
              <div style={{ color: colorFor(breadth.avgPct), fontSize: 22, fontWeight: 800 }}>
                  {Number.isFinite(breadth.avgPct) ? formatPct(breadth.avgPct) : 'N/A'}
              </div>
            </div>
          </div>
        </section>

        {showAuth && !isLoggedIn && (
          <section id="auth" className="ab-premium-card">
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</div>
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required className="ab-input" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" type="password" required className="ab-input" />
              <button type="submit" className="ab-btn ab-btn-primary" disabled={loadingAuth}>
                  {loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </form>
            <button type="button" onClick={() => setAuthMode((p) => (p === 'login' ? 'signup' : 'login'))} className="ab-btn ab-btn-subtle" style={{ marginTop: 8, width: '100%' }}>
                {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
            </button>
            {authMessage && <div className="ab-error" style={{ marginTop: 12 }}>{authMessage}</div>}
          </section>
        )}

        <section className="ab-home-grid single-focus" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          
          {/* Cột trái: Watchlist */}
          <section className="ab-premium-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ab-row-between align-center">
              <div>
                <div className="ab-card-kicker">DANH SÁCH THEO DÕI</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Watchlist</div>
              </div>
              <span className="ab-watch-count">{watchlist.length} mã</span>
            </div>

            <div className="ab-add-row">
              <input value={watchInput} onChange={(e) => setWatchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (watchlist.includes(normalizeSymbol(watchInput)) ? setWatchError('Đã có mã này') : (setWatchlist(s => sortSymbols([...s, normalizeSymbol(watchInput)])), setWatchInput('')))} placeholder="Thêm mã (VD: SSI)" className="ab-input" />
              <button type="button" onClick={() => (setWatchlist(s => sortSymbols([...s, normalizeSymbol(watchInput)])), setWatchInput(''))} className="ab-btn ab-btn-primary">Thêm</button>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))' }}>
              {loading ? Array.from({ length: 4 }).map((_, i) => <LoadingCard key={i} />) : 
                quotes.map((item) => (
                  <article key={item.symbol} className="ab-premium-card" style={{ padding: 12 }}>
                    <div className="ab-row-between align-center" style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{item.symbol}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => handleOpenNews(item.symbol)} style={{ background: 'transparent', border: 'none', color: 'var(--yellow)', cursor: 'pointer', padding: 0 }} title="Tin tức"><Newspaper size={18} /></button>
                        <button type="button" onClick={() => setWatchlist(prev => prev.filter(s => s !== item.symbol))} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }} title="Xóa"><Trash2 size={18} /></button>
                      </div>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, fontFamily: '"Playfair Display", serif' }}>{formatPrice(item.price)}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colorFor(item.change), marginTop: 4 }}>
                        {formatPrice(item.change)} ({formatPct(item.pct)})
                    </div>
                  </article>
                ))
              }
            </div>
          </section>

          {/* Cột phải: AI Assistant */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="ab-premium-card">
              <div className="ab-row-between align-center" style={{ marginBottom: 12 }}>
                <div>
                  <div className="ab-card-kicker">AI ASSISTANT</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Watchlist Scan</div>
                </div>
                <button type="button" className="ab-btn ab-btn-primary" onClick={runAiWatchlistScan} disabled={aiLoading || !watchlist.length}>
                  {aiLoading ? <><RefreshCw size={14} className="spin-animation" /> Đang quét</> : 'Quét AI'}
                </button>
              </div>
              
              {aiError && <div className="ab-error" style={{ marginBottom: 12 }}>{aiError}</div>}
              
              {aiWatchlist ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding: 12, backgroundColor: 'var(--soft)', borderRadius: 12, fontStyle: 'italic', border: '1px solid var(--border)', fontSize: 14 }}>
                      "{aiWatchlist.summary}"
                  </div>
                  
                  {aiWatchlist.picks.map((pick) => (
                    <div key={pick.symbol} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 16, background: 'linear-gradient(180deg, var(--card), var(--soft))' }}>
                      <div className="ab-row-between align-center" style={{ marginBottom: 8 }}>
                          <strong style={{ fontSize: 16 }}>{pick.symbol}</strong>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: 'var(--soft-2)', color: 'var(--muted)' }}>
                              SỨC MẠNH: {pick.score.toFixed(0)}
                          </span>
                      </div>
                      <div className="ab-soft-label" style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.4 }}>{pick.reason}</div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                          <div style={{ background: 'var(--soft)', padding: '6px 0', borderRadius: 8 }}>
                              <div className="ab-soft-label" style={{ fontSize: 10 }}>ENTRY</div>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{formatPrice(pick.entry)}</div>
                          </div>
                          <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 0', borderRadius: 8 }}>
                              <div style={{ color: 'var(--green)', fontSize: 10, fontWeight: 700 }}>TP</div>
                              <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: 13 }}>{formatPrice(pick.tp)}</div>
                          </div>
                          <div style={{ background: 'rgba(251, 113, 133, 0.08)', padding: '6px 0', borderRadius: 8 }}>
                              <div style={{ color: 'var(--red)', fontSize: 10, fontWeight: 700 }}>SL</div>
                              <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13 }}>{formatPrice(pick.sl)}</div>
                          </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                  !aiLoading && <div className="ab-soft-label" style={{ textAlign: 'center', padding: '30px 0' }}>Bấm nút "Quét AI" để phân tích watchlist.</div>
              )}
            </section>

            {/* Top Gainers */}
            <section className="ab-premium-card">
              <div className="ab-row-between align-center" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 800 }}>Tăng mạnh nhất</div>
                <Sparkles size={16} color="var(--yellow)" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topPositive.map((item) => (
                  <div key={item.symbol} className="ab-row-between align-center" style={{ padding: '10px 12px', background: 'var(--soft)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{item.symbol}</div>
                      <div className="ab-soft-label" style={{ fontSize: 12 }}>{formatPrice(item.price)}</div>
                    </div>
                    <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: 15 }}>{formatPct(item.pct)}</div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>

      {/* --- POPUP TIN TỨC --- */}
      {newsModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }}>
          <div className="ab-premium-card" style={{ width: '100%', maxWidth: 450, maxHeight: '85vh', overflowY: 'auto', position: 'relative', margin: 0, border: '1px solid var(--border-strong)' }}>
            <div className="ab-row-between align-center" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Newspaper size={22} color="var(--yellow)" />
                Tin tức: {newsModal.symbol}
              </div>
              <button onClick={() => setNewsModal({ isOpen: false, symbol: '', news: [] })} style={{ background: 'var(--soft)', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 6, borderRadius: '50%', display: 'flex' }}><X size={20} /></button>
            </div>
            {newsModal.news.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {newsModal.news.map((n, i) => (
                  <a key={i} href={`https://www.google.com/search?q=${encodeURIComponent(n.title)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15, marginBottom: 6, lineHeight: 1.4 }}>{n.title}</div>
                    <div className="ab-soft-label" style={{ fontSize: 12 }}>{n.source} • {new Date(n.pubDate).toLocaleDateString('vi-VN')}</div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="ab-soft-label" style={{ textAlign: 'center', padding: '40px 0', lineHeight: 1.6 }}>Chưa có tin tức mới. Hãy bấm <b>"Quét AI"</b> để cập nhật!</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
