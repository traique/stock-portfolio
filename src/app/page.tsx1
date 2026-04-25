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
    <article style={{ background: 'var(--soft)', borderRadius: 24, padding: 16, border: '1px solid var(--border)' }}>
      <div className="ab-skeleton" style={{ width: '40%', height: 20 }} />
      <div className="ab-skeleton" style={{ width: '60%', height: 32, marginTop: 12 }} />
      <div className="ab-skeleton" style={{ width: '100%', height: 32, marginTop: 16, borderRadius: 12 }} />
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

  function addWatchSymbol() {
    const symbol = normalizeSymbol(watchInput);
    if (!symbol) return setWatchError('Vui lòng nhập mã hợp lệ.');
    if (watchlist.includes(symbol)) {
        setWatchInput(''); 
        return setWatchError(`Mã ${symbol} đã có trong danh sách.`);
    }
    setWatchlist((prev) => sortSymbols([...prev, symbol]));
    setWatchInput('');
    setWatchError('');
  }

  if (!sessionChecked) return <main className="ab-page"><div className="ab-shell"><div className="ab-soft-label" style={{textAlign: 'center', padding: 40}}>Đang đồng bộ dữ liệu...</div></div></main>;

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Trang chủ" isLoggedIn={isLoggedIn} email={userEmail} currentTab="home" onLogout={async () => await supabase.auth.signOut()} onAuthOpen={() => setShowAuth((p) => !p)} />

        {/* --- TỔNG QUAN VN-INDEX --- */}
        <section className="ab-premium-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', background: 'var(--card)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.05em' }}>
                <Activity size={14} color="var(--green)" /> VN-INDEX
            </span>
            <div className="num-premium" style={{ fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, lineHeight: 1.1, color: 'var(--text)' }}>
              {vnIndex ? formatPrice(vnIndex.price) : '--'}
            </div>
            <div className="num-premium" style={{ color: colorFor(vnIndex?.pct), fontWeight: 700, fontSize: 16 }}>
              {vnIndex ? `${formatIndexChange(vnIndex.change)} (${formatPct(vnIndex.pct)})` : 'Đang tải...'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 32 }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Mã tăng</span>
              <div className="num-premium" style={{ color: 'var(--green)', fontSize: 24, fontWeight: 800, marginTop: 4 }}>{loading ? '--' : breadth.gainers}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Mã giảm</span>
              <div className="num-premium" style={{ color: 'var(--red)', fontSize: 24, fontWeight: 800, marginTop: 4 }}>{loading ? '--' : breadth.losers}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Biến động</span>
              <div className="num-premium" style={{ color: colorFor(breadth.avgPct), fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                  {Number.isFinite(breadth.avgPct) ? formatPct(breadth.avgPct) : '--'}
              </div>
            </div>
          </div>
        </section>

        {showAuth && !isLoggedIn && (
          <section id="auth" className="ab-premium-card">
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>{authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</div>
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required className="ab-input" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" type="password" required className="ab-input" />
              <button type="submit" className="ab-btn ab-btn-primary" disabled={loadingAuth}>
                  {loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </form>
            <button type="button" onClick={() => setAuthMode((p) => (p === 'login' ? 'signup' : 'login'))} className="ab-btn" style={{ marginTop: 8, width: '100%', background: 'transparent', color: 'var(--muted)', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
            </button>
            {authMessage && <div className="ab-error" style={{ marginTop: 12 }}>{authMessage}</div>}
          </section>
        )}

        <section className="ab-home-grid single-focus" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          
          {/* --- DANH SÁCH THEO DÕI --- */}
          <section className="ab-premium-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ab-row-between align-center">
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
                TỔNG QUAN
              </div>
              <span className="num-premium" style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', background: 'var(--soft)', padding: '4px 10px', borderRadius: 100 }}>
                {watchlist.length} MÃ
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <input 
                value={watchInput} 
                onChange={(e) => setWatchInput(e.target.value.toUpperCase())} 
                onKeyDown={(e) => e.key === 'Enter' && addWatchSymbol()} 
                placeholder="Thêm mã (VD: SSI)" 
                className="ab-input" 
                style={{ flex: 1 }}
              />
              <button type="button" onClick={addWatchSymbol} className="ab-btn ab-btn-primary">
                Thêm
              </button>
            </div>
            {watchError && <div className="ab-error" style={{ marginLeft: 6 }}>{watchError}</div>}
            {marketError && <div className="ab-error" style={{ marginLeft: 6 }}>{marketError}</div>}

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginTop: 8 }}>
              {loading ? Array.from({ length: 4 }).map((_, i) => <LoadingCard key={i} />) : 
                quotes.map((item) => (
                  <article key={item.symbol} style={{ 
                    background: 'var(--soft)', 
                    borderRadius: 20, 
                    padding: 16, 
                    border: '1px solid var(--border)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {/* Hàng 1: Mã CK và Nút Xóa (Cách xa nhau để chống bấm nhầm) */}
                    <div className="ab-row-between align-start" style={{ marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{item.symbol}</div>
                        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.05em' }}>CỔ PHIẾU</div>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setWatchlist(prev => prev.filter(s => s !== item.symbol))} 
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '50%', width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--muted)', transition: '0.2s' }} 
                        title="Xóa mã"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Hàng 2: Giá (Dùng font Manrope) */}
                    <div className="num-premium" style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
                      {formatPrice(item.price)}
                    </div>
                    <div className="num-premium" style={{ fontSize: 13, fontWeight: 800, color: colorFor(item.change), marginTop: 4 }}>
                      {formatPrice(item.change)} ({formatPct(item.pct)})
                    </div>

                    {/* Hàng 3: Nút Tin tức (Đáy thẻ, thanh dài) */}
                    <button 
                      type="button" 
                      onClick={() => handleOpenNews(item.symbol)} 
                      style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, 
                        background: 'var(--card)', border: '1px solid var(--border)', 
                        borderRadius: 12, padding: '8px', marginTop: 16, cursor: 'pointer', 
                        color: 'var(--text)', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
                        transition: 'background 0.2s' 
                      }}
                    >
                      <Newspaper size={14} color="var(--primary)" />
                      ĐỌC TIN
                    </button>
                  </article>
                ))
              }
            </div>
          </section>

          {/* --- CỘT AI & TĂNG MẠNH NHẤT --- */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="ab-premium-card">
              <div className="ab-row-between align-center" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color="var(--yellow)" /> AI SCAN
                </div>
                <button type="button" className="ab-btn ab-btn-primary" style={{ padding: '8px 16px', fontSize: 12 }} onClick={runAiWatchlistScan} disabled={aiLoading || !watchlist.length}>
                  {aiLoading ? <RefreshCw size={14} className="spin-animation" /> : 'QUÉT'}
                </button>
              </div>
              
              {aiError && <div className="ab-error" style={{ marginBottom: 12 }}>{aiError}</div>}
              
              {aiWatchlist ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>
                    {aiWatchlist.summary}
                  </div>
                  
                  {aiWatchlist.picks.map((pick) => (
                    <div key={pick.symbol} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--soft)' }}>
                      <div className="ab-row-between align-center" style={{ marginBottom: 8 }}>
                          <strong style={{ fontSize: 16 }}>{pick.symbol}</strong>
                          <span className="num-premium" style={{ fontSize: 11, fontWeight: 800, padding: '4px 8px', borderRadius: 99, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                              ĐIỂM: {pick.score.toFixed(0)}
                          </span>
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>{pick.reason}</div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                          <div style={{ background: 'var(--card)', padding: '6px 0', borderRadius: 10, border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 800 }}>ENTRY</div>
                              <div className="num-premium" style={{ fontWeight: 800, fontSize: 13, marginTop: 2 }}>{formatPrice(pick.entry)}</div>
                          </div>
                          <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '6px 0', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                              <div style={{ color: 'var(--green)', fontSize: 9, fontWeight: 800 }}>TP</div>
                              <div className="num-premium" style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13, marginTop: 2 }}>{formatPrice(pick.tp)}</div>
                          </div>
                          <div style={{ background: 'rgba(244, 63, 94, 0.1)', padding: '6px 0', borderRadius: 10, border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                              <div style={{ color: 'var(--red)', fontSize: 9, fontWeight: 800 }}>SL</div>
                              <div className="num-premium" style={{ color: 'var(--red)', fontWeight: 800, fontSize: 13, marginTop: 2 }}>{formatPrice(pick.sl)}</div>
                          </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                  !aiLoading && <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Tự động quét kỹ thuật và gợi ý điểm mua bán an toàn cho các mã trong danh sách.</div>
              )}
            </section>

            <section className="ab-premium-card">
              <div className="ab-row-between align-center" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                  TĂNG MẠNH NHẤT
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topPositive.length > 0 ? topPositive.map((item) => (
                  <div key={item.symbol} className="ab-row-between align-center" style={{ padding: '10px 14px', background: 'var(--soft)', borderRadius: 14, border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{item.symbol}</div>
                      <div className="num-premium" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{formatPrice(item.price)}</div>
                    </div>
                    <div className="num-premium" style={{ fontWeight: 800, color: 'var(--green)', fontSize: 15 }}>{formatPct(item.pct)}</div>
                  </div>
                )) : (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Chưa có mã tăng điểm.</div>
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>

      {/* --- MODAL TIN TỨC --- */}
      {newsModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <div className="ab-premium-card" style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', position: 'relative', margin: 0, padding: 24 }}>
            <div className="ab-row-between align-center" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Newspaper size={20} color="var(--primary)" />
                TIN TỨC: {newsModal.symbol}
              </div>
              <button onClick={() => setNewsModal({ isOpen: false, symbol: '', news: [] })} style={{ background: 'var(--soft)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex' }}><X size={16} /></button>
            </div>
            {newsModal.news.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {newsModal.news.map((n, i) => (
                  <a key={i} href={`https://www.google.com/search?q=${encodeURIComponent(n.title)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', padding: 14, background: 'var(--soft)', borderRadius: 14, border: '1px solid var(--border)', transition: 'transform 0.2s' }}>
                    <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14, marginBottom: 8, lineHeight: 1.4 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{n.source} • {new Date(n.pubDate).toLocaleDateString('vi-VN')}</div>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', lineHeight: 1.6, fontSize: 14 }}>Chưa có tin tức mới.<br/>Hãy bấm <b>"QUÉT AI"</b> để cập nhật!</div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
