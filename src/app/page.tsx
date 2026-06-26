'use client';

import {
  memo,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  Activity, BookOpen, Clock, Crosshair, Newspaper,
  RefreshCw, Sparkles, Trash2, X,
} from 'lucide-react';
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

type NewsModalState = { isOpen: boolean; symbol: string; news: NewsItem[] };
type Quote = { symbol: string; price: number; change: number; pct: number };

// ================= STATIC STYLES (hoisted — created once) =================

const CARD_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const QUOTE_ARTICLE_STYLE: CSSProperties = {
  background: 'var(--soft)', borderRadius: 20, padding: 16,
  border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
};
const DELETE_BTN_STYLE: CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '50%',
  width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: 'pointer',
  color: 'var(--muted)', transition: '0.2s', flexShrink: 0,
};
const NEWS_BTN_STYLE: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
  padding: '8px', marginTop: 'auto', paddingTop: 16, cursor: 'pointer',
  color: 'var(--text)', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
};
const QUOTE_GRID_STYLE: CSSProperties = {
  display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
};
const MAIN_GRID_STYLE: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16,
};

const SKELETON_1_STYLE: CSSProperties = { width: '40%', height: 20 };
const SKELETON_2_STYLE: CSSProperties = { width: '60%', height: 32, marginTop: 12 };
const SKELETON_3_STYLE: CSSProperties = { width: '100%', height: 32, marginTop: 16, borderRadius: 12 };

const EMPTY_ADD_BTN_STYLE: CSSProperties = { fontSize: 13, padding: '10px 24px' };
const EMPTY_AI_STYLE: CSSProperties = { paddingTop: 24, paddingBottom: 24 };
const EMPTY_AI_STRONG_STYLE: CSSProperties = { color: 'var(--text)' };

const QUOTE_HEADER_STYLE: CSSProperties = { marginBottom: 10 };
const QUOTE_SYMBOL_STYLE: CSSProperties = { fontWeight: 800, fontSize: 20, lineHeight: 1, color: 'var(--text)' };
const QUOTE_PRICE_STYLE: CSSProperties = { fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 6 };

const SR_ROW_STYLE: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 };
const SR_SUPPORT_STYLE: CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
  background: 'var(--green-surface)', color: 'var(--green)', cursor: 'help',
};
const SR_RESISTANCE_STYLE: CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
  background: 'var(--red-surface)', color: 'var(--red)', cursor: 'help',
};
const SR_RANGE_STYLE: CSSProperties = { fontSize: 10, color: 'var(--muted)', padding: '2px 0' };

const TREND_BAR_STYLE: CSSProperties = { width: '100%', height: 4, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', marginTop: 2 };

const CHECKLIST_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 };
const CHECKLIST_ITEM_STYLE: CSSProperties = { fontSize: 11, color: 'var(--text)', lineHeight: 1.4, display: 'flex', gap: 5, alignItems: 'flex-start' };
const CHECKLIST_TEXT_STYLE: CSSProperties = { opacity: 0.8 };

const SNIPER_WRAP_STYLE: CSSProperties = { marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--soft)', border: '1px solid var(--border)' };
const SNIPER_HEADER_STYLE: CSSProperties = { display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 };
const SNIPER_TITLE_STYLE: CSSProperties = { fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.05em' };
const SNIPER_GRID_STYLE: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' };
const SNIPER_CELL_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1 };
const SNIPER_LABEL_STYLE: CSSProperties = { fontSize: 9, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };
const SNIPER_NOTE_STYLE: CSSProperties = { fontSize: 10, color: 'var(--muted)', lineHeight: 1.3 };

const POSITION_WRAP_STYLE: CSSProperties = { marginTop: 8 };
const POSITION_TABS_STYLE: CSSProperties = { display: 'flex', gap: 4, marginBottom: 6 };
const POSITION_TEXT_STYLE: CSSProperties = { fontSize: 12, color: 'var(--text)', opacity: 0.8, lineHeight: 1.5 };

