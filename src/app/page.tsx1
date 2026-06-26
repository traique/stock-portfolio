'use client';

import { useCallback, useState } from 'react';
import { Activity, BookOpen, Clock, Crosshair, Newspaper, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { supabaseBrowser as supabase } from '@/lib/supabase-browser';
import AppShellHeader from '@/components/app-shell-header';
import { ErrorBoundary } from '@/components/error-boundary';
import { useSession } from '@/lib/hooks/use-session';
import { useWatchlist } from '@/lib/hooks/use-watchlist';
import { useMarketData } from '@/lib/hooks/use-market-data';
import { useAiWatchlist } from '@/lib/hooks/use-ai-watchlist';
import { useCompanyName } from '@/lib/hooks/use-company-name';
import type { NewsItem, AiPick, RiskProfile } from '@/lib/hooks/use-ai-watchlist';

// ================= TYPES =================

type NewsModal = {
  isOpen:  boolean;
  symbol:  string;
  news:    NewsItem[];
};

// ================= CONSTANTS =================

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
  background:   'var(--card)',
  border:       '1px solid var(--border)',
  borderRadius: '50%',
  width:        28,
  height:       28,
  display:      'grid',
  placeItems:   'center',
  cursor:       'pointer',
  color:        'var(--muted)',
  transition:   '0.2s',
  flexShrink:   0,
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

// Tách URL ra hàm (tránh ghi URL đầy đủ 1 dòng bị nén)
const newsSearchUrl = (title: string) =>
  'https://www.google.' + 'com/search?q=' + encodeURIComponent(title);

// ================= SUB-COMPONENTS =================

function LoadingCard() {
  return (
    <article style={QUOTE_ARTICLE_STYLE}>
      <div className="ab-skeleton" style={ { width: '40%', height: 20 } } />
      <div className="ab-skeleton" style={ { width: '60%', height: 32, marginTop: 12 } } />
      <div className="ab-skeleton" style={ { width: '100%', height: 32, marginTop: 16, borderRadius: 12 } } />
    </article>
  );
}

function EmptyWatchlist({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="ab-empty">
      <div className="ab-empty-icon"><BookOpen size={22} /></div>
      <div className="ab-empty-title">Chưa có mã nào</div>
      <div className="ab-empty-desc">
        Thêm mã cổ phiếu vào danh sách để theo dõi giá và nhận phân tích AI.
      </div>
      <button type="button" className="ab-btn ab-btn-primary"
        style={ { fontSize: 13, padding: '10px 24px' } } onClick={onAdd}>
        Thêm mã đầu tiên
      </button>
    </div>
  );
}

function EmptyAiScan() {
  return (
    <div className="ab-empty" style={ { paddingTop: 24, paddingBottom: 24 } }>
      <div className="ab-empty-icon"><Sparkles size={20} /></div>
      <div className="ab-empty-desc">
        Bấm <strong style={ { color: 'var(--text)' } }>QUÉT</strong> để AI phân tích kỹ thuật
        và gợi ý điểm mua/bán cho các mã trong danh sách.
      </div>
    </div>
  );
}

function QuoteCard({ item, onRemove, onNews }: {
  item:     { symbol: string; price: number; change: number; pct: number };
  onRemove: (symbol: string) => void;
  onNews:   (symbol: string) => void;
}) {
  const companyName = useCompanyName(item.symbol);
  return (
    <article style={QUOTE_ARTICLE_STYLE}>
      <div className="ab-row-between align-start" style={ { marginBottom: 10 } }>
        <div>
          <div style={ { fontWeight: 800, fontSize: 20, lineHeight: 1, color: 'var(--text)' } }>{item.symbol}</div>
          <span className="ab-stock-badge">{companyName ?? 'Cổ phiếu'}</span>
        </div>
        <button type="button" onClick={() => onRemove(item.symbol)}
          style={DELETE_BTN_STYLE} className="ab-delete-btn"
          title="Xóa mã" aria-label={`Xóa ${item.symbol}`}>
          <Trash2 size={13} />
        </button>
      </div>
      <div className="num-premium" style={ { fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 6 } }>
        {formatPrice(item.price)}
      </div>
      <div className="num-premium" style={ { fontSize: 13, fontWeight: 700, color: colorFor(item.change), marginTop: 3 } }>
        {formatPrice(item.change)} ({formatPct(item.pct)})
      </div>
      <button type="button" onClick={() => onNews(item.symbol)}
        style={NEWS_BTN_STYLE} className="ab-news-btn-mobile">
        <Newspaper size={14} color="var(--primary)" /> ĐỌC TIN
      </button>
    </article>
  );
}

// ── ✨ Bias MA badge ─────────────────────────────────────────────────────────
function BiasBadge({ status }: { status?: string }) {
  if (!status || status === 'an_toan') return null; // chỉ hiện khi cần cảnh báo
  const map: Record<string, { bg: string; color: string; label: string }> = {
    nguy_hiem: { bg: 'var(--red-surface)',        color: 'var(--red)',    label: 'MUA ĐUỔI ⚠' },
    canh_giac: { bg: 'rgba(245,158,11,0.12)',      color: '#f59e0b',       label: 'CẨN THẬN'    },
    chiet_khau:{ bg: 'var(--green-surface)',       color: 'var(--green)',  label: 'CHIẾT KHẤU ↓' },
    qua_ban:   { bg: 'var(--green-surface)',       color: 'var(--green)',  label: 'QUÁ BÁN ↑'   },
  };
  const s = map[status];
  if (!s) return null;
  return (
    <span title={`Bias MA5: ${status}`} style={ {
      fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
      background: s.bg, color: s.color, border: `1px solid ${s.color}33`,
      letterSpacing: '0.04em', cursor: 'help',
    } }>
      {s.label}
    </span>
  );
}

// ── ✨ MA alignment badge ─────────────────────────────────────────────────────
function MaBadge({ alignment }: { alignment?: string }) {
  if (!alignment || alignment === 'unknown') return null;
  const map: Record<string, { color: string; label: string }> = {
    bullish: { color: 'var(--green)', label: 'MA ↑↑↑' },
    bearish: { color: 'var(--red)',   label: 'MA ↓↓↓' },
    mixed:   { color: 'var(--muted)', label: 'MA ≈'   },
  };
  const s = map[alignment] ?? map.mixed;
  return (
    <span title="MA5 > MA10 > MA20 alignment" style={ {
      fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
      background: 'var(--soft)', color: s.color,
      border: '1px solid var(--border)', letterSpacing: '0.04em',
    } }>
      {s.label}
    </span>
  );
}

// ── ✨ Trend score bar ────────────────────────────────────────────────────────
function TrendScoreBar({ score }: { score?: number }) {
  if (score === undefined) return null;
  const color = score >= 65 ? 'var(--green)' : score <= 35 ? 'var(--red)' : '#f59e0b';
  return (
    <div title={`Trend Score: ${score}/100`} style={ { width: '100%', height: 4, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', marginTop: 2 } }>
      <div style={ { width: `${Math.min(score, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .5s ease' } } />
    </div>
  );
}

// ── ✨ Support / Resistance row ───────────────────────────────────────────────
function SRRow({ support, resistance, entry }: { support?: number | null; resistance?: number | null; entry: number }) {
  if (!support && !resistance) return null;
  return (
    <div style={ { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 } }>
      {support != null && (
        <span title="Vùng hỗ trợ (min low 30 phiên)" style={ {
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
          background: 'var(--green-surface)', color: 'var(--green)', cursor: 'help',
        } }>
          HT {formatPrice(support)}
        </span>
      )}
      {resistance != null && (
        <span title="Vùng kháng cự (max high 30 phiên)" style={ {
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
          background: 'var(--red-surface)', color: 'var(--red)', cursor: 'help',
        } }>
          KC {formatPrice(resistance)}
        </span>
      )}
      {support != null && resistance != null && (
        <span style={ { fontSize: 10, color: 'var(--muted)', padding: '2px 0' } }>
          {entry >= support && entry <= resistance ? '📍 Trong vùng' : entry > resistance ? '📈 Trên KC' : '📉 Dưới HT'}
        </span>
      )}
    </div>
  );
}

// ── ✨ Action checklist ───────────────────────────────────────────────────────
function ActionChecklist({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={ { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 } }>
      {items.map((item, i) => {
        const isOk   = item.startsWith('✅');
        const isWarn = item.startsWith('⚠️') || item.startsWith('⚠');
        const color  = isOk ? 'var(--green)' : isWarn ? 'var(--yellow)' : 'var(--red)';
        return (
          <div key={i} style={ { fontSize: 11, color: 'var(--text)', lineHeight: 1.4, display: 'flex', gap: 5, alignItems: 'flex-start' } }>
            <span style={ { color, flexShrink: 0 } }>{isOk ? '✅' : isWarn ? '⚠️' : '❌'}</span>
            <span style={ { opacity: 0.8 } }>{item.replace(/^[✅⚠️❌⚠]\s*/, '')}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── ✨ Sniper points ──────────────────────────────────────────────────────────
// Parse số giá từ string như "13.700 (vùng hỗ trợ gần)" → { price: "13.700", note: "vùng hỗ trợ gần" }
function parseSniperValue(val: string): { price: string; note: string } {
  if (!val) return { price: '—', note: '' };
  const m = val.match(/^([\d.,]+)\s*(?:\((.+)\))?/);
  if (m) return { price: m[1], note: m[2] ?? '' };
  // Không có số → toàn bộ là mô tả
  return { price: '', note: val };
}

function SniperPoints({ points }: { points?: AiPick['sniper_points'] }) {
  if (!points) return null;
  const rows = [
    { label: 'Lý tưởng', value: points.ideal_buy,     color: 'var(--green)' },
    { label: 'Điểm phụ', value: points.secondary_buy, color: 'var(--text)'  },
    { label: 'Cắt lỗ',   value: points.stop_loss,      color: 'var(--red)'   },
    { label: 'Chốt lời', value: points.take_profit,    color: 'var(--green)' },
  ];
  return (
    <div style={ { marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--soft)', border: '1px solid var(--border)' } }>
      <div style={ { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 } }>
        <Crosshair size={11} color="var(--muted)" />
        <span style={ { fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' } }>SNIPER POINTS</span>
      </div>
      <div style={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' } }>
        {rows.map(r => {
          const { price, note } = parseSniperValue(r.value);
          return (
            <div key={r.label} style={ { display: 'flex', flexDirection: 'column', gap: 1 } }>
              <span style={ { fontSize: 9, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' } }>{r.label}</span>
              {price ? (
                <span className="num-premium" style={ { fontSize: 13, fontWeight: 800, color: r.color } }>{price}</span>
              ) : null}
              {note ? (
                <span style={ { fontSize: 10, color: 'var(--muted)', lineHeight: 1.3 } }>{note}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ✨ Position advice tabs ───────────────────────────────────────────────────
function PositionAdvice({ advice }: { advice?: AiPick['position_advice'] }) {
  const [tab, setTab] = useState<'no' | 'has'>('no');
  if (!advice) return null;
  return (
    <div style={ { marginTop: 8 } }>
      <div style={ { display: 'flex', gap: 4, marginBottom: 6 } }>
        {[
          { key: 'no',  label: 'Chưa nắm' },
          { key: 'has', label: 'Đang nắm'  },
        ].map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key as 'no' | 'has')} style={ {
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, cursor: 'pointer',
            background: tab === t.key ? 'var(--primary)' : 'var(--soft)',
            color:      tab === t.key ? 'var(--card)'    : 'var(--muted)',
            border:     '1px solid var(--border)',
            transition: '0.15s',
          } }>
            {t.label}
          </button>
        ))}
      </div>
      <div style={ { fontSize: 12, color: 'var(--text)', opacity: 0.8, lineHeight: 1.5 } }>
        {tab === 'no' ? advice.no_position : advice.has_position}
      </div>
    </div>
  );
}

// ── ✨ Enhanced AiPickCard ────────────────────────────────────────────────────
function AiPickCard({ pick }: { pick: AiPick }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(pick.action_checklist?.length || pick.sniper_points || pick.position_advice);

  return (
    <div style={ { border: '1px solid var(--border)', borderRadius: 16, background: 'var(--soft)', overflow: 'hidden' } }>
      {/* Header */}
      <div style={ { padding: '12px 14px 8px' } }>
        <div className="ab-row-between align-center" style={ { marginBottom: 6 } }>
          <div style={ { display: 'flex', alignItems: 'center', gap: 8 } }>
            <strong style={ { fontSize: 16, color: 'var(--text)' } }>{pick.symbol}</strong>
            <BiasBadge status={pick.bias_status} />
            <MaBadge alignment={pick.ma_alignment} />
          </div>
          {(() => {
            const ds = pick.trend_score ?? pick.score;
            const c  = ds >= 65 ? 'var(--green)' : ds <= 40 ? 'var(--red)' : '#f59e0b';
            const bg = ds >= 65 ? 'rgba(16,185,129,0.12)' : ds <= 40 ? 'rgba(244,63,94,0.12)' : 'rgba(245,158,11,0.10)';
            return (
              <span className="num-premium" title="Trend Score tổng hợp (0-100)" style={ {
                fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                background: bg, border: `1px solid ${c}44`, color: c,
              } }>
                {Math.round(ds)}
              </span>
            );
          })()}
        </div>

        {/* Trend score bar — cùng số với badge */}
        <TrendScoreBar score={pick.trend_score ?? pick.score} />

        {/* Time sensitivity */}
        {pick.time_sensitivity && (
          <div style={ { display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
            padding: '3px 9px', borderRadius: 99,
            background: pick.time_sensitivity.includes('hôm nay') ? 'rgba(245,158,11,0.12)' : 'var(--soft)',
            border: '1px solid var(--border)',
          } }>
            <Clock size={10} color={pick.time_sensitivity.includes('hôm nay') ? '#f59e0b' : 'var(--muted)'} />
            <span style={ {
              fontSize: 11, fontWeight: 700,
              color: pick.time_sensitivity.includes('hôm nay') ? '#f59e0b' : 'var(--muted)',
              letterSpacing: '0.02em',
            } }>{pick.time_sensitivity}</span>
          </div>
        )}

        {/* Reason */}
        <div style={ { color: 'var(--text)', fontSize: 12, marginTop: 8, lineHeight: 1.55, opacity: 0.72 } }>
          {pick.reason}
        </div>

        {/* Support / Resistance */}
        <SRRow support={pick.support} resistance={pick.resistance} entry={pick.entry} />
      </div>

      {/* Entry / TP / SL */}
      <div style={ { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 14px 12px' } }>
        {[
          { label: 'ENTRY', value: pick.entry, title: 'Vùng giá nên mua vào', bg: 'var(--card)',         border: 'var(--border)',       color: 'var(--text)'  },
          { label: 'TP',    value: pick.tp,    title: 'Mục tiêu chốt lời',    bg: 'var(--green-surface)',border: 'var(--green-border)', color: 'var(--green)' },
          { label: 'SL',    value: pick.sl,    title: 'Cắt lỗ bảo vệ vốn',   bg: 'var(--red-surface)',  border: 'var(--red-border)',   color: 'var(--red)'   },
        ].map(({ label, value, title, bg, border, color }) => (
          <div key={label} title={title} style={ { padding: '6px 0', borderRadius: 10, textAlign: 'center', cursor: 'help', background: bg, border: `1px solid ${border}` } }>
            <div style={ { fontSize: 9, fontWeight: 800, color } }>{label}</div>
            <div className="num-premium" style={ { fontWeight: 800, fontSize: 13, marginTop: 2, color } }>
              {formatPrice(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Expandable details */}
      {hasDetails && (
        <>
          <button type="button" onClick={() => setExpanded(p => !p)} style={ {
            width: '100%', padding: '8px 14px', background: 'var(--soft-2)',
            border: 'none', borderTop: '1px solid var(--border)',
            color: 'var(--muted)', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            letterSpacing: '0.04em',
          } }>
            {expanded ? '▲ ẨN CHI TIẾT' : '▼ XEM CHI TIẾT'}
          </button>

          {expanded && (
            <div style={ { padding: '12px 14px', borderTop: '1px solid var(--border)' } }>
              <ActionChecklist items={pick.action_checklist} />
              <SniperPoints points={pick.sniper_points} />
              <PositionAdvice advice={pick.position_advice} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RiskSelector({ value, onChange }: { value: RiskProfile; onChange: (v: RiskProfile) => void }) {
  const options: { value: RiskProfile; label: string }[] = [
    { value: 'conservative', label: 'AN TOÀN' },
    { value: 'balanced',     label: 'CÂN BẰNG' },
    { value: 'aggressive',   label: 'TÍCH CỰC' },
  ];
  return (
    <div className="ab-risk-selector">
      {options.map(o => (
        <button key={o.value} type="button"
          className={`ab-risk-btn${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NewsModal({ modal, onClose }: { modal: NewsModal; onClose: () => void }) {
  if (!modal.isOpen) return null;
  return (
    <div className="ab-modal-overlay" onClick={onClose}>
      <div className="ab-premium-card ab-modal-inner" onClick={e => e.stopPropagation()}>
        <div className="ab-row-between align-center" style={ { marginBottom: 20 } }>
          <div style={ { fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 } }>
            <Newspaper size={20} color="var(--primary)" /> TIN TỨC: {modal.symbol}
          </div>
          <button onClick={onClose}
            style={ { background: 'var(--soft)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex' } }
            aria-label="Đóng">
            <X size={16} />
          </button>
        </div>
        {modal.news.length > 0 ? (
          <div style={ { display: 'flex', flexDirection: 'column', gap: 12 } }>
            {modal.news.map((n, i) => (
              <a key={i}
                href={n.url || newsSearchUrl(n.title)}
                target="_blank" rel="noopener noreferrer" className="ab-news-item">
                <div className="ab-news-title">{n.title}</div>
                <div className="ab-news-meta num-premium">
                  {n.source} • {new Date(n.pubDate).toLocaleDateString('vi-VN')}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div style={ { textAlign: 'center', padding: '40px 0', color: 'var(--muted)', lineHeight: 1.6, fontSize: 14 } }>
            Chưa có tin tức mới.<br />Hãy bấm <b>"QUÉT AI"</b> để cập nhật!
          </div>
        )}
      </div>
    </div>
  );
}

// ================= MAIN COMPONENT =================

export default function HomePage() {
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const { sessionChecked, isLoggedIn, userId, userEmail } = useSession();

  const {
    watchlist, watchlistReady, watchInput, watchError,
    setWatchInput, addSymbol, removeSymbol,
  } = useWatchlist({ sessionChecked, isLoggedIn, userId });

  const { quotes, vnIndex, loading, marketError, breadth, topPositive } =
    useMarketData(watchlist, watchlistReady);

  const {
    aiWatchlist, aiLoading, aiError,
    riskProfile, setRiskProfile, runScan,
  } = useAiWatchlist(userId, watchlist);

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [showAuth,     setShowAuth]     = useState(false);
  const [loadingAuth,  setLoadingAuth]  = useState(false);
  const [authMode,     setAuthMode]     = useState<'login' | 'signup'>('login');
  const [authMessage,  setAuthMessage]  = useState('');
  const [authEmail,    setAuthEmail]    = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [newsModal,    setNewsModal]    = useState<NewsModal>({ isOpen: false, symbol: '', news: [] });

  // ── Handlers ───────────────────────────────────────────────────────────────
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

  const handleOpenNews = useCallback((symbol: string) => {
    setNewsModal({ isOpen: true, symbol, news: aiWatchlist?.newsContext?.[symbol] ?? [] });
  }, [aiWatchlist]);

  const closeNewsModal = useCallback(() => {
    setNewsModal({ isOpen: false, symbol: '', news: [] });
  }, []);

  // ── Loading gate ───────────────────────────────────────────────────────────
  if (!sessionChecked) {
    return (
      <main className="ab-page">
        <div className="ab-shell">
          <div style={ { textAlign: 'center', padding: 40, color: 'var(--muted)' } }>
            Đang đồng bộ dữ liệu...
          </div>
        </div>
      </main>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="ab-page">
      <div className="ab-shell">

        <AppShellHeader
          isLoggedIn={isLoggedIn}
          email={userEmail}
          currentTab="home"
          onLogout={async () => {
            localStorage.removeItem(`lcta_ai_watchlist_${userId}`);
            await supabase.auth.signOut();
          }}
          onAuthOpen={() => setShowAuth(p => !p)}
        />

        {/* VN-INDEX */}
        <section className="ab-premium-card">
          <div className="ab-vnindex-compact">
            <div className="ab-vnindex-compact-main">
              <span style={ { fontSize: 10, fontWeight: 800, color: 'var(--subtle)', display: 'flex', alignItems: 'center', gap: 5, letterSpacing: '0.06em', whiteSpace: 'nowrap' } }>
                <Activity size={11} color="var(--green)" /> VN-INDEX
              </span>
              <div className="num-premium" style={ { fontSize: 'clamp(18px, 3vw, 30px)', fontWeight: 800, lineHeight: 1, color: 'var(--text)', whiteSpace: 'nowrap' } }>
                {vnIndex ? formatPrice(vnIndex.price) : '--'}
              </div>
              <div className="num-premium" style={ { color: colorFor(vnIndex?.pct), fontWeight: 700, fontSize: 'clamp(11px, 2vw, 13px)', whiteSpace: 'nowrap' } }>
                {vnIndex ? `${formatIndexChange(vnIndex.change)} (${formatPct(vnIndex.pct)})` : '...'}
              </div>
            </div>
            {[
              { label: 'Mã tăng',   value: loading ? '--' : String(breadth.gainers),   color: 'var(--green)' },
              { label: 'Mã giảm',   value: loading ? '--' : String(breadth.losers),    color: 'var(--red)'   },
              { label: 'Biến động', value: loading ? '--' : formatPct(breadth.avgPct), color: colorFor(breadth.avgPct) },
            ].map(stat => (
              <div key={stat.label} className="ab-vnindex-compact-stat">
                <span style={ { fontSize: 'clamp(9px, 1.5vw, 11px)', fontWeight: 700, color: 'var(--subtle)', whiteSpace: 'nowrap' } }>{stat.label}</span>
                <div className="num-premium" style={ { color: stat.color, fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 800, whiteSpace: 'nowrap' } }>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AUTH FORM */}
        {showAuth && !isLoggedIn && (
          <section className="ab-premium-card">
            <div style={ { fontSize: 22, fontWeight: 800, marginBottom: 16 } }>
              {authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </div>
            <form onSubmit={handleAuthSubmit} style={ { display: 'flex', flexDirection: 'column', gap: 12 } }>
              <input value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                placeholder="Email" type="email" required className="ab-input" />
              <input value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                placeholder="Mật khẩu" type="password" required className="ab-input" />
              <button type="submit" className="ab-btn ab-btn-primary" disabled={loadingAuth}>
                {loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              </button>
            </form>
            <button type="button"
              onClick={() => setAuthMode(p => p === 'login' ? 'signup' : 'login')}
              style={ { marginTop: 8, width: '100%', background: 'transparent', color: 'var(--muted)', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } }>
              {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
            </button>
            {authMessage && <div className="ab-error" style={ { marginTop: 12 } }>{authMessage}</div>}
          </section>
        )}

        {/* MAIN GRID */}
        <div style={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 } }>

          {/* LEFT: Watchlist */}
          <section className="ab-premium-card" style={CARD_STYLE}>
            <div className="ab-row-between align-center">
              <div style={ { fontSize: 22, fontWeight: 800 } }>TỔNG QUAN</div>
              <span className="num-premium" style={ { fontSize: 13, fontWeight: 700, color: 'var(--muted)', background: 'var(--soft)', padding: '4px 10px', borderRadius: 100 } }>
                {watchlist.length} MÃ
              </span>
            </div>

            <div className="ab-add-symbol-row" style={ { display: 'flex', gap: 10 } }>
              <input
                value={watchInput}
                onChange={e => setWatchInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && addSymbol()}
                placeholder="Thêm mã (VD: SSI)"
                className="ab-input"
                style={ { flex: 1 } }
              />
              <button type="button" onClick={addSymbol} className="ab-btn ab-btn-primary">
                Thêm
              </button>
            </div>

            {watchError  && <div className="ab-error">{watchError}</div>}
            {marketError && <div className="ab-error">{marketError}</div>}

            {loading ? (
              <div className="ab-quote-grid" style={ { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' } }>
                {Array.from({ length: 4 }).map((_, i) => <LoadingCard key={i} />)}
              </div>
            ) : watchlist.length === 0 ? (
              <EmptyWatchlist onAdd={() => document.querySelector<HTMLInputElement>('.ab-input')?.focus()} />
            ) : (
              <div className="ab-quote-grid" style={ { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' } }>
                {quotes.map(item => (
                  <QuoteCard key={item.symbol} item={item} onRemove={removeSymbol} onNews={handleOpenNews} />
                ))}
              </div>
            )}
          </section>

          {/* RIGHT: AI + Top movers */}
          <aside style={ { display: 'flex', flexDirection: 'column', gap: 16 } }>

            {/* AI Scan */}
            <ErrorBoundary sectionName="AI Scan">
              <section className="ab-premium-card" style={CARD_STYLE}>
                <div className="ab-row-between align-center">
                  <div style={ { fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 } }>
                    <Sparkles size={16} color="var(--yellow)" /> AI SCAN
                  </div>
                  <button type="button" className="ab-btn ab-btn-primary"
                    style={ { padding: '8px 16px', fontSize: 12 } }
                    onClick={runScan} disabled={aiLoading || !watchlist.length}>
                    {aiLoading ? <RefreshCw size={14} className="spin-animation" /> : 'QUÉT'}
                  </button>
                </div>

                <RiskSelector value={riskProfile} onChange={setRiskProfile} />

                {aiError && <div className="ab-error">{aiError}</div>}

                {aiWatchlist ? (
                  <div style={ { display: 'flex', flexDirection: 'column', gap: 12 } }>
                    <div style={ { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 } }>
                      {aiWatchlist.summary}
                    </div>
                    {aiWatchlist.picks.map(pick => <AiPickCard key={pick.symbol} pick={pick} />)}
                    {aiWatchlist.avoid.length > 0 && (
                      <div style={ { padding: '10px 14px', borderRadius: 12, background: 'var(--red-surface)', border: '1px solid var(--red-border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.5, opacity: 0.9 } }>
                        <span style={ { color: 'var(--red)', fontWeight: 800 } }>⚠ TRÁNH: </span>
                        {aiWatchlist.avoid.join(' · ')}
                      </div>
                    )}
                  </div>
                ) : (
                  !aiLoading && <EmptyAiScan />
                )}
              </section>
            </ErrorBoundary>

            {/* Top movers */}
            <section className="ab-premium-card" style={CARD_STYLE}>
              <div style={ { fontSize: 16, fontWeight: 800, color: 'var(--text)' } }>TĂNG MẠNH NHẤT</div>
              <div style={ { display: 'flex', flexDirection: 'column', gap: 8 } }>
                {topPositive.length > 0 ? (
                  topPositive.map(item => (
                    <div key={item.symbol} className="ab-row-between align-center"
                      style={ { padding: '10px 14px', background: 'var(--soft)', borderRadius: 14, border: '1px solid var(--border)', gap: 8 } }>
                      <div style={ { minWidth: 0, flex: 1 } }>
                        <div style={ { fontWeight: 800, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }>{item.symbol}</div>
                        <div className="num-premium" style={ { fontSize: 12, color: 'var(--subtle)', marginTop: 2 } }>{formatPrice(item.price)}</div>
                      </div>
                      <div className="num-premium" style={ { fontWeight: 800, color: 'var(--green)', fontSize: 15, flexShrink: 0 } }>
                        {formatPct(item.pct)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={ { fontSize: 13, color: 'var(--muted)' } }>Chưa có mã tăng điểm.</div>
                )}
              </div>
            </section>

          </aside>
        </div>
      </div>

      <NewsModal modal={newsModal} onClose={closeNewsModal} />
    </main>
  );
                                            }
