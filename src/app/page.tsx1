'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Newspaper, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';

// ================= TYPES =================

type QuoteItem = {
  symbol: string;
  price:  number;
  change: number;
  pct:    number;
  volume?: number;
};

type PricesResponse = {
  debug?: QuoteItem[];
  error?: string;
};

type NewsItem = {
  title:   string;
  source:  string;
  pubDate: string;
  url?:    string;
};

type AiPick = {
  symbol: string;
  score:  number;
  reason: string;
  entry:  number;
  tp:     number;
  sl:     number;
};

type AiWatchlistResponse = {
  summary:             string;
  picks:               AiPick[];
  avoid:               string[];
  newsContext?:        Record<string, NewsItem[]>;
  cached?:             boolean;
  cache_ttl_seconds?:  number;
  cached_at?:          string;
  error?:              string;
  ai_fallback?:        boolean;
  ai_fallback_reason?: string;
  ai_model_used?:      string;
};

type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

type NewsModal = {
  isOpen:  boolean;
  symbol:  string;
  news:    NewsItem[];
};

// ================= CONSTANTS =================

const DEFAULT_WATCHLIST = ['BID', 'FPT', 'HPG', 'VCB'];
const AI_CACHE_KEY      = 'lcta_ai_watchlist_result';

// ================= FORMATTERS =================

const priceFormatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formatPrice = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? 'N/A' : priceFormatter.format(v);

const formatPct = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

const formatIndexChange = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

const colorFor = (v?: number | null): string =>
  !Number.isFinite(v as number)
    ? 'var(--muted)'
    : (v as number) > 0
    ? 'var(--green)'
    : (v as number) < 0
    ? 'var(--red)'
    : 'var(--muted)';

// ================= HELPERS =================

const normalizeSymbol = (s: string) =>
  s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const sortSymbols = (s: string[]) =>
  [...s].sort((a, b) => a.localeCompare(b));

// Use userId (not email) as localStorage key — avoids edge cases with special chars in email
const getWatchlistKey = (userId?: string) =>
  `lcta_watchlist_${userId ?? 'guest'}`;

// ================= STATIC STYLES =================

const CARD_STYLE: React.CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           16,
};

const QUOTE_ARTICLE_STYLE: React.CSSProperties = {
  background:    'var(--soft)',
  borderRadius:  20,
  padding:       16,
  border:        '1px solid var(--border)',
  display:       'flex',
  flexDirection: 'column',
};

const DELETE_BTN_STYLE: React.CSSProperties = {
  background:  'var(--card)',
  border:      '1px solid var(--border)',
  borderRadius:'50%',
  width:       28,
  height:      28,
  display:     'grid',
  placeItems:  'center',
  cursor:      'pointer',
  color:       'var(--muted)',
  transition:  '0.2s',
  flexShrink:  0,
};

const NEWS_BTN_STYLE: React.CSSProperties = {
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  gap:            6,
  background:     'var(--card)',
  border:         '1px solid var(--border)',
  borderRadius:   12,
  padding:        '8px',
  marginTop:      'auto',
  paddingTop:     16,
  cursor:         'pointer',
  color:          'var(--text)',
  fontSize:       11,
  fontWeight:     700,
  letterSpacing:  '0.02em',
};

const PICK_TP_STYLE: React.CSSProperties = {
  background:   'rgba(16, 185, 129, 0.10)',
  padding:      '6px 0',
  borderRadius: 10,
  border:       '1px solid rgba(16, 185, 129, 0.20)',
  textAlign:    'center',
};

const PICK_SL_STYLE: React.CSSProperties = {
  background:   'rgba(244, 63, 94, 0.10)',
  padding:      '6px 0',
  borderRadius: 10,
  border:       '1px solid rgba(244, 63, 94, 0.20)',
  textAlign:    'center',
};

const PICK_ENTRY_STYLE: React.CSSProperties = {
  background:   'var(--card)',
  padding:      '6px 0',
  borderRadius: 10,
  border:       '1px solid var(--border)',
  textAlign:    'center',
};

