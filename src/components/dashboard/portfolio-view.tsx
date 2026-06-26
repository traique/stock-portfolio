'use client';

import { Newspaper, RefreshCw, X } from 'lucide-react';
import { PerformanceChart } from '@/components/dashboard/performance-chart';
import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useCompanyNames } from '@/lib/hooks/use-company-name';
import { calcPosition, formatCurrency, PriceMap, PositionGroup } from '@/lib/calculations';
import {
  AllocationItem, CashSummaryShape, NewsItem, QuoteItem,
} from '@/lib/dashboard-types';

// =========================================================
// TYPES
// =========================================================

export type SectorHeatmapData = {
  label:       string;
  trend1mPct:  number;
  trend3mPct:  number;
  momentum:    'hot' | 'warm' | 'cold' | 'dump';
  vsVnindex1m: number;
};

export type OptPanelData = {
  portfolioVolatility:   number;
  diversificationScore:  number;
  bySymbol: Array<{ symbol: string; currentPct: number; suggestedPct: number; delta: number; volatility: number; level: string }>;
  bySector: Array<{ sector: string; pct: number; level: string }>;
  highCorrelations: Array<{ symbolA: string; symbolB: string; corr: number }>;
};

type Props = {
  loading:         boolean;
  accessToken:     string;
  refreshing:      boolean;
  positions:       PositionGroup[];
  prices:          PriceMap;
  quoteMap:        Map<string, QuoteItem>;
  vnIndex:         QuoteItem | null;
  allocations:     AllocationItem[];
  totalAssets:     number;
  totalPnl:        number;
  totalPnlPct:     number;
  actualNav:       number;
  marketValue:     number;
  unrealizedPnl:   number;
  realizedPnl:     number;
  totalSellOrders: number;
  dayPnl:          number;
  cashSummary:     CashSummaryShape;
  aiNewsContext?:  Record<string, NewsItem[]>;
  closesMap?:      Record<string, number[]>;
  sectorCtx?:      SectorHeatmapData[];
  optResult?:      OptPanelData;
  onRefreshPrices: () => void;
};

// =========================================================
// COLOURS
// =========================================================

const C_MUTED = 'var(--muted)';
const C_TEXT  = 'var(--text)';
const C_GREEN = 'var(--green)';
const C_RED   = 'var(--red)';
const C_AMBER = '#f59e0b';

// =========================================================
// STATIC STYLES
// ✨ Buớc 6: tất cả style KHÔNG phụ thuộc dữ liệu được hoist ra
// module-level → tạo đúng 1 lần thay vì new object mỗi item × mỗi render.
// =========================================================

const CARD: CSSProperties = {
  borderRadius: 24, background: 'var(--card)',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-soft)',
  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
};
const STRONG_CARD: CSSProperties = { ...CARD, border: '1px solid var(--border-strong)' };
const CARD_PAD: CSSProperties = { ...CARD, padding: 16 };
const PILL: CSSProperties = {
  borderRadius: 999, padding: '6px 12px', background: 'var(--soft)',
  border: '1px solid var(--border)', color: C_TEXT,
  fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
};
const PILL_BTN: CSSProperties = { ...PILL, cursor: 'pointer', flexShrink: 0 };
const LABEL: CSSProperties = {
  fontSize: 11, color: C_MUTED, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};
const MINI_CARD: CSSProperties = { ...CARD, padding: 12, borderRadius: 16, boxShadow: 'none' };
const HOLDING_NAME: CSSProperties = {
  fontSize: 11, color: C_MUTED, fontWeight: 600, marginTop: 2,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
};
const SECTION_TITLE: CSSProperties = { fontSize: 18, fontWeight: 800, marginTop: 4 };
const SECTION_TITLE_LG: CSSProperties = { fontSize: 20, fontWeight: 800, marginTop: 4 };

