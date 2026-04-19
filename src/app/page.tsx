'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Sparkles, TrendingDown, TrendingUp, Trash2, RefreshCw } from 'lucide-react';
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

// Tối ưu các hàm format
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
      setAiError('Không thể kết nối với dịch vụ AI.');
      setAiWatchlist(null);
    } finally {
      setAiLoading(false);
    }
  }

  // Khôi phục Watchlist từ DB hoặc LocalStorage
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

  // Lưu Watchlist mỗi khi có thay đổi
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

  // Load giá thị trường
  useEffect(() => {
    (async () => {
      if (!watchlistReady) return;
      if (!watchlist.length) { setQuotes([]); setLoading(false); return; }
      
      setLoading(true); 
      setMarketError('');
      try {
        const response = await fetch(`/api/prices?symbols=${encodeURIComponent(watchlist.join(','))}`, { cache: 'no-store' });
        const data: PricesResponse = await response.json();
        if (!response.ok) {
          setMarketError(data?.error || 'Không lấy được dữ liệu giá.');
          setQuotes([]);
        } else {
          setQuotes([...(data.debug || [])].sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true })));
        }
      } catch {
        setMarketError('Lỗi kết nối dữ liệu máy chủ.');
        setQuotes([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [watchlist, watchlistReady]);

  // Load VN-Index
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
        setAuthMessage(error ? error.message : 'Tạo tài khoản thành công! Vui lòng kiểm tra email.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setAuthMessage(error.message);
        else window.location.href = '/';
      }
    } finally {
      setLoadingAuth(false);
    }
  }

  async function handleLogout() { await supabase.auth.signOut(); }

  function addWatchSymbol() {
    const symbol = normalizeSymbol(watchInput);
    if (!symbol) return setWatchError('Vui lòng nhập mã cổ phiếu hợp lệ.');
    if (watchlist.includes(symbol)) {
        setWatchInput(''); // Clear input nếu đã có
        return setWatchError(`Mã ${symbol} đã có trong danh sách.`);
    }
    setWatchlist((prev) => sortSymbols([...prev, symbol]));
    setWatchInput('');
    setWatchError('');
  }

  function removeWatchSymbol(symbol: string) {
    setWatchlist((prev) => sortSymbols(prev.filter((i) => i !== symbol)));
  }

  // Lắng nghe sự kiện Enter khi nhập mã
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWatchSymbol();
    }
  };

  if (!sessionChecked) {
      return (
          <main className="ab-page">
              <div className="ab-shell"><section className="ab-premium-card"><div className="ab-soft-label" style={{textAlign: 'center', padding: 20}}>Đang tải dữ liệu phiên làm việc...</div></section></div>
          </main>
      );
  }

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Radar đầu tư" isLoggedIn={isLoggedIn} email={userEmail} currentTab="home" onLogout={handleLogout} onAuthOpen={() => setShowAuth((p) => !p)} />

        {/* Tối ưu UI cho phần hiển thị điểm số chung */}
        <section className="ab-premium-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="ab-soft-label" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <Activity size={16} /> VN-Index
            </span>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{vnIndex ? formatPrice(vnIndex.price) : '--'}</div>
            <div style={{ color: colorFor(vnIndex?.pct), fontWeight: 600 }}>
              {vnIndex ? `${formatIndexChange(vnIndex.change)} (${formatPct(vnIndex.pct)})` : 'Đang lấy dữ liệu...'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span className="ab-soft-label">Mã tăng</span>
              <strong style={{ color: 'var(--green)', fontSize: 20 }}>{loading ? '--' : breadth.gainers}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span className="ab-soft-label">Mã giảm</span>
              <strong style={{ color: 'var(--red)', fontSize: 20 }}>{loading ? '--' : breadth.losers}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span className="ab-soft-label">Biến động TB</span>
              <strong style={{ color: colorFor(breadth.avgPct), fontSize: 20 }}>
                  {Number.isFinite(breadth.avgPct) ? formatPct(breadth.avgPct) : 'N/A'}
              </strong>
            </div>
          </div>
        </section>

        {showAuth && !isLoggedIn ? (
          <section id="auth" className="ab-premium-card">
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</div>
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required className="ab-input" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" type="password" required className="ab-input" />
              <button type="submit" className="ab-btn ab-btn-primary" disabled={loadingAuth}>
                  {loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </form>
            <button type="button" onClick={() => setAuthMode((p) => (p === 'login' ? 'signup' : 'login'))} className="ab-btn ab-btn-ghost" style={{ marginTop: 8 }}>
                {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
            </button>
            {authMessage ? <div className="ab-error" style={{ marginTop: 8 }}>{authMessage}</div> : null}
          </section>
        ) : null}

        <section className="ab-home-grid single-focus" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          
          {/* Cột trái: Watchlist */}
          <section className="ab-premium-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ab-row-between align-center">
              <div style={{ fontWeight: 700, fontSize: 16 }}>Danh sách theo dõi</div>
              <div className="ab-soft-label">{quotes.length} mã</div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input 
                  value={watchInput} 
                  onChange={(e) => setWatchInput(e.target.value)} 
                  onKeyDown={handleKeyDown}
                  placeholder="Thêm mã (VD: SSI)" 
                  className="ab-input" 
                  style={{ flex: 1 }} 
              />
              <button type="button" onClick={addWatchSymbol} className="ab-btn ab-btn-primary">Thêm</button>
            </div>

            {watchError ? <div className="ab-error">{watchError}</div> : null}
            {marketError ? <div className="ab-error">{marketError}</div> : null}

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {loading ? (
                Array.from({ length: Math.max(4, watchlist.length || 4) }).map((_, index) => <LoadingCard key={index} />)
              ) : quotes.length ? (
                quotes.map((item) => (
                  <article key={item.symbol} className="ab-premium-card" style={{ padding: 12, position: 'relative' }}>
                    <div className="ab-row-between align-start" style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{item.symbol}</div>
                      <button type="button" className="ab-btn ab-btn-ghost" style={{ padding: 4 }} onClick={() => removeWatchSymbol(item.symbol)} aria-label={`Xóa ${item.symbol}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{formatPrice(item.price)}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: colorFor(item.change), marginTop: 4 }}>
                        {formatPrice(item.change)} ({formatPct(item.pct)})
                    </div>
                  </article>
                ))
              ) : (
                <div className="ab-soft-label" style={{ gridColumn: '1 / -1' }}>Danh sách trống. Vui lòng thêm mã cổ phiếu.</div>
              )}
            </div>
          </section>

          {/* Cột phải: AI & Market Movers */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            
            <section className="ab-premium-card">
              <div className="ab-row-between align-center" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>AI Watchlist Scan</div>
                <button type="button" className="ab-btn ab-btn-primary" onClick={runAiWatchlistScan} disabled={aiLoading || !watchlist.length}>
                  {aiLoading ? <><RefreshCw size={14} className="spin-animation" /> Đang quét</> : 'Quét AI'}
                </button>
              </div>
              
              <div className="ab-soft-label" style={{ marginBottom: 16 }}>Tự động quét kỹ thuật và gợi ý điểm mua bán an toàn cho các mã trong danh sách.</div>
              
              {aiError ? <div className="ab-error">{aiError}</div> : null}
              {aiWatchlist?.cached ? <div className="ab-note" style={{ marginBottom: 12 }}>⚡ Kết quả được lấy từ bộ nhớ đệm (làm mới sau {Math.round((aiWatchlist.cache_ttl_seconds || 0) / 60)} phút).</div> : null}
              
              {aiWatchlist ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding: 12, backgroundColor: 'var(--soft-1)', borderRadius: 8, fontStyle: 'italic' }}>
                      "{aiWatchlist.summary}"
                  </div>
                  
                  {(aiWatchlist.picks || []).map((pick) => (
                    <div key={pick.symbol} style={{ padding: 12, border: '1px solid var(--soft-2)', borderRadius: 8 }}>
                      <div className="ab-row-between align-center" style={{ marginBottom: 8 }}>
                          <strong style={{ fontSize: 16 }}>{pick.symbol}</strong>
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 12, backgroundColor: 'var(--soft-2)' }}>
                              Điểm: {pick.score.toFixed(1)}/100
                          </span>
                      </div>
                      <div className="ab-soft-label" style={{ fontSize: 13, marginBottom: 8 }}>{pick.reason}</div>
                      
                      {/* Tối ưu hiển thị các mốc giá */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
                          <div style={{ backgroundColor: 'var(--soft-1)', padding: '4px 0', borderRadius: 4 }}>
                              <div className="ab-soft-label" style={{ fontSize: 11 }}>ENTRY</div>
                              <span style={{ color: 'var(--foreground)' }}>{formatPrice(pick.entry)}</span>
                          </div>
                          <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', padding: '4px 0', borderRadius: 4 }}>
                              <div style={{ color: 'var(--green)', fontSize: 11 }}>CHỐT LỜI</div>
                              <span style={{ color: 'var(--green)' }}>{formatPrice(pick.tp)}</span>
                          </div>
                          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '4px 0', borderRadius: 4 }}>
                              <div style={{ color: 'var(--red)', fontSize: 11 }}>CẮT LỖ</div>
                              <span style={{ color: 'var(--red)' }}>{formatPrice(pick.sl)}</span>
                          </div>
                      </div>
                    </div>
                  ))}
                  
                  {aiWatchlist.avoid?.length ? (
                      <div style={{ marginTop: 8, padding: 12, backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                          <span style={{ color: 'var(--red)', fontWeight: 600 }}>⚠️ Rủi ro cao, hạn chế mua: </span>
                          <span className="ab-soft-label">{aiWatchlist.avoid.join(', ')}</span>
                      </div>
                  ) : null}
                </div>
              ) : (
                  !aiLoading && <div className="ab-soft-label" style={{ textAlign: 'center', padding: '20px 0' }}>Bấm nút "Quét AI" để xem nhận định.</div>
              )}
            </section>

            <section className="ab-premium-card">
              <div className="ab-row-between align-center" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Tăng mạnh nhất (Watchlist)</div>
                <Sparkles size={16} color="var(--yellow)" />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="ab-row-between align-center" style={{ padding: 8 }}>
                      <div className="ab-skeleton skeleton-line" style={{ width: 60 }} />
                      <div className="ab-skeleton skeleton-line" style={{ width: 40 }} />
                    </div>
                  ))
                ) : topPositive.length ? topPositive.map((item) => (
                  <div key={item.symbol} className="ab-row-between align-center" style={{ padding: '8px 12px', backgroundColor: 'var(--soft-1)', borderRadius: 6 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.symbol}</div>
                      <div className="ab-soft-label" style={{ fontSize: 13 }}>{formatPrice(item.price)}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--green)' }}>{formatPct(item.pct)}</div>
                  </div>
                )) : <div className="ab-soft-label" style={{ padding: 8 }}>Không có mã tăng giá.</div>}
              </div>
            </section>

          </aside>
        </section>
      </div>
    </main>
  );
}