// ================= SUB-COMPONENTS =================

function LoadingCard() {
  return (
    <article style={QUOTE_ARTICLE_STYLE}>
      <div className="ab-skeleton" style={{ width: '40%', height: 20 }} />
      <div className="ab-skeleton" style={{ width: '60%', height: 32, marginTop: 12 }} />
      <div className="ab-skeleton" style={{ width: '100%', height: 32, marginTop: 16, borderRadius: 12 }} />
    </article>
  );
}

function QuoteCard({
  item,
  onRemove,
  onNews,
}: {
  item:     QuoteItem;
  onRemove: (symbol: string) => void;
  onNews:   (symbol: string) => void;
}) {
  return (
    <article style={QUOTE_ARTICLE_STYLE}>
      <div className="ab-row-between align-start" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{item.symbol}</div>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.05em' }}>
            CỔ PHIẾU
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.symbol)}
          style={DELETE_BTN_STYLE}
          title="Xóa mã"
          aria-label={`Xóa ${item.symbol}`}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div className="num-premium" style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>
        {formatPrice(item.price)}
      </div>
      <div className="num-premium" style={{ fontSize: 13, fontWeight: 800, color: colorFor(item.change), marginTop: 4 }}>
        {formatPrice(item.change)} ({formatPct(item.pct)})
      </div>

      <button
        type="button"
        onClick={() => onNews(item.symbol)}
        style={NEWS_BTN_STYLE}
      >
        <Newspaper size={14} color="var(--primary)" />
        ĐỌC TIN
      </button>
    </article>
  );
}

function AiPickCard({ pick }: { pick: AiPick }) {
  return (
    <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--soft)' }}>
      <div className="ab-row-between align-center" style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 16 }}>{pick.symbol}</strong>
        <span
          className="num-premium"
          style={{
            fontSize: 11, fontWeight: 800, padding: '4px 8px',
            borderRadius: 99, background: 'var(--card)',
            border: '1px solid var(--border)', color: 'var(--text)',
          }}
        >
          ĐIỂM: {pick.score.toFixed(0)}
        </span>
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
        {pick.reason}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={PICK_ENTRY_STYLE}>
          <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 800 }}>ENTRY</div>
          <div className="num-premium" style={{ fontWeight: 800, fontSize: 13, marginTop: 2 }}>
            {formatPrice(pick.entry)}
          </div>
        </div>
        <div style={PICK_TP_STYLE}>
          <div style={{ color: 'var(--green)', fontSize: 9, fontWeight: 800 }}>TP</div>
          <div className="num-premium" style={{ color: 'var(--green)', fontWeight: 800, fontSize: 13, marginTop: 2 }}>
            {formatPrice(pick.tp)}
          </div>
        </div>
        <div style={PICK_SL_STYLE}>
          <div style={{ color: 'var(--red)', fontSize: 9, fontWeight: 800 }}>SL</div>
          <div className="num-premium" style={{ color: 'var(--red)', fontWeight: 800, fontSize: 13, marginTop: 2 }}>
            {formatPrice(pick.sl)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RiskSelector({
  value,
  onChange,
}: {
  value:    RiskProfile;
  onChange: (v: RiskProfile) => void;
}) {
  const options: { value: RiskProfile; label: string }[] = [
    { value: 'conservative', label: 'AN TOÀN' },
    { value: 'balanced',     label: 'CÂN BẰNG' },
    { value: 'aggressive',   label: 'TÍCH CỰC' },
  ];

  return (
    <div className="ab-risk-selector">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`ab-risk-btn${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NewsModal({
  modal,
  onClose,
}: {
  modal:   NewsModal;
  onClose: () => void;
}) {
  if (!modal.isOpen) return null;

  return (
    <div className="ab-modal-overlay" onClick={onClose}>
      <div
        className="ab-premium-card ab-modal-inner"
        onClick={e => e.stopPropagation()}
      >
        <div className="ab-row-between align-center" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Newspaper size={20} color="var(--primary)" />
            TIN TỨC: {modal.symbol}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--soft)', border: '1px solid var(--border)',
              color: 'var(--text)', cursor: 'pointer', padding: 8,
              borderRadius: '50%', display: 'flex',
            }}
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        {modal.news.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {modal.news.map((n, i) => (
              <a
                key={i}
                href={n.url || `https://www.google.com/search?q=${encodeURIComponent(n.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ab-news-item"
              >
                <div className="ab-news-title">{n.title}</div>
                <div className="ab-news-meta num-premium">
                  {n.source} • {new Date(n.pubDate).toLocaleDateString('vi-VN')}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', lineHeight: 1.6, fontSize: 14 }}>
            Chưa có tin tức mới.<br />
            Hãy bấm <b>"QUÉT AI"</b> để cập nhật!
          </div>
        )}
      </div>
    </div>
  );
}