const AICARD_WRAP_STYLE: CSSProperties = { border: '1px solid var(--border)', borderRadius: 16, background: 'var(--soft)', overflow: 'hidden' };
const AICARD_HEADER_STYLE: CSSProperties = { padding: '12px 14px 8px' };
const AICARD_TITLE_ROW_STYLE: CSSProperties = { marginBottom: 6 };
const AICARD_SYMBOL_ROW_STYLE: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const AICARD_SYMBOL_STYLE: CSSProperties = { fontSize: 16, color: 'var(--text)' };
const AICARD_REASON_STYLE: CSSProperties = { color: 'var(--text)', fontSize: 12, marginTop: 8, lineHeight: 1.55, opacity: 0.72 };
const AICARD_TILES_STYLE: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '0 14px 12px' };
const AICARD_EXPAND_BTN_STYLE: CSSProperties = {
  width: '100%', padding: '8px 14px', background: 'var(--soft-2)',
  border: 'none', borderTop: '1px solid var(--border)',
  color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, letterSpacing: '0.04em',
};
const AICARD_DETAILS_STYLE: CSSProperties = { padding: '12px 14px', borderTop: '1px solid var(--border)' };

const MODAL_HEADER_STYLE: CSSProperties = { marginBottom: 20 };
const MODAL_TITLE_STYLE: CSSProperties = { fontSize: 20, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 };
const MODAL_CLOSE_STYLE: CSSProperties = { background: 'var(--soft)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex' };
const MODAL_LIST_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const MODAL_EMPTY_STYLE: CSSProperties = { textAlign: 'center', padding: '40px 0', color: 'var(--muted)', lineHeight: 1.6, fontSize: 14 };

const AUTH_TITLE_STYLE: CSSProperties = { fontSize: 22, fontWeight: 800, marginBottom: 16 };
const AUTH_FORM_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const AUTH_SWITCH_STYLE: CSSProperties = { marginTop: 8, width: '100%', background: 'transparent', color: 'var(--muted)', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 };
const AUTH_MSG_STYLE: CSSProperties = { marginTop: 12 };

const ADD_ROW_STYLE: CSSProperties = { display: 'flex', gap: 10 };
const ADD_INPUT_STYLE: CSSProperties = { flex: 1 };

const SYNC_STYLE: CSSProperties = { textAlign: 'center', padding: 40, color: 'var(--muted)' };

const VNINDEX_LABEL_STYLE: CSSProperties = { fontSize: 10, fontWeight: 800, color: 'var(--subtle)', display: 'flex', alignItems: 'center', gap: 5, letterSpacing: '0.06em', whiteSpace: 'nowrap' };
const VNINDEX_PRICE_STYLE: CSSProperties = { fontSize: 'clamp(18px, 3vw, 30px)', fontWeight: 800, lineHeight: 1, color: 'var(--text)', whiteSpace: 'nowrap' };
const VNINDEX_STAT_LABEL_STYLE: CSSProperties = { fontSize: 'clamp(9px, 1.5vw, 11px)', fontWeight: 700, color: 'var(--subtle)', whiteSpace: 'nowrap' };

const SECTION_TITLE_LG_STYLE: CSSProperties = { fontSize: 22, fontWeight: 800 };
const COUNT_BADGE_STYLE: CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--muted)', background: 'var(--soft)', padding: '4px 10px', borderRadius: 100 };