// ── Heatmap momentum palette (Buớc 6: trước đây tạo mới object map mỗi lần gọi) ──
const MOMENTUM_COLORS = {
  hot:  { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.3)',  text: 'var(--green)' },
  warm: { bg: 'rgba(16,185,129,0.07)',  border: 'rgba(16,185,129,0.15)', text: 'var(--green)' },
  cold: { bg: 'rgba(148,163,184,0.08)', border: 'var(--border)',         text: 'var(--muted)' },
  dump: { bg: 'rgba(244,63,94,0.10)',   border: 'rgba(244,63,94,0.25)',  text: 'var(--red)'   },
} as const;
const HEATMAP_LEGEND = [
  ['hot',  '🔥 Hot'],
  ['warm', '🟢 Tốt'],
  ['cold', '🟡 Trung bình'],
  ['dump', '🔴 Yếu'],
] as const;
const HEATMAP_GRID: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 };
const HEATMAP_TILE_BASE: CSSProperties = { padding: '10px 12px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 4 };
const HEATMAP_SUB: CSSProperties = { fontSize: 10, color: C_MUTED };
const HEATMAP_LEGEND_ROW: CSSProperties = { marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' };

// ── Optimization panel ──
const OPT_TABS = [
  ['weight', 'Tỷ trọng'],
  ['sector', 'Ngành'],
  ['corr',   'Tương quan'],
] as const;
const OPT_HEAD_ROW: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 };
const OPT_STAT_BOX: CSSProperties = { textAlign: 'right' };
const OPT_STAT_LABEL: CSSProperties = { fontSize: 10, color: C_MUTED, fontWeight: 700 };
const OPT_TABS_ROW: CSSProperties = { display: 'flex', gap: 4, marginBottom: 14 };
const OPT_TAB_BASE: CSSProperties = { fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 99, cursor: 'pointer', border: '1px solid var(--border)', transition: '0.15s' };
const OPT_LIST: CSSProperties = { display: 'grid', gap: 10 };
const OPT_LIST_SM: CSSProperties = { display: 'grid', gap: 8 };
const WEIGHT_ROW_HEAD: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 };
const WEIGHT_SYM_WRAP: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
const WEIGHT_SYM: CSSProperties = { fontWeight: 800, fontSize: 13 };
const BADGE_DANGER: CSSProperties = { fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: 'var(--red-surface)', color: 'var(--red)', border: '1px solid rgba(244,63,94,0.3)' };
const BADGE_WATCH: CSSProperties = { fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: 'rgba(245,158,11,0.1)', color: C_AMBER, border: '1px solid rgba(245,158,11,0.3)' };
const WEIGHT_RIGHT: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center' };
const WEIGHT_CUR: CSSProperties = { fontSize: 12, color: C_MUTED };
const WEIGHT_TRACK: CSSProperties = { position: 'relative', height: 6, borderRadius: 999, background: 'var(--soft)', overflow: 'hidden' };
const WEIGHT_SUGGEST_LINE: CSSProperties = { position: 'absolute', top: 0, width: 2, height: '100%', background: 'var(--primary)', opacity: 0.6 };
const WEIGHT_META: CSSProperties = { fontSize: 10, color: C_MUTED, marginTop: 3 };
const WEIGHT_HINT: CSSProperties = { fontSize: 11, color: C_MUTED, marginTop: 4, padding: '8px 10px', background: 'var(--soft)', borderRadius: 10 };
const SECTOR_ROW_BASE: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 12 };
const SECTOR_NAME: CSSProperties = { fontSize: 12, fontWeight: 600 };
const SECTOR_RIGHT: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const SECTOR_PCT: CSSProperties = { fontSize: 13, fontWeight: 800 };
const CORR_ROW: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 12, background: 'var(--soft)', border: '1px solid var(--border)' };
const CORR_SYM: CSSProperties = { fontWeight: 700, fontSize: 13 };
const CORR_RIGHT: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const CORR_TRACK: CSSProperties = { width: 60, height: 4, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' };
const CORR_HINT: CSSProperties = { fontSize: 11, color: C_MUTED, marginTop: 2 };
const CORR_EMPTY: CSSProperties = { fontSize: 12, color: C_MUTED, padding: '12px 0' };

// ── Hero ──
const HERO_SECTION: CSSProperties = {
  ...STRONG_CARD, padding: 16, overflow: 'hidden',
  background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(59,130,246,0.04) 35%, rgba(15,23,42,0.02) 100%), var(--card)',
};
const HERO_GRID: CSSProperties = { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))' };
const HERO_LEFT: CSSProperties = { display: 'grid', gap: 10 };
const HERO_VALUE: CSSProperties = { fontSize: 'clamp(32px,6vw,44px)', lineHeight: 1.05, fontWeight: 800, color: C_TEXT, wordBreak: 'break-word' };
const HERO_PILLS: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };
const HERO_METRICS: CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', alignSelf: 'stretch' };
const PILL_INLINE: CSSProperties = { ...PILL, display: 'inline-flex', alignItems: 'center' };
const PNL_PILL_POS: CSSProperties = { ...PILL_INLINE, color: C_GREEN, background: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.20)' };
const PNL_PILL_NEG: CSSProperties = { ...PILL_INLINE, color: C_RED, background: 'rgba(244,63,94,0.10)', borderColor: 'rgba(244,63,94,0.20)' };
const VN_ROW: CSSProperties = { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' };
const VN_RIGHT: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const VN_PRICE: CSSProperties = { fontSize: 20, fontWeight: 800 };

// ===== Hero metric =====
const HM_CARD: CSSProperties = { ...STRONG_CARD, padding: 16, borderRadius: 20, boxShadow: 'none', background: 'var(--soft)' };
const HM_VALUE: CSSProperties = { marginTop: 6, fontSize: 24, lineHeight: 1.15, fontWeight: 800, wordBreak: 'break-word' };
const HM_SUB: CSSProperties = { marginTop: 6, fontSize: 12, color: C_MUTED, fontWeight: 600 };

// ===== Allocation =====
const SEC_HEAD: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' };
const ALLOC_LIST: CSSProperties = { display: 'grid', gap: 14 };
const ALLOC_HEAD: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 };
const ALLOC_SYM: CSSProperties = { fontWeight: 800 };
const ALLOC_META: CSSProperties = { fontSize: 13, fontWeight: 700, color: C_MUTED };
const ALLOC_TRACK: CSSProperties = { width: '100%', height: 8, borderRadius: 999, background: 'var(--soft)', overflow: 'hidden' };
const ALLOC_FILL: CSSProperties = { height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,rgba(37,99,235,0.8),rgba(96,165,250,0.6))' };