// ================= MAIN COMPONENT =================

export default function HomePage() {
  // --- Auth state ---
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLoggedIn,     setIsLoggedIn]     = useState(false);
  const [userEmail,      setUserEmail]      = useState('');
  const [userId,         setUserId]         = useState('');

  // --- Auth form ---
  const [showAuth,     setShowAuth]     = useState(false);
  const [loadingAuth,  setLoadingAuth]  = useState(false);
  const [authMode,     setAuthMode]     = useState<'login' | 'signup'>('login');
  const [authMessage,  setAuthMessage]  = useState('');
  const [authEmail,    setAuthEmail]    = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // --- Watchlist ---
  const [watchlist,      setWatchlist]      = useState<string[]>(DEFAULT_WATCHLIST);
  const [watchInput,     setWatchInput]     = useState('');
  const [watchError,     setWatchError]     = useState('');
  const [watchlistReady, setWatchlistReady] = useState(false);
  const lastSavedPayloadRef = useRef('');

  // --- Market data ---
  const [quotes,      setQuotes]      = useState<QuoteItem[]>([]);
  const [vnIndex,     setVnIndex]     = useState<QuoteItem | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [marketError, setMarketError] = useState('');

  // --- AI ---
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiModel,     setAiModel]     = useState('llama-3.3-70b-versatile');
  const [aiError,     setAiError]     = useState('');
  const [aiWatchlist, setAiWatchlist] = useState<AiWatchlistResponse | null>(null);
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('balanced');

  // --- News modal ---
  const [newsModal, setNewsModal] = useState<NewsModal>({
    isOpen: false, symbol: '', news: [],
  });

  // ================= EFFECTS =================

  // Auth session
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const s = data.session;
      setIsLoggedIn(!!s);
      setUserEmail(s?.user?.email ?? '');
      setUserId(s?.user?.id ?? '');
      setSessionChecked(true);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setIsLoggedIn(!!s);
      setUserEmail(s?.user?.email ?? '');
      setUserId(s?.user?.id ?? '');
      if (s) setShowAuth(false);
      setSessionChecked(true);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // Load AI model preference + listen for changes from header
  useEffect(() => {
    const saved = localStorage.getItem('lcta_ai_model');
    if (saved) setAiModel(saved);
    const handler = (e: Event) => {
      const model = (e as CustomEvent<{ model: string }>).detail.model;
      setAiModel(model);
    };
    window.addEventListener('lcta:ai-model-change', handler);
    return () => window.removeEventListener('lcta:ai-model-change', handler);
  }, []);

  // Restore AI cache from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(AI_CACHE_KEY);
    if (!saved) return;
    try { setAiWatchlist(JSON.parse(saved)); } catch {}
  }, []);

  // Persist AI result to localStorage
  useEffect(() => {
    if (aiWatchlist) localStorage.setItem(AI_CACHE_KEY, JSON.stringify(aiWatchlist));
  }, [aiWatchlist]);

  // Load watchlist — Supabase (logged in) → localStorage → default
  useEffect(() => {
    if (!sessionChecked) return;

    (async () => {
      setWatchlistReady(false);

      if (isLoggedIn && userId) {
        try {
          const { data, error } = await supabase
            .from('watchlists')
            .select('symbol')
            .order('symbol', { ascending: true });

          if (!error && Array.isArray(data) && data.length) {
            const symbols = sortSymbols(
              data.map(r => normalizeSymbol(String(r.symbol))).filter(Boolean),
            );
            setWatchlist(symbols);
            lastSavedPayloadRef.current = JSON.stringify(symbols);
            setWatchlistReady(true);
            return;
          }
        } catch {}
      }

      const saved = localStorage.getItem(getWatchlistKey(userId || undefined));
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length) {
            const symbols = sortSymbols(
              parsed.map(i => normalizeSymbol(String(i))).filter(Boolean),
            );
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
  }, [sessionChecked, isLoggedIn, userId]);

  // Persist watchlist changes — localStorage + Supabase
  useEffect(() => {
    if (!sessionChecked || !watchlistReady) return;

    const sorted  = sortSymbols(watchlist);
    const payload = JSON.stringify(sorted);
    localStorage.setItem(getWatchlistKey(userId || undefined), payload);
    if (payload === lastSavedPayloadRef.current) return;

    (async () => {
      if (isLoggedIn && userId) {
        try {
          await supabase.from('watchlists').delete().eq('user_id', userId);
          if (sorted.length) {
            await supabase.from('watchlists').insert(
              sorted.map(symbol => ({ user_id: userId, symbol })),
            );
          }
        } catch {}
      }
      lastSavedPayloadRef.current = payload;
    })();
  }, [watchlist, userId, isLoggedIn, sessionChecked, watchlistReady]);

  // Fetch watchlist quotes
  useEffect(() => {
    if (!watchlistReady) return;
    if (!watchlist.length) { setQuotes([]); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setMarketError('');

    (async () => {
      try {
        const res  = await fetch(`/api/prices?symbols=${encodeURIComponent(watchlist.join(','))}`, { cache: 'no-store' });
        const data: PricesResponse = await res.json();
        if (!cancelled) {
          if (res.ok) {
            setQuotes([...(data.debug ?? [])].sort((a, b) => a.symbol.localeCompare(b.symbol)));
          } else {
            setMarketError(data.error ?? 'Không thể tải giá thị trường');
          }
        }
      } catch {
        if (!cancelled) setMarketError('Không thể kết nối với server');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [watchlist, watchlistReady]);

  // Fetch VN-Index separately
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch('/api/prices?symbols=VNINDEX', { cache: 'no-store' });
        const data: PricesResponse = await res.json();
        const item = data?.debug?.[0];
        if (!cancelled) setVnIndex(item && Number(item.price) > 0 ? item : null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // ================= DERIVED DATA =================

  const breadth = useMemo(() => {
    const valid = quotes.filter(i => Number.isFinite(i.pct));
    return {
      gainers: valid.filter(i => i.pct > 0).length,
      losers:  valid.filter(i => i.pct < 0).length,
      avgPct:  valid.length
        ? valid.reduce((s, i) => s + i.pct, 0) / valid.length
        : 0,
    };
  }, [quotes]);

  const topPositive = useMemo(
    () => [...quotes].filter(i => i.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3),
    [quotes],
  );

  // ================= HANDLERS =================

  const handleAuthSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAuth(true);
    setAuthMessage('');
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
        setAuthMessage(error ? error.message : 'Kiểm tra email để xác nhận tài khoản.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) setAuthMessage(error.message);
        else window.location.href = '/';
      }
    } finally {
      setLoadingAuth(false);
    }
  }, [authMode, authEmail, authPassword]);

  const addWatchSymbol = useCallback(() => {
    const symbol = normalizeSymbol(watchInput);
    if (!symbol) { setWatchError('Vui lòng nhập mã hợp lệ.'); return; }
    if (watchlist.includes(symbol)) {
      setWatchInput('');
      setWatchError(`Mã ${symbol} đã có trong danh sách.`);
      return;
    }
    setWatchlist(prev => sortSymbols([...prev, symbol]));
    setWatchInput('');
    setWatchError('');
  }, [watchInput, watchlist]);

  const removeSymbol = useCallback((symbol: string) => {
    setWatchlist(prev => prev.filter(s => s !== symbol));
  }, []);

  const handleOpenNews = useCallback((symbol: string) => {
    setNewsModal({
      isOpen: true,
      symbol,
      news: aiWatchlist?.newsContext?.[symbol] ?? [],
    });
  }, [aiWatchlist]);

  const closeNewsModal = useCallback(() => {
    setNewsModal({ isOpen: false, symbol: '', news: [] });
  }, []);

  const runAiWatchlistScan = useCallback(async () => {
    if (!watchlist.length) return;
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai/watchlist-scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ symbols: watchlist, risk_profile: riskProfile, force_refresh: true, model: aiModel }),
      });
      const payload: AiWatchlistResponse = await res.json();
      if (!res.ok) setAiError(payload?.error ?? 'Không thể phân tích watchlist');
      else setAiWatchlist(payload);
    } catch {
      setAiError('Không thể kết nối với dịch vụ AI.');
    } finally {
      setAiLoading(false);
    }
  }, [watchlist, riskProfile]);

  // ================= LOADING GATE =================

  if (!sessionChecked) {
    return (
      <main className="ab-page">
        <div className="ab-shell">
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
            Đang đồng bộ dữ liệu...
          </div>
        </div>
      </main>
    );
  }

  // ================= RENDER =================

  return (
    <main className="ab-page">
      <div className="ab-shell">

        <AppShellHeader
          isLoggedIn={isLoggedIn}
          email={userEmail}
          currentTab="home"
          onLogout={async () => supabase.auth.signOut()}
          onAuthOpen={() => setShowAuth(p => !p)}
        />

        {/* --- VN-INDEX OVERVIEW --- */}
        <section className="ab-premium-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.05em' }}>
              <Activity size={14} color="var(--green)" /> VN-INDEX
            </span>
            <div className="num-premium" style={{ fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, lineHeight: 1.1, color: 'var(--text)' }}>
              {vnIndex ? formatPrice(vnIndex.price) : '--'}
            </div>
            <div className="num-premium" style={{ color: colorFor(vnIndex?.pct), fontWeight: 700, fontSize: 16 }}>
              {vnIndex
                ? `${formatIndexChange(vnIndex.change)} (${formatPct(vnIndex.pct)})`
                : 'Đang tải...'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 32 }}>
            {[
              { label: 'Mã tăng',   value: loading ? '--' : String(breadth.gainers), color: 'var(--green)' },
              { label: 'Mã giảm',   value: loading ? '--' : String(breadth.losers),  color: 'var(--red)'   },
              { label: 'Biến động', value: loading ? '--' : formatPct(breadth.avgPct), color: colorFor(breadth.avgPct) },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{stat.label}</span>
                <div className="num-premium" style={{ color: stat.color, fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* --- AUTH FORM --- */}
        {showAuth && !isLoggedIn && (
          <section className="ab-premium-card">
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>
              {authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </div>
            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder="Email"
                type="email"
                required
                className="ab-input"
              />
              <input
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="Mật khẩu"
                type="password"
                required
                className="ab-input"
              />
              <button type="submit" className="ab-btn ab-btn-primary" disabled={loadingAuth}>
                {loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setAuthMode(p => p === 'login' ? 'signup' : 'login')}
              style={{ marginTop: 8, width: '100%', background: 'transparent', color: 'var(--muted)', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
            >
              {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
            </button>
            {authMessage && <div className="ab-error" style={{ marginTop: 12 }}>{authMessage}</div>}
          </section>
        )}

        {/* --- MAIN GRID --- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

          {/* LEFT: Watchlist */}
          <section className="ab-premium-card" style={CARD_STYLE}>
            <div className="ab-row-between align-center">
              <div style={{ fontSize: 22, fontWeight: 800 }}>TỔNG QUAN</div>
              <span
                className="num-premium"
                style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--muted)',
                  background: 'var(--soft)', padding: '4px 10px', borderRadius: 100,
                }}
              >
                {watchlist.length} MÃ
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={watchInput}
                onChange={e => setWatchInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && addWatchSymbol()}
                placeholder="Thêm mã (VD: SSI)"
                className="ab-input"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={addWatchSymbol} className="ab-btn ab-btn-primary">
                Thêm
              </button>
            </div>

            {watchError  && <div className="ab-error">{watchError}</div>}
            {marketError && <div className="ab-error">{marketError}</div>}

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <LoadingCard key={i} />)
                : quotes.map(item => (
                    <QuoteCard
                      key={item.symbol}
                      item={item}
                      onRemove={removeSymbol}
                      onNews={handleOpenNews}
                    />
                  ))
              }
            </div>
          </section>

          {/* RIGHT: AI + Top movers */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* AI Scan */}
            <section className="ab-premium-card" style={CARD_STYLE}>
              <div className="ab-row-between align-center">
                <div style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color="var(--yellow)" /> AI SCAN
                </div>
                <button
                  type="button"
                  className="ab-btn ab-btn-primary"
                  style={{ padding: '8px 16px', fontSize: 12 }}
                  onClick={runAiWatchlistScan}
                  disabled={aiLoading || !watchlist.length}
                >
                  {aiLoading ? <RefreshCw size={14} className="spin-animation" /> : 'QUÉT'}
                </button>
              </div>

              {/* Risk profile selector — was missing in original */}
              <RiskSelector value={riskProfile} onChange={setRiskProfile} />

              {aiError && <div className="ab-error">{aiError}</div>}

              {aiWatchlist ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
                    {aiWatchlist.summary}
                  </div>

                  {aiWatchlist.picks.map(pick => (
                    <AiPickCard key={pick.symbol} pick={pick} />
                  ))}

                  {aiWatchlist.avoid.length > 0 && (
                    <div style={{
                      padding: '10px 14px', borderRadius: 12,
                      background: 'rgba(244, 63, 94, 0.05)',
                      border: '1px solid rgba(244, 63, 94, 0.15)',
                      fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
                    }}>
                      <span style={{ color: 'var(--red)', fontWeight: 800 }}>⚠ TRÁNH: </span>
                      {aiWatchlist.avoid.join(' · ')}
                    </div>
                  )}
                </div>
              ) : (
                !aiLoading && (
                  <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
                    Tự động quét kỹ thuật và gợi ý điểm mua bán an toàn cho các mã trong danh sách.
                  </div>
                )
              )}
            </section>

            {/* Top movers */}
            <section className="ab-premium-card" style={CARD_STYLE}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>TĂNG MẠNH NHẤT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topPositive.length > 0 ? (
                  topPositive.map(item => (
                    <div
                      key={item.symbol}
                      className="ab-row-between align-center"
                      style={{
                        padding: '10px 14px', background: 'var(--soft)',
                        borderRadius: 14, border: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{item.symbol}</div>
                        <div className="num-premium" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          {formatPrice(item.price)}
                        </div>
                      </div>
                      <div className="num-premium" style={{ fontWeight: 800, color: 'var(--green)', fontSize: 15 }}>
                        {formatPct(item.pct)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Chưa có mã tăng điểm.</div>
                )}
              </div>
            </section>

          </aside>
        </div>

      </div>

      {/* --- NEWS MODAL --- */}
      <NewsModal modal={newsModal} onClose={closeNewsModal} />

    </main>
  );
}