const ASIDE_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const AI_TITLE_STYLE: CSSProperties = { fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 };
const AI_SCAN_BTN_STYLE: CSSProperties = { padding: '8px 16px', fontSize: 12 };
const AI_LIST_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const AI_SUMMARY_STYLE: CSSProperties = { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 };
const AI_AVOID_STYLE: CSSProperties = { padding: '10px 14px', borderRadius: 12, background: 'var(--red-surface)', border: '1px solid var(--red-border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.5, opacity: 0.9 };
const AI_AVOID_LABEL_STYLE: CSSProperties = { color: 'var(--red)', fontWeight: 800 };

const TOP_TITLE_STYLE: CSSProperties = { fontSize: 16, fontWeight: 800, color: 'var(--text)' };
const TOP_LIST_STYLE: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const TOP_EMPTY_STYLE: CSSProperties = { fontSize: 13, color: 'var(--muted)' };
const TOP_ROW_STYLE: CSSProperties = { padding: '10px 14px', background: 'var(--soft)', borderRadius: 14, border: '1px solid var(--border)', gap: 8 };
const TOP_ROW_LEFT_STYLE: CSSProperties = { minWidth: 0, flex: 1 };
const TOP_SYMBOL_STYLE: CSSProperties = { fontWeight: 800, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const TOP_PRICE_STYLE: CSSProperties = { fontSize: 12, color: 'var(--subtle)', marginTop: 2 };
const TOP_PCT_STYLE: CSSProperties = { fontWeight: 800, color: 'var(--green)', fontSize: 15, flexShrink: 0 };

// Regex compiled once, not per call
const CHECKLIST_PREFIX_RE = /^[✅⚠️❌⚠]\s*/;
const SNIPER_VALUE_RE = /^([\d.,]+)\s*(?:\((.+)\))?/;

// Static config arrays (hoisted)
const SNIPER_ROW_DEFS = [
  { label: 'Lý tưởng', key: 'ideal_buy',     color: 'var(--green)' },
  { label: 'Điểm phụ', key: 'secondary_buy', color: 'var(--text)'  },
  { label: 'Cắt lỗ',   key: 'stop_loss',     color: 'var(--red)'   },
  { label: 'Chốt lời', key: 'take_profit',   color: 'var(--green)' },
] as const;

const POSITION_TABS = [
  { key: 'no',  label: 'Chưa nắm' },
  { key: 'has', label: 'Đang nắm' },
] as const;

const RISK_OPTIONS: { value: RiskProfile; label: string }[] = [
  { value: 'conservative', label: 'AN TOÀN' },
  { value: 'balanced',     label: 'CÂN BẰNG' },
  { value: 'aggressive',   label: 'TÍCH CỰC' },
];

const BIAS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  nguy_hiem:  { bg: 'var(--red-surface)',   color: 'var(--red)',   label: 'MUA ĐUỔI ⚠' },
  canh_giac:  { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b',     label: 'CẨN THẬN' },
  chiet_khau: { bg: 'var(--green-surface)', color: 'var(--green)', label: 'CHIẾT KHẤU ↓' },
  qua_ban:    { bg: 'var(--green-surface)', color: 'var(--green)', label: 'QUÁ BÁN ↑' },
};
const MA_MAP: Record<string, { color: string; label: string }> = {
  bullish: { color: 'var(--green)', label: 'MA ↑↑↑' },
  bearish: { color: 'var(--red)',   label: 'MA ↓↓↓' },
  mixed:   { color: 'var(--muted)', label: 'MA ≈' },
};

// ================= FORMATTERS =================

const priceFormatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const formatPrice = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? 'N/A' : priceFormatter.format(v);
const formatPct = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const formatIndexChange = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
const colorFor = (v?: number | null): string =>
  !Number.isFinite(v as number) ? 'var(--muted)'
    : (v as number) > 0 ? 'var(--green)'
    : (v as number) < 0 ? 'var(--red)' : 'var(--muted)';
const newsSearchUrl = (title: string) =>
  'https://www.google.' + 'com/search?q=' + encodeURIComponent(title);

// ================= SUB-COMPONENTS (memoized) =================

const LoadingCard = memo(function LoadingCard() {
  return (
    <article style={QUOTE_ARTICLE_STYLE}>
      <div className="ab-skeleton" style={SKELETON_1_STYLE} />
      <div className="ab-skeleton" style={SKELETON_2_STYLE} />
      <div className="ab-skeleton" style={SKELETON_3_STYLE} />
    </article>
  );
});

function EmptyWatchlist({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="ab-empty">
      <div className="ab-empty-icon"><BookOpen size={22} /></div>
      <div className="ab-empty-title">Chưa có mã nào</div>
      <div className="ab-empty-desc">
        Thêm mã cổ phiếu vào danh sách để theo dõi giá và nhận phân tích AI.
      </div>
      <button type="button" className="ab-btn ab-btn-primary" style={EMPTY_ADD_BTN_STYLE} onClick={onAdd}>
        Thêm mã đầu tiên
      </button>
    </div>
  );
}

function EmptyAiScan() {
  return (
    <div className="ab-empty" style={EMPTY_AI_STYLE}>
      <div className="ab-empty-icon"><Sparkles size={20} /></div>
      <div className="ab-empty-desc">
        Bấm <strong style={EMPTY_AI_STRONG_STYLE}>QUÉT</strong> để AI phân tích kỹ thuật
        và gợi ý điểm mua/bán cho các mã trong danh sách.
      </div>
    </div>
  );
}

const QuoteCard = memo(function QuoteCard({ item, onRemove, onNews }: {
  item: Quote;
  onRemove: (symbol: string) => void;
  onNews: (symbol: string) => void;
}) {
  const companyName = useCompanyName(item.symbol);
  const handleRemove = useCallback(() => onRemove(item.symbol), [onRemove, item.symbol]);
  const handleNews = useCallback(() => onNews(item.symbol), [onNews, item.symbol]);
  const changeStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: colorFor(item.change), marginTop: 3 };
  return (
    <article style={QUOTE_ARTICLE_STYLE}>
      <div className="ab-row-between align-start" style={QUOTE_HEADER_STYLE}>
        <div>
          <div style={QUOTE_SYMBOL_STYLE}>{item.symbol}</div>
          <span className="ab-stock-badge">{companyName ?? 'Cổ phiếu'}</span>
        </div>
        <button type="button" onClick={handleRemove} style={DELETE_BTN_STYLE}
          className="ab-delete-btn" title="Xóa mã" aria-label={`Xóa ${item.symbol}`}>
          <Trash2 size={13} />
        </button>
      </div>
      <div className="num-premium" style={QUOTE_PRICE_STYLE}>
        {formatPrice(item.price)}
      </div>
      <div className="num-premium" style={changeStyle}>
        {formatPrice(item.change)} ({formatPct(item.pct)})
      </div>
      <button type="button" onClick={handleNews} style={NEWS_BTN_STYLE} className="ab-news-btn-mobile">
        <Newspaper size={14} color="var(--primary)" /> ĐỌC TIN
      </button>
    </article>
  );
});

const BiasBadge = memo(function BiasBadge({ status }: { status?: string }) {
  if (!status || status === 'an_toan') return null;
  const s = BIAS_MAP[status];
  if (!s) return null;
  const badgeStyle: CSSProperties = {
    fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
    background: s.bg, color: s.color, border: `1px solid ${s.color}33`,
    letterSpacing: '0.04em', cursor: 'help',
  };
  return <span title={`Bias MA5: ${status}`} style={badgeStyle}>{s.label}</span>;
});

const MaBadge = memo(function MaBadge({ alignment }: { alignment?: string }) {
  if (!alignment || alignment === 'unknown') return null;
  const s = MA_MAP[alignment] ?? MA_MAP.mixed;
  const badgeStyle: CSSProperties = {
    fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
    background: 'var(--soft)', color: s.color,
    border: '1px solid var(--border)', letterSpacing: '0.04em',
  };
  return <span title="MA5 > MA10 > MA20 alignment" style={badgeStyle}>{s.label}</span>;
});

const TrendScoreBar = memo(function TrendScoreBar({ score }: { score?: number }) {
  if (score === undefined) return null;
  const color = score >= 65 ? 'var(--green)' : score <= 35 ? 'var(--red)' : '#f59e0b';
  const fillStyle: CSSProperties = { width: `${Math.min(score, 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .5s ease' };
  return (
    <div title={`Trend Score: ${score}/100`} style={TREND_BAR_STYLE}>
      <div style={fillStyle} />
    </div>
  );
});

const SRRow = memo(function SRRow({ support, resistance, entry }: {
  support?: number | null; resistance?: number | null; entry: number;
}) {
  if (!support && !resistance) return null;
  return (
    <div style={SR_ROW_STYLE}>
      {support != null && (
        <span title="Vùng hỗ trợ (min low 30 phiên)" style={SR_SUPPORT_STYLE}>HT {formatPrice(support)}</span>
      )}
      {resistance != null && (
        <span title="Vùng kháng cự (max high 30 phiên)" style={SR_RESISTANCE_STYLE}>KC {formatPrice(resistance)}</span>
      )}
      {support != null && resistance != null && (
        <span style={SR_RANGE_STYLE}>
          {entry >= support && entry <= resistance ? '📍 Trong vùng' : entry > resistance ? '📈 Trên KC' : '📉 Dưới HT'}
        </span>
      )}
    </div>
  );
});

const ActionChecklist = memo(function ActionChecklist({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={CHECKLIST_STYLE}>
      {items.map((item) => {
        const isOk = item.startsWith('✅');
        const isWarn = item.startsWith('⚠️') || item.startsWith('⚠');
        const color = isOk ? 'var(--green)' : isWarn ? 'var(--yellow)' : 'var(--red)';
        const iconStyle: CSSProperties = { color, flexShrink: 0 };
        return (
          <div key={item} style={CHECKLIST_ITEM_STYLE}>
            <span style={iconStyle}>{isOk ? '✅' : isWarn ? '⚠️' : '❌'}</span>
            <span style={CHECKLIST_TEXT_STYLE}>{item.replace(CHECKLIST_PREFIX_RE, '')}</span>
          </div>
        );
      })}
    </div>
  );
});

// Pure helper — không tạo closure trong render
function parseSniperValue(val: string): { price: string; note: string } {
  if (!val) return { price: '—', note: '' };
  const m = val.match(SNIPER_VALUE_RE);
  if (m) return { price: m[1], note: m[2] ?? '' };
  return { price: '', note: val };
}

const SniperPoints = memo(function SniperPoints({ points }: { points?: AiPick['sniper_points'] }) {
  if (!points) return null;
  return (
    <div style={SNIPER_WRAP_STYLE}>
      <div style={SNIPER_HEADER_STYLE}>
        <Crosshair size={11} color="var(--muted)" />
        <span style={SNIPER_TITLE_STYLE}>SNIPER POINTS</span>
      </div>
      <div style={SNIPER_GRID_STYLE}>
        {SNIPER_ROW_DEFS.map((r) => {
          const { price, note } = parseSniperValue(points[r.key]);
          const priceStyle: CSSProperties = { fontSize: 13, fontWeight: 800, color: r.color };
          return (
            <div key={r.label} style={SNIPER_CELL_STYLE}>
              <span style={SNIPER_LABEL_STYLE}>{r.label}</span>
              {price ? <span className="num-premium" style={priceStyle}>{price}</span> : null}
              {note ? <span style={SNIPER_NOTE_STYLE}>{note}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
});

const PositionAdvice = memo(function PositionAdvice({ advice }: { advice?: AiPick['position_advice'] }) {
  const [tab, setTab] = useState<'no' | 'has'>('no');
  if (!advice) return null;
  return (
    <div style={POSITION_WRAP_STYLE}>
      <div style={POSITION_TABS_STYLE}>
        {POSITION_TABS.map((t) => {
          const tabStyle: CSSProperties = {
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, cursor: 'pointer',
            background: tab === t.key ? 'var(--primary)' : 'var(--soft)',
            color: tab === t.key ? 'var(--card)' : 'var(--muted)',
            border: '1px solid var(--border)', transition: '0.15s',
          };
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={tabStyle}>{t.label}</button>
          );
        })}
      </div>
      <div style={POSITION_TEXT_STYLE}>
        {tab === 'no' ? advice.no_position : advice.has_position}
      </div>
    </div>
  );
});

const PriceTile = memo(function PriceTile({ label, value, title, bg, border, color }: {
  label: string; value: number; title: string; bg: string; border: string; color: string;
}) {
  const wrapStyle: CSSProperties = { padding: '6px 0', borderRadius: 10, textAlign: 'center', cursor: 'help', background: bg, border: `1px solid ${border}` };
  const labelStyle: CSSProperties = { fontSize: 9, fontWeight: 800, color };
  const valueStyle: CSSProperties = { fontWeight: 800, fontSize: 13, marginTop: 2, color };
  return (
    <div title={title} style={wrapStyle}>
      <div style={labelStyle}>{label}</div>
      <div className="num-premium" style={valueStyle}>{formatPrice(value)}</div>
    </div>
  );
});

const AiPickCard = memo(function AiPickCard({ pick }: { pick: AiPick }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((p) => !p), []);
  const hasDetails = !!(pick.action_checklist?.length || pick.sniper_points || pick.position_advice);
  const ds = pick.trend_score ?? pick.score;
  const scoreColor = ds >= 65 ? 'var(--green)' : ds <= 40 ? 'var(--red)' : '#f59e0b';
  const scoreBg = ds >= 65 ? 'rgba(16,185,129,0.12)' : ds <= 40 ? 'rgba(244,63,94,0.12)' : 'rgba(245,158,11,0.10)';
  const urgentToday = pick.time_sensitivity?.includes('hôm nay');
  const scoreBadgeStyle: CSSProperties = {
    fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
    background: scoreBg, border: `1px solid ${scoreColor}44`, color: scoreColor,
  };
  const timeWrapStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
    padding: '3px 9px', borderRadius: 99,
    background: urgentToday ? 'rgba(245,158,11,0.12)' : 'var(--soft)',
    border: '1px solid var(--border)',
  };
  const timeTextStyle: CSSProperties = {
    fontSize: 11, fontWeight: 700,
    color: urgentToday ? '#f59e0b' : 'var(--muted)', letterSpacing: '0.02em',
  };
  return (
    <div style={AICARD_WRAP_STYLE}>
      <div style={AICARD_HEADER_STYLE}>
        <div className="ab-row-between align-center" style={AICARD_TITLE_ROW_STYLE}>
          <div style={AICARD_SYMBOL_ROW_STYLE}>
            <strong style={AICARD_SYMBOL_STYLE}>{pick.symbol}</strong>
            <BiasBadge status={pick.bias_status} />
            <MaBadge alignment={pick.ma_alignment} />
          </div>
          <span className="num-premium" title="Trend Score tổng hợp (0-100)" style={scoreBadgeStyle}>{Math.round(ds)}</span>
        </div>
        <TrendScoreBar score={pick.trend_score ?? pick.score} />
        {pick.time_sensitivity && (
          <div style={timeWrapStyle}>
            <Clock size={10} color={urgentToday ? '#f59e0b' : 'var(--muted)'} />
            <span style={timeTextStyle}>{pick.time_sensitivity}</span>
          </div>
        )}
        <div style={AICARD_REASON_STYLE}>{pick.reason}</div>
        <SRRow support={pick.support} resistance={pick.resistance} entry={pick.entry} />
      </div>
      <div style={AICARD_TILES_STYLE}>
        <PriceTile label="ENTRY" value={pick.entry} title="Vùng giá nên mua vào" bg="var(--card)" border="var(--border)" color="var(--text)" />
        <PriceTile label="TP" value={pick.tp} title="Mục tiêu chốt lời" bg="var(--green-surface)" border="var(--green-border)" color="var(--green)" />
        <PriceTile label="SL" value={pick.sl} title="Cắt lỗ bảo vệ vốn" bg="var(--red-surface)" border="var(--red-border)" color="var(--red)" />
      </div>
      {hasDetails && (
        <>
          <button type="button" onClick={toggle} style={AICARD_EXPAND_BTN_STYLE}>{expanded ? '▲ ẨN CHI TIẾT' : '▼ XEM CHI TIẾT'}</button>
          {expanded && (
            <div style={AICARD_DETAILS_STYLE}>
              <ActionChecklist items={pick.action_checklist} />
              <SniperPoints points={pick.sniper_points} />
              <PositionAdvice advice={pick.position_advice} />
            </div>
          )}
        </>
      )}
    </div>
  );
});

function RiskSelector({ value, onChange }: { value: RiskProfile; onChange: (v: RiskProfile) => void }) {
  return (
    <div className="ab-risk-selector">
      {RISK_OPTIONS.map((o) => (
        <button key={o.value} type="button"
          className={`ab-risk-btn${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

const NewsModal = memo(function NewsModal({ modal, onClose }: { modal: NewsModalState; onClose: () => void }) {
  if (!modal.isOpen) return null;
  return (
    <div className="ab-modal-overlay" onClick={onClose}>
      <div className="ab-premium-card ab-modal-inner" onClick={(e) => e.stopPropagation()}>
        <div className="ab-row-between align-center" style={MODAL_HEADER_STYLE}>
          <div style={MODAL_TITLE_STYLE}>
            <Newspaper size={20} color="var(--primary)" /> TIN TỨC: {modal.symbol}
          </div>
          <button onClick={onClose} aria-label="Đóng" style={MODAL_CLOSE_STYLE}>
            <X size={16} />
          </button>
        </div>
        {modal.news.length > 0 ? (
          <div style={MODAL_LIST_STYLE}>
            {modal.news.map((n) => (
              <a key={n.url || n.title} href={n.url || newsSearchUrl(n.title)}
                target="_blank" rel="noopener noreferrer" className="ab-news-item">
                <div className="ab-news-title">{n.title}</div>
                <div className="ab-news-meta num-premium">
                  {n.source} • {new Date(n.pubDate).toLocaleDateString('vi-VN')}
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div style={MODAL_EMPTY_STYLE}>
            Chưa có tin tức mới.<br />Hãy bấm <b>"QUÉT AI"</b> để cập nhật!
          </div>
        )}
      </div>
    </div>
  );
});

// Form auth tách riêng + uncontrolled ⇒ gõ phím không re-render dashboard
const AuthForm = memo(function AuthForm() {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authMessage, setAuthMessage] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const email = emailRef.current?.value ?? '';
    const password = passwordRef.current?.value ?? '';
    setLoadingAuth(true);
    setAuthMessage('');
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
  }, [authMode]);

  return (
    <section className="ab-premium-card">
      <div style={AUTH_TITLE_STYLE}>
        {authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
      </div>
      <form onSubmit={handleSubmit} style={AUTH_FORM_STYLE}>
        <input ref={emailRef} placeholder="Email" type="email" required className="ab-input" />
        <input ref={passwordRef} placeholder="Mật khẩu" type="password" required className="ab-input" />
        <button type="submit" className="ab-btn ab-btn-primary" disabled={loadingAuth}>
          {loadingAuth ? 'Đang xử lý...' : authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </button>
      </form>
      <button type="button"
        onClick={() => setAuthMode((p) => (p === 'login' ? 'signup' : 'login'))}
        style={AUTH_SWITCH_STYLE}>
        {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
      </button>
      {authMessage && <div className="ab-error" style={AUTH_MSG_STYLE}>{authMessage}</div>}
    </section>
  );
});

// Ô thêm mã tách riêng ⇒ gõ phím chỉ re-render component này
const AddSymbolRow = memo(function AddSymbolRow({ inputRef, value, onChange, onAdd }: {
  inputRef: React.RefObject<HTMLInputElement>;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="ab-add-symbol-row" style={ADD_ROW_STYLE}>
      <input ref={inputRef} value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        placeholder="Thêm mã (VD: SSI)" className="ab-input" style={ADD_INPUT_STYLE} />
      <button type="button" onClick={onAdd} className="ab-btn ab-btn-primary">Thêm</button>
    </div>
  );
});

const VnIndexStat = memo(function VnIndexStat({ label, value, color }: { label: string; value: string; color: string }) {
  const valueStyle: CSSProperties = { color, fontSize: 'clamp(16px, 2.5vw, 22px)', fontWeight: 800, whiteSpace: 'nowrap' };
  return (
    <div className="ab-vnindex-compact-stat">
      <span style={VNINDEX_STAT_LABEL_STYLE}>{label}</span>
      <div className="num-premium" style={valueStyle}>{value}</div>
    </div>
  );
});

const TopMoverRow = memo(function TopMoverRow({ item }: { item: Quote }) {
  return (
    <div className="ab-row-between align-center" style={TOP_ROW_STYLE}>
      <div style={TOP_ROW_LEFT_STYLE}>
        <div style={TOP_SYMBOL_STYLE}>{item.symbol}</div>
        <div className="num-premium" style={TOP_PRICE_STYLE}>{formatPrice(item.price)}</div>
      </div>
      <div className="num-premium" style={TOP_PCT_STYLE}>{formatPct(item.pct)}</div>
    </div>
  );
});

// ================= MAIN COMPONENT =================

export default function HomePage() {
  const { sessionChecked, isLoggedIn, userId, userEmail } = useSession();
  const {
    watchlist, watchlistReady, watchInput, watchError,
    setWatchInput, addSymbol, removeSymbol,
  } = useWatchlist({ sessionChecked, isLoggedIn, userId });
  const { quotes, vnIndex, loading, marketError, breadth, topPositive } =
    useMarketData(watchlist, watchlistReady);
  const { aiWatchlist, aiLoading, aiError, riskProfile, setRiskProfile, runScan } =
    useAiWatchlist(userId, watchlist);

  const [showAuth, setShowAuth] = useState(false);
  const [newsModal, setNewsModal] = useState<NewsModalState>({ isOpen: false, symbol: '', news: [] });

  const inputRef = useRef<HTMLInputElement>(null);

  // Giữ aiWatchlist trong ref ⇒ handleOpenNews ổn định (deps rỗng),
  // không phá memo của QuoteCard sau mỗi lần QUÉT.
  const aiWatchlistRef = useRef(aiWatchlist);
  aiWatchlistRef.current = aiWatchlist;

  const handleOpenNews = useCallback((symbol: string) => {
    setNewsModal({ isOpen: true, symbol, news: aiWatchlistRef.current?.newsContext?.[symbol] ?? [] });
  }, []);
  const closeNewsModal = useCallback(() => {
    setNewsModal({ isOpen: false, symbol: '', news: [] });
  }, []);
  const focusInput = useCallback(() => inputRef.current?.focus(), []);
  const toggleAuth = useCallback(() => setShowAuth((p) => !p), []);
  const handleLogout = useCallback(async () => {
    localStorage.removeItem(`lcta_ai_watchlist_${userId}`);
    await supabase.auth.signOut();
  }, [userId]);

  const vnChangeStyle: CSSProperties = { color: colorFor(vnIndex?.pct), fontWeight: 700, fontSize: 'clamp(11px, 2vw, 13px)', whiteSpace: 'nowrap' };

  if (!sessionChecked) {
    return (
      <main className="ab-page">
        <div className="ab-shell">
          <div style={SYNC_STYLE}>Đang đồng bộ dữ liệu...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="ab-page">
      <div className="ab-shell">
        <AppShellHeader isLoggedIn={isLoggedIn} email={userEmail} currentTab="home"
          onLogout={handleLogout} onAuthOpen={toggleAuth} />

        {/* VN-INDEX */}
        <section className="ab-premium-card">
          <div className="ab-vnindex-compact">
            <div className="ab-vnindex-compact-main">
              <span style={VNINDEX_LABEL_STYLE}>
                <Activity size={11} color="var(--green)" /> VN-INDEX
              </span>
              <div className="num-premium" style={VNINDEX_PRICE_STYLE}>
                {vnIndex ? formatPrice(vnIndex.price) : '--'}
              </div>
              <div className="num-premium" style={vnChangeStyle}>
                {vnIndex ? `${formatIndexChange(vnIndex.change)} (${formatPct(vnIndex.pct)})` : '...'}
              </div>
            </div>
            <VnIndexStat label="Mã tăng" value={loading ? '--' : String(breadth.gainers)} color="var(--green)" />
            <VnIndexStat label="Mã giảm" value={loading ? '--' : String(breadth.losers)} color="var(--red)" />
            <VnIndexStat label="Biến động" value={loading ? '--' : formatPct(breadth.avgPct)} color={colorFor(breadth.avgPct)} />
          </div>
        </section>

        {showAuth && !isLoggedIn && <AuthForm />}

        <div style={MAIN_GRID_STYLE}>
          <section className="ab-premium-card" style={CARD_STYLE}>
            <div className="ab-row-between align-center">
              <div style={SECTION_TITLE_LG_STYLE}>TỔNG QUAN</div>
              <span className="num-premium" style={COUNT_BADGE_STYLE}>
                {watchlist.length} MÃ
              </span>
            </div>
            <AddSymbolRow inputRef={inputRef} value={watchInput} onChange={setWatchInput} onAdd={addSymbol} />
            {watchError && <div className="ab-error">{watchError}</div>}
            {marketError && <div className="ab-error">{marketError}</div>}
            {loading ? (
              <div className="ab-quote-grid" style={QUOTE_GRID_STYLE}>
                {Array.from({ length: 4 }).map((_, i) => <LoadingCard key={i} />)}
              </div>
            ) : watchlist.length === 0 ? (
              <EmptyWatchlist onAdd={focusInput} />
            ) : (
              <div className="ab-quote-grid" style={QUOTE_GRID_STYLE}>
                {quotes.map((item) => (
                  <QuoteCard key={item.symbol} item={item} onRemove={removeSymbol} onNews={handleOpenNews} />
                ))}
              </div>
            )}
          </section>

          <aside style={ASIDE_STYLE}>
            <ErrorBoundary sectionName="AI Scan">
              <section className="ab-premium-card" style={CARD_STYLE}>
                <div className="ab-row-between align-center">
                  <div style={AI_TITLE_STYLE}>
                    <Sparkles size={16} color="var(--yellow)" /> AI SCAN
                  </div>
                  <button type="button" className="ab-btn ab-btn-primary" style={AI_SCAN_BTN_STYLE}
                    onClick={runScan} disabled={aiLoading || !watchlist.length}>
                    {aiLoading ? <RefreshCw size={14} className="spin-animation" /> : 'QUÉT'}
                  </button>
                </div>
                <RiskSelector value={riskProfile} onChange={setRiskProfile} />
                {aiError && <div className="ab-error">{aiError}</div>}
                {aiWatchlist ? (
                  <div style={AI_LIST_STYLE}>
                    <div style={AI_SUMMARY_STYLE}>{aiWatchlist.summary}</div>
                    {aiWatchlist.picks.map((pick) => <AiPickCard key={pick.symbol} pick={pick} />)}
                    {aiWatchlist.avoid.length > 0 && (
                      <div style={AI_AVOID_STYLE}>
                        <span style={AI_AVOID_LABEL_STYLE}>⚠ TRÁNH: </span>
                        {aiWatchlist.avoid.join(' · ')}
                      </div>
                    )}
                  </div>
                ) : (
                  !aiLoading && <EmptyAiScan />
                )}
              </section>
            </ErrorBoundary>

            <section className="ab-premium-card" style={CARD_STYLE}>
              <div style={TOP_TITLE_STYLE}>TĂNG MẠNH NHẤT</div>
              <div style={TOP_LIST_STYLE}>
                {topPositive.length > 0 ? (
                  topPositive.map((item) => <TopMoverRow key={item.symbol} item={item} />)
                ) : (
                  <div style={TOP_EMPTY_STYLE}>Chưa có mã tăng điểm.</div>
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