// ===== News modal =====
const MODAL_OVERLAY: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const MODAL_CARD: CSSProperties = { width: '100%', maxWidth: 450, maxHeight: '80vh', overflowY: 'auto', padding: 20 };
const MODAL_HEAD: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 };
const MODAL_TITLE: CSSProperties = { fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 };
const MODAL_CLOSE: CSSProperties = { background: 'var(--soft)', border: '1px solid var(--border)', color: C_MUTED, cursor: 'pointer', padding: 6, borderRadius: '50%', display: 'grid', placeItems: 'center' };
const MODAL_LIST: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const MODAL_EMPTY: CSSProperties = { textAlign: 'center', padding: '32px 0', color: C_MUTED, fontSize: 14, lineHeight: 1.6 };

// ===== Holdings =====
const HOLDINGS_GRID: CSSProperties = { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' };
const HOLDING_CARD: CSSProperties = { ...STRONG_CARD, padding: 16, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'none' };
const HC_HEAD: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 };
const HC_SYM: CSSProperties = { fontSize: 28, lineHeight: 1, fontWeight: 800 };
const HC_LOT: CSSProperties = { fontSize: 11, fontWeight: 800, color: C_MUTED, marginTop: 6, letterSpacing: '0.04em' };
const HC_SPARK_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const HC_SPARK_LABEL: CSSProperties = { fontSize: 10, color: C_MUTED };
const HC_PRICE_GRID: CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: '1fr auto', alignItems: 'end' };
const HC_PRICE_NOW: CSSProperties = { fontSize: 28, fontWeight: 800, marginTop: 4, lineHeight: 1.1, wordBreak: 'break-word' };
const HC_CHANGE_BASE: CSSProperties = { fontSize: 13, fontWeight: 800, marginTop: 4 };
const PNL_BOX_BASE: CSSProperties = { borderRadius: 16, padding: '12px 16px', minWidth: 120, textAlign: 'right' };
const PNL_BOX_POS: CSSProperties = { ...PNL_BOX_BASE, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)', color: C_GREEN };
const PNL_BOX_NEG: CSSProperties = { ...PNL_BOX_BASE, background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.20)', color: C_RED };
const PNL_BOX_LABEL: CSSProperties = { fontSize: 10, fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.04em' };
const PNL_BOX_VAL: CSSProperties = { fontSize: 18, fontWeight: 800, marginTop: 2 };
const PNL_BOX_PCT: CSSProperties = { fontSize: 13, fontWeight: 800, marginTop: 2 };
const HC_PILL_ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const HC_MINI_GRID: CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))' };
const HC_MINI_VAL: CSSProperties = { fontSize: 16, fontWeight: 800, marginTop: 4 };
const HC_NEWS_BTN: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, cursor: 'pointer', color: C_TEXT, fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', width: '100%' };
const HC_EXPAND: CSSProperties = { display: 'grid', gap: 8 };
const HC_LOT_DATE: CSSProperties = { fontSize: 13, fontWeight: 800 };
const HC_LOT_META: CSSProperties = { fontSize: 12, color: C_MUTED, marginTop: 4 };
const SPARK_STYLE: CSSProperties = { overflow: 'visible' };

// ===== Performance chart wrapper =====
const PERF_SECTION: CSSProperties = {
  borderRadius: 28, background: 'var(--card)', border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-soft)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', padding: 20,
};
const PERF_KICKER: CSSProperties = { fontSize: 11, color: C_MUTED, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' };
const PERF_TITLE: CSSProperties = { fontSize: 20, fontWeight: 800, marginTop: 4, color: C_TEXT };

// ===== FORMATTERS =====

const vnFmt   = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('vi-VN');

const fmtPrice  = (v?: number | null) => v == null || !Number.isFinite(v) ? 'N/A' : vnFmt.format(v);
const fmtChange = (v?: number | null) => v == null || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : ''}${vnFmt.format(v)}`;
const fmtPct    = (v?: number | null) => v == null || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const colorFor  = (v?: number | null): string =>
  !Number.isFinite(v as number) ? C_MUTED
  : (v as number) > 0 ? C_GREEN
  : (v as number) < 0 ? C_RED
  : C_MUTED;
const fmtDate = (v?: string | null) => !v ? '—' : dateFmt.format(new Date(v));

// ===== HERO METRIC =====

const HeroMetric = memo(function HeroMetric({ label, value, sub, positive }: {
  label: string; value: string; sub?: string; positive?: boolean | null;
}) {
  const color = positive == null ? C_TEXT : positive ? C_GREEN : C_RED;
  return (
    <div style={HM_CARD}>
      <div style={LABEL}>{label}</div>
      <div className="num-premium" style={ { ...HM_VALUE, color } }>
        {value}
      </div>
      {sub && <div style={HM_SUB}>{sub}</div>}
    </div>
  );
});

// ===== NEWS MODAL =====

const NewsModal = memo(function NewsModal({ symbol, news, onClose }: {
  symbol: string; news: NewsItem[]; onClose: () => void;
}) {
  return (
    <div style={MODAL_OVERLAY} onClick={onClose}>
      <div className="ab-premium-card" style={MODAL_CARD} onClick={e => e.stopPropagation()}>
        <div style={MODAL_HEAD}>
          <div style={MODAL_TITLE}>
            <Newspaper size={20} color="var(--primary)" />
            TIN TỨC: {symbol}
          </div>
          <button onClick={onClose} aria-label="Đóng" style={MODAL_CLOSE}>
            <X size={16} />
          </button>
        </div>

        {news.length > 0 ? (
          <div style={MODAL_LIST}>
            {news.map((n, i) => (
              <a
                key={i}
                href={n.url ?? 'https://www.google.com/search?q=' + encodeURIComponent(n.title)}
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
          <div style={MODAL_EMPTY}>
            Chưa có tin tức.<br />
            Bấm <strong>PHÂN TÍCH DANH MỤC</strong> trong phần AI để cập nhật.
          </div>
        )}
      </div>
    </div>
  );
});

// ===== SKELETON =====

const SkeletonCard = memo(function SkeletonCard() {
  return (
    <div style={ { borderRadius: 20, padding: 16, background: 'var(--card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 } }>
      <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }>
        <div style={ { display: 'flex', flexDirection: 'column', gap: 8 } }>
          <div className="ab-skeleton" style={ { width: 72, height: 28, borderRadius: 6 } } />
          <div className="ab-skeleton" style={ { width: 100, height: 12, borderRadius: 4 } } />
        </div>
        <div className="ab-skeleton" style={ { width: 72, height: 30, borderRadius: 999 } } />
      </div>
      <div style={ { display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' } }>
        <div style={ { display: 'flex', flexDirection: 'column', gap: 6 } }>
          <div className="ab-skeleton" style={ { width: 48, height: 12, borderRadius: 4 } } />
          <div className="ab-skeleton" style={ { width: 120, height: 28, borderRadius: 6 } } />
          <div className="ab-skeleton" style={ { width: 80, height: 13, borderRadius: 4 } } />
        </div>
        <div className="ab-skeleton" style={ { width: 120, height: 72, borderRadius: 16 } } />
      </div>
      <div style={ { display: 'flex', gap: 8 } }>
        <div className="ab-skeleton" style={ { width: 60, height: 26, borderRadius: 999 } } />
        <div className="ab-skeleton" style={ { width: 100, height: 26, borderRadius: 999 } } />
      </div>
      <div style={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } }>
        <div className="ab-skeleton" style={ { height: 52, borderRadius: 12 } } />
        <div className="ab-skeleton" style={ { height: 52, borderRadius: 12 } } />
      </div>
      <div className="ab-skeleton" style={ { height: 40, borderRadius: 14 } } />
    </div>
  );
});

// ===== SPARKLINE =====

const Sparkline = memo(function Sparkline({ closes, width = 80, height = 28 }: { closes: number[]; width?: number; height?: number }) {
  if (!closes || closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const step  = width / (closes.length - 1);
  const pts   = closes.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ');
  const last  = closes.at(-1)!;
  const first = closes[0];
  const color = last >= first ? 'var(--green)' : 'var(--red)';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={SPARK_STYLE}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});

// ===== SECTOR HEATMAP =====

const SectorHeatmap = memo(function SectorHeatmap({ sectors }: { sectors: SectorHeatmapData[] }) {
  // ✨ Bước 6 + an toàn: copy trước khi sort (tránh mutate prop), bọc useMemo.
  const sorted = useMemo(
    () => [...sectors].sort((a, b) => b.trend1mPct - a.trend1mPct),
    [sectors],
  );
  if (!sectors || sectors.length === 0) return null;

  return (
    <section style={CARD_PAD}>
      <div style={ { marginBottom: 14 } }>
        <div style={LABEL}>Phân tích ngành</div>
        <div style={ { fontSize: 18, fontWeight: 800, marginTop: 4 } }>SECTOR HEATMAP</div>
      </div>
      <div style={HEATMAP_GRID}>
        {sorted.map(s => {
          const c = MOMENTUM_COLORS[s.momentum];
          const vsStr = s.vsVnindex1m >= 0 ? `+${s.vsVnindex1m.toFixed(1)}%` : `${s.vsVnindex1m.toFixed(1)}%`;
          return (
            <div key={s.label} style={ { ...HEATMAP_TILE_BASE, background: c.bg, border: `1px solid ${c.border}` } }>
              <div style={ { fontSize: 11, fontWeight: 800, color: c.text, letterSpacing: '0.02em', lineHeight: 1.2 } }>
                {s.label}
              </div>
              <div className="num-premium" style={ { fontSize: 16, fontWeight: 800, color: c.text } }>
                {s.trend1mPct >= 0 ? '+' : ''}{s.trend1mPct.toFixed(1)}%
              </div>
              <div style={HEATMAP_SUB}>
                vs VNI: {vsStr} · 3M: {s.trend3mPct >= 0 ? '+' : ''}{s.trend3mPct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
      <div style={HEATMAP_LEGEND_ROW}>
        {HEATMAP_LEGEND.map(([m, l]) => (
          <span key={m} style={HEATMAP_SUB}>{l}</span>
        ))}
      </div>
    </section>
  );
});

// ===== PORTFOLIO OPTIMIZATION PANEL =====

const OptimizationPanel = memo(function OptimizationPanel({ data }: { data: OptPanelData }) {
  const [tab, setTab] = useState<'weight' | 'sector' | 'corr'>('weight');
  const divScore = data.diversificationScore;
  const divColor = divScore >= 70 ? C_GREEN : divScore >= 40 ? C_AMBER : C_RED;

  return (
    <section style={CARD_PAD}>
      <div style={OPT_HEAD_ROW}>
        <div>
          <div style={LABEL}>Tối ưu danh mục</div>
          <div style={SECTION_TITLE}>PORTFOLIO OPTIMIZATION</div>
        </div>
        <div style={ { display: 'flex', gap: 12, alignItems: 'center' } }>
          <div style={OPT_STAT_BOX}>
            <div style={OPT_STAT_LABEL}>ĐA DẠNG HÓA</div>
            <div className="num-premium" style={ { fontSize: 20, fontWeight: 800, color: divColor } }>{divScore}<span style={ { fontSize: 11 } }>/100</span></div>
          </div>
          <div style={OPT_STAT_BOX}>
            <div style={OPT_STAT_LABEL}>VOL/NĂM</div>
            <div className="num-premium" style={ { fontSize: 20, fontWeight: 800 } }>{data.portfolioVolatility}%</div>
          </div>
        </div>
      </div>

      <div style={OPT_TABS_ROW}>
        {OPT_TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={ {
            ...OPT_TAB_BASE,
            background: tab === k ? 'var(--primary)' : 'var(--soft)',
            color:      tab === k ? 'var(--card)'    : 'var(--muted)',
          } }>{l}</button>
        ))}
      </div>

      {tab === 'weight' && (
        <div style={OPT_LIST}>
          {data.bySymbol.map(s => {
            const danger = s.level === 'danger';
            const watch  = s.level === 'watch';
            const barColor = danger ? 'var(--red)' : watch ? C_AMBER : 'rgba(37,99,235,0.7)';
            const arrowColor = s.delta > 3 ? C_GREEN : s.delta < -3 ? C_RED : C_MUTED;
            return (
              <div key={s.symbol}>
                <div style={WEIGHT_ROW_HEAD}>
                  <div style={WEIGHT_SYM_WRAP}>
                    <span style={WEIGHT_SYM}>{s.symbol}</span>
                    {danger && <span style={BADGE_DANGER}>TẬP TRUNG CAO</span>}
                    {watch  && <span style={BADGE_WATCH}>CẨN THẬN</span>}
                  </div>
                  <div style={WEIGHT_RIGHT}>
                    <span className="num-premium" style={WEIGHT_CUR}>{s.currentPct}%</span>
                    <span style={ { fontSize: 11, color: arrowColor, fontWeight: 700 } }>
                      {s.delta > 3 ? `↑ ${s.suggestedPct}%` : s.delta < -3 ? `↓ ${s.suggestedPct}%` : '✓'}
                    </span>
                  </div>
                </div>
                <div style={WEIGHT_TRACK}>
                  <div style={ { width: `${Math.min(s.currentPct * 3, 100)}%`, height: '100%', borderRadius: 999, background: barColor, transition: 'width .4s' } } />
                  <div style={ { ...WEIGHT_SUGGEST_LINE, left: `${Math.min(s.suggestedPct * 3, 100)}%` } } />
                </div>
                <div style={WEIGHT_META}>
                  Vol: {s.volatility}%/năm · Risk Parity: {s.suggestedPct}%
                </div>
              </div>
            );
          })}
          <div style={WEIGHT_HINT}>
            💡 Vạch <span style={ { color: 'var(--primary)', fontWeight: 700 } }>xanh</span> = tỷ trọng Risk Parity đề xuất (mã ít biến động → weight cao hơn)
          </div>
        </div>
      )}

      {tab === 'sector' && (
        <div style={OPT_LIST_SM}>
          {data.bySector.map(s => {
            const danger = s.level === 'danger';
            const watch  = s.level === 'watch';
            return (
              <div key={s.sector} style={ {
                ...SECTOR_ROW_BASE,
                background: danger ? 'rgba(244,63,94,0.07)' : watch ? 'rgba(245,158,11,0.07)' : 'var(--soft)',
                border: `1px solid ${danger ? 'rgba(244,63,94,0.2)' : watch ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`,
              } }>
                <span style={SECTOR_NAME}>{s.sector}</span>
                <div style={SECTOR_RIGHT}>
                  <span className="num-premium" style={SECTOR_PCT}>{s.pct}%</span>
                  {danger && <span style={ { fontSize: 9, fontWeight: 800, color: 'var(--red)' } }>⚠ VƯỢT 30%</span>}
                  {watch  && <span style={ { fontSize: 9, fontWeight: 800, color: C_AMBER } }>⚠ &gt;20%</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'corr' && (
        <div style={OPT_LIST_SM}>
          {data.highCorrelations.length === 0 ? (
            <div style={CORR_EMPTY}>✅ Không có cặp tương quan cao — danh mục đa dạng tốt</div>
          ) : data.highCorrelations.map(c => {
            const absCorr = Math.abs(c.corr);
            const color   = absCorr > 0.8 ? 'var(--red)' : C_AMBER;
            return (
              <div key={`${c.symbolA}-${c.symbolB}`} style={CORR_ROW}>
                <span style={CORR_SYM}>{c.symbolA} ↔ {c.symbolB}</span>
                <div style={CORR_RIGHT}>
                  <div style={CORR_TRACK}>
                    <div style={ { width: `${absCorr * 100}%`, height: '100%', background: color, borderRadius: 999 } } />
                  </div>
                  <span className="num-premium" style={ { fontSize: 12, fontWeight: 800, color } }>{c.corr.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
          <div style={CORR_HINT}>
            Tương quan &gt;0.7: rủi ro cùng chiều cao — nên giảm tập trung vào 1 ngành
          </div>
        </div>
      )}
    </section>
  );
});

// ===== HOLDING CARD (memo) =====

// ✨ Bước 6 + #3: mỗi thẻ là 1 component memo riêng → bấm "XEM LỆNH"
// hay đổi state 1 thẻ KHÔNG còn re-render toàn bộ danh sách như trước.
const HoldingCard = memo(function HoldingCard({
  pos, prices, quote, companyName, closes, expanded, onToggle, onNews,
}: {
  pos: PositionGroup;
  prices: PriceMap;
  quote?: QuoteItem;
  companyName?: string;
  closes?: number[];
  expanded: boolean;
  onToggle: (sym: string) => void;
  onNews: (sym: string) => void;
}) {
  const row      = calcPosition(pos, prices);
  const positive = row.pnl >= 0;

  return (
    <article style={HOLDING_CARD}>
      <div style={HC_HEAD}>
        <div style={ { minWidth: 0 } }>
          <div style={HC_SYM}>{pos.symbol}</div>
          {companyName && <div style={HOLDING_NAME}>{companyName}</div>}
          <div className="num-premium" style={HC_LOT}>
            {pos.holdings.length} LOT · SL {pos.quantity}
          </div>
        </div>
        <button type="button" onClick={() => onToggle(pos.symbol)} style={PILL_BTN}>
          {expanded ? 'ẨN LỆNH' : 'XEM LỆNH'}
        </button>
      </div>

      {closes && closes.length > 5 && (
        <div style={HC_SPARK_ROW}>
          <Sparkline closes={closes} width={90} height={28} />
          <span style={HC_SPARK_LABEL}>3 tháng</span>
        </div>
      )}

      <div style={HC_PRICE_GRID}>
        <div style={ { minWidth: 0 } }>
          <div style={LABEL}>Giá hiện tại</div>
          <div className="num-premium" style={HC_PRICE_NOW}>
            {fmtPrice(quote?.price ?? row.now)}
          </div>
          <div className="num-premium" style={ { ...HC_CHANGE_BASE, color: colorFor(quote?.change) } }>
            {fmtChange(quote?.change)} · {fmtPct(quote?.pct)}
          </div>
        </div>
        <div style={positive ? PNL_BOX_POS : PNL_BOX_NEG}>
          <div style={PNL_BOX_LABEL}>PnL</div>
          <div className="num-premium" style={PNL_BOX_VAL}>{formatCurrency(row.pnl)}</div>
          <div className="num-premium" style={PNL_BOX_PCT}>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%</div>
        </div>
      </div>

      <div style={HC_PILL_ROW}>
        <div className="num-premium" style={PILL}>SL {pos.quantity}</div>
        <div className="num-premium" style={PILL}>VỐN TB {formatCurrency(pos.avgBuyPrice)}</div>
      </div>

      <div style={HC_MINI_GRID}>
        {[{ l: 'Tổng mua', v: row.cost }, { l: 'Hiện tại', v: row.value }].map(cell => (
          <div key={cell.l} style={MINI_CARD}>
            <div style={LABEL}>{cell.l}</div>
            <div className="num-premium" style={HC_MINI_VAL}>{formatCurrency(cell.v)}</div>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => onNews(pos.symbol)} style={HC_NEWS_BTN}>
        <Newspaper size={16} color="var(--primary)" /> ĐỌC TIN TỨC
      </button>

      {expanded && (
        <div style={HC_EXPAND}>
          {pos.holdings.map((h: any) => {
            const isStockDiv = Number(h.buy_price) === 0;
            return (
              <div key={h.id} style={MINI_CARD}>
                <div className="num-premium" style={HC_LOT_DATE}>{fmtDate(h.buy_date)} · SL {h.quantity}</div>
                <div className="num-premium" style={HC_LOT_META}>
                  {isStockDiv ? '🎁 Cổ tức cổ phiếu (giá vốn 0)' : `GIÁ MUA ${formatCurrency(Number(h.buy_price))}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
});

// ===== MAIN EXPORT =====

export const PortfolioView = memo(function PortfolioView({
  loading, refreshing, positions, prices, quoteMap, vnIndex,
  allocations, totalAssets, totalPnl, totalPnlPct,
  actualNav, marketValue, unrealizedPnl, realizedPnl, totalSellOrders,
  dayPnl, cashSummary, aiNewsContext, accessToken, onRefreshPrices,
  closesMap, sectorCtx, optResult,
}: Props) {

  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});
  const [newsModal, setNewsModal] = useState<{ symbol: string; news: NewsItem[] } | null>(null);

  // ✨ Bước 6: ổn định mảng symbols để hook không nhận array mới mỗi render.
  const symbols = useMemo(() => positions.map(pos => pos.symbol), [positions]);
  const companyNames = useCompanyNames(symbols);

  const toggleSymbol = useCallback((sym: string) =>
    setExpandedSymbols(p => ({ ...p, [sym]: !p[sym] })), []);
  const openNews = useCallback((sym: string) =>
    setNewsModal({ symbol: sym, news: aiNewsContext?.[sym] ?? [] }), [aiNewsContext]);
  const closeNews = useCallback(() => setNewsModal(null), []);

  const val    = (v: number) => loading ? '...' : formatCurrency(v);
  const pnlPos = totalPnl >= 0;

  return (
    <>
      {/* OVERVIEW HERO */}
      <section style={HERO_SECTION}>
        <div style={HERO_GRID}>
          <div style={HERO_LEFT}>
            <div style={LABEL}>TỔNG TÀI SẢN</div>
            <div className="num-premium" style={HERO_VALUE}>{val(totalAssets)}</div>
            <div style={HERO_PILLS}>
              <span className="num-premium" style={pnlPos ? PNL_PILL_POS : PNL_PILL_NEG}>
                PnL {val(totalPnl)}
              </span>
              <span className="num-premium" style={ { ...PILL_INLINE, color: colorFor(totalPnlPct) } }>
                {loading ? '...' : fmtPct(totalPnlPct)}
              </span>
              <span className="num-premium" style={ { ...PILL_INLINE, color: colorFor(dayPnl) } }>
                Hôm nay {val(dayPnl)}
              </span>
            </div>
          </div>

          <div style={HERO_METRICS}>
            <HeroMetric label="NAV THỰC TẾ"        value={val(actualNav)}     sub="Tiền mặt hiện có" />
            <HeroMetric label="GIÁ TRỊ THỊ TRƯỜNG" value={val(marketValue)}   sub={`${positions.length} mã đang nắm`} />
            <HeroMetric label="LÃI/LỖ ĐÃ CHỐT"    value={val(realizedPnl)}   sub={`${totalSellOrders} lệnh bán`} positive={realizedPnl >= 0} />
            <HeroMetric label="LÃI/LỖ ĐANG MỞ"    value={val(unrealizedPnl)} sub="Vị thế hiện tại"  positive={unrealizedPnl >= 0} />
            <HeroMetric label="CỔ TỨC ĐÃ NHẬN"    value={val(cashSummary.dividends ?? 0)} sub="Cổ tức tiền mặt" positive={(cashSummary.dividends ?? 0) > 0 ? true : null} />
          </div>
        </div>

        {vnIndex && (
          <div style={VN_ROW}>
            <div style={LABEL}>VN-INDEX</div>
            <div style={VN_RIGHT}>
              <span className="num-premium" style={VN_PRICE}>{fmtPrice(vnIndex.price)}</span>
              <span className="num-premium" style={ { ...PILL, color: colorFor(vnIndex.change) } }>
                {fmtChange(vnIndex.change)} · {fmtPct(vnIndex.pct)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ALLOCATION */}
      {allocations.length > 0 && (
        <section style={CARD_PAD}>
          <div style={SEC_HEAD}>
            <div>
              <div style={LABEL}>Cơ cấu danh mục</div>
              <div style={SECTION_TITLE}>TỶ TRỌNG VỊ THẾ</div>
            </div>
            <span className="num-premium" style={PILL}>{positions.length} MÃ</span>
          </div>
          <div style={ALLOC_LIST}>
            {allocations.map(item => (
              <div key={item.symbol}>
                <div style={ALLOC_HEAD}>
                  <div style={ALLOC_SYM}>{item.symbol}</div>
                  <div className="num-premium" style={ALLOC_META}>
                    {formatCurrency(item.totalNow)} · {item.percent.toFixed(1)}%
                  </div>
                </div>
                <div style={ALLOC_TRACK}>
                  <div style={ { ...ALLOC_FILL, width: `${Math.max(item.percent, 2)}%` } } />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ✨ PORTFOLIO OPTIMIZATION */}
      {optResult && <OptimizationPanel data={optResult} />}

      {/* ✨ SECTOR HEATMAP */}
      {sectorCtx && sectorCtx.length > 0 && <SectorHeatmap sectors={sectorCtx} />}

      {/* HOLDINGS */}
      <section style={CARD_PAD}>
        <div style={ { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 } }>
          <div>
            <div style={LABEL}>Danh mục hiện tại</div>
            <div style={SECTION_TITLE_LG}>HOLDINGS</div>
          </div>
          <div style={ { display: 'flex', gap: 8, flexWrap: 'wrap' } }>
            <span className="num-premium" style={PILL}>{positions.length} MÃ</span>
            <button type="button" style={ { ...PILL, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } } onClick={onRefreshPrices} disabled={refreshing}>
              <RefreshCw size={12} className={refreshing ? 'spin-animation' : ''} />
              LÀM MỚI GIÁ
            </button>
          </div>
        </div>

        {loading ? (
          <div style={HOLDINGS_GRID}>
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : positions.length > 0 ? (
          <div style={HOLDINGS_GRID}>
            {positions.map(pos => (
              <HoldingCard
                key={pos.symbol}
                pos={pos}
                prices={prices}
                quote={quoteMap.get(pos.symbol.toUpperCase())}
                companyName={companyNames[pos.symbol]}
                closes={closesMap?.[pos.symbol]}
                expanded={!!expandedSymbols[pos.symbol]}
                onToggle={toggleSymbol}
                onNews={openNews}
              />
            ))}
          </div>
        ) : (
          <div style={ { color: C_MUTED, fontSize: 14 } }>
            {'Chưa có vị thế đang nắm giữ'}
          </div>
        )}
      </section>

      {/* PERFORMANCE CHART */}
      {accessToken && (
        <section style={PERF_SECTION}>
          <div style={ { marginBottom: 20 } }>
            <div style={PERF_KICKER}>Lịch sử</div>
            <div style={PERF_TITLE}>HIỆU SUẤT DANH MỤC</div>
          </div>
          <PerformanceChart accessToken={accessToken} />
        </section>
      )}

      {newsModal && (
        <NewsModal symbol={newsModal.symbol} news={newsModal.news} onClose={closeNews} />
      )}
    </>
  );
});
