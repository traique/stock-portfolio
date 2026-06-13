'use client';

import { Newspaper, RefreshCw, X } from 'lucide-react';
import { PerformanceChart } from '@/components/dashboard/performance-chart';
import { useCallback, useState } from 'react';
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
  // ✨ new fields
  closesMap?:      Record<string, number[]>;  // sparkline data per symbol
  sectorCtx?:      SectorHeatmapData[];       // sector performance
  optResult?:      OptPanelData;              // portfolio optimization
  onRefreshPrices: () => void;
};

// =========================================================
// COLOURS & STYLES
// =========================================================

const C_MUTED = 'var(--muted)';
const C_TEXT  = 'var(--text)';
const C_GREEN = 'var(--green)';
const C_RED   = 'var(--red)';

const CARD: React.CSSProperties = {
  borderRadius: 24, background: 'var(--card)',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-soft)',
  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
};
const STRONG_CARD: React.CSSProperties = { ...CARD, border: '1px solid var(--border-strong)' };
const PILL: React.CSSProperties = {
  borderRadius: 999, padding: '6px 12px', background: 'var(--soft)',
  border: '1px solid var(--border)', color: C_TEXT,
  fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
};
const LABEL: React.CSSProperties = {
  fontSize: 11, color: C_MUTED, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};
const MINI_CARD: React.CSSProperties = { ...CARD, padding: 12, borderRadius: 16, boxShadow: 'none' };
const HOLDING_NAME: React.CSSProperties = {
  fontSize: 11,
  color: C_MUTED,
  fontWeight: 600,
  marginTop: 2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 220,
};

// =========================================================
// FORMATTERS
// =========================================================

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

// =========================================================
// HERO METRIC
// =========================================================

function HeroMetric({ label, value, sub, positive }: {
  label: string; value: string; sub?: string; positive?: boolean | null;
}) {
  const color = positive == null ? C_TEXT : positive ? C_GREEN : C_RED;
  return (
    <div style={ { ...STRONG_CARD, padding: 16, borderRadius: 20, boxShadow: 'none', background: 'var(--soft)' } }>
      <div style={LABEL}>{label}</div>
      <div className="num-premium" style={ { marginTop: 6, fontSize: 24, lineHeight: 1.15, fontWeight: 800, color, wordBreak: 'break-word' } }>
        {value}
      </div>
      {sub && <div style={ { marginTop: 6, fontSize: 12, color: C_MUTED, fontWeight: 600 } }>{sub}</div>}
    </div>
  );
}

// =========================================================
// NEWS MODAL
// =========================================================

function NewsModal({ symbol, news, onClose }: {
  symbol: string; news: NewsItem[]; onClose: () => void;
}) {
  return (
    <div
      style={ { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } }
      onClick={onClose}
    >
      <div
        className="ab-premium-card"
        style={ { width: '100%', maxWidth: 450, maxHeight: '80vh', overflowY: 'auto', padding: 20 } }
        onClick={e => e.stopPropagation()}
      >
        <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } }>
          <div style={ { fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 } }>
            <Newspaper size={20} color="var(--primary)" />
            TIN TỨC: {symbol}
          </div>
          <button onClick={onClose} aria-label="Đóng" style={ { background: 'var(--soft)', border: '1px solid var(--border)', color: C_MUTED, cursor: 'pointer', padding: 6, borderRadius: '50%', display: 'grid', placeItems: 'center' } }>
            <X size={16} />
          </button>
        </div>

        {news.length > 0 ? (
          <div style={ { display: 'flex', flexDirection: 'column', gap: 12 } }>
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
          <div style={ { textAlign: 'center', padding: '32px 0', color: C_MUTED, fontSize: 14, lineHeight: 1.6 } }>
            Chưa có tin tức.<br />
            Bấm <strong>PHÂN TÍCH DANH MỤC</strong> trong phần AI để cập nhật.
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================
// SKELETON
// =========================================================

function SkeletonCard() {
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
}

// =========================================================
// ✨ SPARKLINE — mini chart từ closes[]
// =========================================================

function Sparkline({ closes, width = 80, height = 28 }: { closes: number[]; width?: number; height?: number }) {
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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={ { overflow: 'visible' } }>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// =========================================================
// ✨ SECTOR HEATMAP
// =========================================================

function SectorHeatmap({ sectors }: { sectors: SectorHeatmapData[] }) {
  if (!sectors || sectors.length === 0) return null;
  const momentumColor = (m: SectorHeatmapData['momentum']) => ({
    hot:  { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.3)',  text: 'var(--green)' },
    warm: { bg: 'rgba(16,185,129,0.07)',  border: 'rgba(16,185,129,0.15)', text: 'var(--green)' },
    cold: { bg: 'rgba(148,163,184,0.08)', border: 'var(--border)',         text: 'var(--muted)' },
    dump: { bg: 'rgba(244,63,94,0.10)',   border: 'rgba(244,63,94,0.25)',  text: 'var(--red)'   },
  })[m];

  return (
    <section style={ { ...CARD, padding: 16 } }>
      <div style={ { marginBottom: 14 } }>
        <div style={LABEL}>Phân tích ngành</div>
        <div style={ { fontSize: 18, fontWeight: 800, marginTop: 4 } }>SECTOR HEATMAP</div>
      </div>
      <div style={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 } }>
        {sectors.sort((a, b) => b.trend1mPct - a.trend1mPct).map(s => {
          const c = momentumColor(s.momentum);
          const vsStr = s.vsVnindex1m >= 0 ? `+${s.vsVnindex1m.toFixed(1)}%` : `${s.vsVnindex1m.toFixed(1)}%`;
          return (
            <div key={s.label} style={ {
              padding: '10px 12px', borderRadius: 14,
              background: c.bg, border: `1px solid ${c.border}`,
              display: 'flex', flexDirection: 'column', gap: 4,
            } }>
              <div style={ { fontSize: 11, fontWeight: 800, color: c.text, letterSpacing: '0.02em', lineHeight: 1.2 } }>
                {s.label}
              </div>
              <div className="num-premium" style={ { fontSize: 16, fontWeight: 800, color: c.text } }>
                {s.trend1mPct >= 0 ? '+' : ''}{s.trend1mPct.toFixed(1)}%
              </div>
              <div style={ { fontSize: 10, color: 'var(--muted)' } }>
                vs VNI: {vsStr} · 3M: {s.trend3mPct >= 0 ? '+' : ''}{s.trend3mPct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
      <div style={ { marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' } }>
        {([['hot','🔥 Hot'],['warm','🟢 Tốt'],['cold','🟡 Trung bình'],['dump','🔴 Yếu']] as const).map(([m, l]) => (
          <span key={m} style={ { fontSize: 10, color: 'var(--muted)' } }>{l}</span>
        ))}
      </div>
    </section>
  );
}

// =========================================================
// ✨ PORTFOLIO OPTIMIZATION PANEL
// =========================================================

function OptimizationPanel({ data }: { data: OptPanelData }) {
  const [tab, setTab] = useState<'weight' | 'sector' | 'corr'>('weight');
  const divScore = data.diversificationScore;
  const divColor = divScore >= 70 ? 'var(--green)' : divScore >= 40 ? '#f59e0b' : 'var(--red)';

  return (
    <section style={ { ...CARD, padding: 16 } }>
      <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 } }>
        <div>
          <div style={LABEL}>Tối ưu danh mục</div>
          <div style={ { fontSize: 18, fontWeight: 800, marginTop: 4 } }>PORTFOLIO OPTIMIZATION</div>
        </div>
        <div style={ { display: 'flex', gap: 12, alignItems: 'center' } }>
          <div style={ { textAlign: 'right' } }>
            <div style={ { fontSize: 10, color: 'var(--muted)', fontWeight: 700 } }>ĐA DẠNG HÓA</div>
            <div className="num-premium" style={ { fontSize: 20, fontWeight: 800, color: divColor } }>{divScore}<span style={ { fontSize: 11 } }>/100</span></div>
          </div>
          <div style={ { textAlign: 'right' } }>
            <div style={ { fontSize: 10, color: 'var(--muted)', fontWeight: 700 } }>VOL/NĂM</div>
            <div className="num-premium" style={ { fontSize: 20, fontWeight: 800 } }>{data.portfolioVolatility}%</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={ { display: 'flex', gap: 4, marginBottom: 14 } }>
        {([['weight','Tỷ trọng'],['sector','Ngành'],['corr','Tương quan']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={ {
            fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 99, cursor: 'pointer',
            background: tab === k ? 'var(--primary)' : 'var(--soft)',
            color:      tab === k ? 'var(--card)'    : 'var(--muted)',
            border:     '1px solid var(--border)', transition: '0.15s',
          } }>{l}</button>
        ))}
      </div>

      {/* Weight tab */}
      {tab === 'weight' && (
        <div style={ { display: 'grid', gap: 10 } }>
          {data.bySymbol.map(s => {
            const danger = s.level === 'danger';
            const watch  = s.level === 'watch';
            const barColor = danger ? 'var(--red)' : watch ? '#f59e0b' : 'rgba(37,99,235,0.7)';
            const arrowColor = s.delta > 3 ? 'var(--green)' : s.delta < -3 ? 'var(--red)' : 'var(--muted)';
            return (
              <div key={s.symbol}>
                <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 } }>
                  <div style={ { display: 'flex', alignItems: 'center', gap: 6 } }>
                    <span style={ { fontWeight: 800, fontSize: 13 } }>{s.symbol}</span>
                    {danger && <span style={ { fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: 'var(--red-surface)', color: 'var(--red)', border: '1px solid rgba(244,63,94,0.3)' } }>TẬP TRUNG CAO</span>}
                    {watch  && <span style={ { fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 99, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' } }>CẨN THẬN</span>}
                  </div>
                  <div style={ { display: 'flex', gap: 6, alignItems: 'center' } }>
                    <span className="num-premium" style={ { fontSize: 12, color: 'var(--muted)' } }>{s.currentPct}%</span>
                    <span style={ { fontSize: 11, color: arrowColor, fontWeight: 700 } }>
                      {s.delta > 3 ? `↑ ${s.suggestedPct}%` : s.delta < -3 ? `↓ ${s.suggestedPct}%` : '✓'}
                    </span>
                  </div>
                </div>
                <div style={ { position: 'relative', height: 6, borderRadius: 999, background: 'var(--soft)', overflow: 'hidden' } }>
                  <div style={ { width: `${Math.min(s.currentPct * 3, 100)}%`, height: '100%', borderRadius: 999, background: barColor, transition: 'width .4s' } } />
                  {/* Risk parity suggested line */}
                  <div style={ { position: 'absolute', top: 0, left: `${Math.min(s.suggestedPct * 3, 100)}%`, width: 2, height: '100%', background: 'var(--primary)', opacity: 0.6 } } />
                </div>
                <div style={ { fontSize: 10, color: 'var(--muted)', marginTop: 3 } }>
                  Vol: {s.volatility}%/năm · Risk Parity: {s.suggestedPct}%
                </div>
              </div>
            );
          })}
          <div style={ { fontSize: 11, color: 'var(--muted)', marginTop: 4, padding: '8px 10px', background: 'var(--soft)', borderRadius: 10 } }>
            💡 Vạch <span style={ { color: 'var(--primary)', fontWeight: 700 } }>xanh</span> = tỷ trọng Risk Parity đề xuất (mã ít biến động → weight cao hơn)
          </div>
        </div>
      )}

      {/* Sector tab */}
      {tab === 'sector' && (
        <div style={ { display: 'grid', gap: 8 } }>
          {data.bySector.map(s => {
            const danger = s.level === 'danger';
            const watch  = s.level === 'watch';
            return (
              <div key={s.sector} style={ {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 12,
                background: danger ? 'rgba(244,63,94,0.07)' : watch ? 'rgba(245,158,11,0.07)' : 'var(--soft)',
                border: `1px solid ${danger ? 'rgba(244,63,94,0.2)' : watch ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`,
              } }>
                <span style={ { fontSize: 12, fontWeight: 600 } }>{s.sector}</span>
                <div style={ { display: 'flex', gap: 8, alignItems: 'center' } }>
                  <span className="num-premium" style={ { fontSize: 13, fontWeight: 800 } }>{s.pct}%</span>
                  {danger && <span style={ { fontSize: 9, fontWeight: 800, color: 'var(--red)' } }>⚠ VƯỢT 30%</span>}
                  {watch  && <span style={ { fontSize: 9, fontWeight: 800, color: '#f59e0b' } }>⚠ &gt;20%</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Correlation tab */}
      {tab === 'corr' && (
        <div style={ { display: 'grid', gap: 8 } }>
          {data.highCorrelations.length === 0 ? (
            <div style={ { fontSize: 12, color: 'var(--muted)', padding: '12px 0' } }>✅ Không có cặp tương quan cao — danh mục đa dạng tốt</div>
          ) : data.highCorrelations.map(c => {
            const absCorr = Math.abs(c.corr);
            const color   = absCorr > 0.8 ? 'var(--red)' : '#f59e0b';
            return (
              <div key={`${c.symbolA}-${c.symbolB}`} style={ {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 12, background: 'var(--soft)', border: '1px solid var(--border)',
              } }>
                <span style={ { fontWeight: 700, fontSize: 13 } }>{c.symbolA} ↔ {c.symbolB}</span>
                <div style={ { display: 'flex', gap: 8, alignItems: 'center' } }>
                  <div style={ { width: 60, height: 4, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' } }>
                    <div style={ { width: `${absCorr * 100}%`, height: '100%', background: color, borderRadius: 999 } } />
                  </div>
                  <span className="num-premium" style={ { fontSize: 12, fontWeight: 800, color } }>{c.corr.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
          <div style={ { fontSize: 11, color: 'var(--muted)', marginTop: 2 } }>
            Tương quan &gt;0.7: rủi ro cùng chiều cao — nên giảm tập trung vào 1 ngành
          </div>
        </div>
      )}
    </section>
  );
}

// =========================================================
// MAIN EXPORT
// =========================================================

export function PortfolioView({
  loading, refreshing, positions, prices, quoteMap, vnIndex,
  allocations, totalAssets, totalPnl, totalPnlPct,
  actualNav, marketValue, unrealizedPnl, realizedPnl, totalSellOrders,
  dayPnl, cashSummary, aiNewsContext, accessToken, onRefreshPrices,
  closesMap, sectorCtx, optResult,
}: Props) {

  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});
  const [newsModal, setNewsModal] = useState<{ symbol: string; news: NewsItem[] } | null>(null);
  const companyNames = useCompanyNames(positions.map(pos => pos.symbol));

  const toggleSymbol = useCallback((sym: string) =>
    setExpandedSymbols(p => ({ ...p, [sym]: !p[sym] })), []);
  const openNews = useCallback((sym: string) =>
    setNewsModal({ symbol: sym, news: aiNewsContext?.[sym] ?? [] }), [aiNewsContext]);
  const closeNews = useCallback(() => setNewsModal(null), []);

  const val    = (v: number) => loading ? '...' : formatCurrency(v);
  const pnlPos = totalPnl >= 0;

  return (
    <>
      {/* =========================================================
          OVERVIEW HERO
      ========================================================= */}
      <section style={ {
        ...STRONG_CARD, padding: 16, overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(59,130,246,0.04) 35%, rgba(15,23,42,0.02) 100%), var(--card)',
      } }>
        <div style={ { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))' } }>

          <div style={ { display: 'grid', gap: 10 } }>
            <div style={LABEL}>TỔNG TÀI SẢN</div>
            <div className="num-premium" style={ { fontSize: 'clamp(32px,6vw,44px)', lineHeight: 1.05, fontWeight: 800, color: C_TEXT, wordBreak: 'break-word' } }>
              {val(totalAssets)}
            </div>
            <div style={ { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' } }>
              <span className="num-premium" style={ { ...PILL, color: colorFor(totalPnl), background: pnlPos ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.10)', borderColor: pnlPos ? 'rgba(16,185,129,0.20)' : 'rgba(244,63,94,0.20)', display: 'inline-flex', alignItems: 'center' } }>
                PnL {val(totalPnl)}
              </span>
              <span className="num-premium" style={ { ...PILL, color: colorFor(totalPnlPct), display: 'inline-flex', alignItems: 'center' } }>
                {loading ? '...' : fmtPct(totalPnlPct)}
              </span>
              <span className="num-premium" style={ { ...PILL, color: colorFor(dayPnl), display: 'inline-flex', alignItems: 'center' } }>
                Hôm nay {val(dayPnl)}
              </span>
            </div>
          </div>

          <div style={ { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', alignSelf: 'stretch' } }>
            <HeroMetric label="NAV THỰC TẾ"        value={val(actualNav)}     sub="Tiền mặt hiện có" />
            <HeroMetric label="GIÁ TRỊ THỊ TRƯỜNG" value={val(marketValue)}   sub={`${positions.length} mã đang nắm`} />
            <HeroMetric label="LÃI/LỖ ĐÃ CHỐT"    value={val(realizedPnl)}   sub={`${totalSellOrders} lệnh bán`} positive={realizedPnl >= 0} />
            <HeroMetric label="LÃI/LỖ ĐANG MỞ"    value={val(unrealizedPnl)} sub="Vị thế hiện tại"  positive={unrealizedPnl >= 0} />
            <HeroMetric label="CỔ TỨC ĐÃ NHẬN"    value={val(cashSummary.dividends ?? 0)} sub="Cổ tức tiền mặt" positive={(cashSummary.dividends ?? 0) > 0 ? true : null} />
          </div>
        </div>

        {vnIndex && (
          <div style={ { marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' } }>
            <div style={LABEL}>VN-INDEX</div>
            <div style={ { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } }>
              <span className="num-premium" style={ { fontSize: 20, fontWeight: 800 } }>{fmtPrice(vnIndex.price)}</span>
              <span className="num-premium" style={ { ...PILL, color: colorFor(vnIndex.change) } }>
                {fmtChange(vnIndex.change)} · {fmtPct(vnIndex.pct)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================
          ALLOCATION
      ========================================================= */}
      {allocations.length > 0 && (
        <section style={ { ...CARD, padding: 16 } }>
          <div style={ { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' } }>
            <div>
              <div style={LABEL}>Cơ cấu danh mục</div>
              <div style={ { fontSize: 18, fontWeight: 800, marginTop: 4 } }>TỶ TRỌNG VỊ THẾ</div>
            </div>
            <span className="num-premium" style={PILL}>{positions.length} MÃ</span>
          </div>
          <div style={ { display: 'grid', gap: 14 } }>
            {allocations.map(item => (
              <div key={item.symbol}>
                <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } }>
                  <div style={ { fontWeight: 800 } }>{item.symbol}</div>
                  <div className="num-premium" style={ { fontSize: 13, fontWeight: 700, color: C_MUTED } }>
                    {formatCurrency(item.totalNow)} · {item.percent.toFixed(1)}%
                  </div>
                </div>
                <div style={ { width: '100%', height: 8, borderRadius: 999, background: 'var(--soft)', overflow: 'hidden' } }>
                  <div style={ { width: `${Math.max(item.percent, 2)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,rgba(37,99,235,0.8),rgba(96,165,250,0.6))' } } />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =========================================================
          ✨ PORTFOLIO OPTIMIZATION
      ========================================================= */}
      {optResult && <OptimizationPanel data={optResult} />}

      {/* =========================================================
          ✨ SECTOR HEATMAP
      ========================================================= */}
      {sectorCtx && sectorCtx.length > 0 && <SectorHeatmap sectors={sectorCtx} />}

      {/* =========================================================
          HOLDINGS
      ========================================================= */}
      <section style={ { ...CARD, padding: 16 } }>
        <div style={ { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 } }>
          <div>
            <div style={LABEL}>Danh mục hiện tại</div>
            <div style={ { fontSize: 20, fontWeight: 800, marginTop: 4 } }>HOLDINGS</div>
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
          <div style={ { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' } }>
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : positions.length > 0 ? (
          <div style={ { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' } }>
            {positions.map(pos => {
              const row      = calcPosition(pos, prices);
              const quote    = quoteMap.get(pos.symbol.toUpperCase());
              const positive = row.pnl >= 0;
              const expanded = !!expandedSymbols[pos.symbol];

              return (
                <article key={pos.symbol} style={ { ...STRONG_CARD, padding: 16, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'none' } }>

                  <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 } }>
                    <div style={ { minWidth: 0 } }>
                      <div style={ { fontSize: 28, lineHeight: 1, fontWeight: 800 } }>{pos.symbol}</div>
                      {companyNames[pos.symbol] && ( <div style={HOLDING_NAME}>{companyNames[pos.symbol]}</div> )}
                      <div className="num-premium" style={ { fontSize: 11, fontWeight: 800, color: C_MUTED, marginTop: 6, letterSpacing: '0.04em' } }>
                        {pos.holdings.length} LOT · SL {pos.quantity}
                      </div>
                    </div>
                    <button type="button" onClick={() => toggleSymbol(pos.symbol)} style={ { ...PILL, cursor: 'pointer', flexShrink: 0 } }>
                      {expanded ? 'ẨN LỆNH' : 'XEM LỆNH'}
                    </button>
                  </div>

                  {/* ✨ Sparkline */}
                  {closesMap?.[pos.symbol] && closesMap[pos.symbol].length > 5 && (
                    <div style={ { display: 'flex', alignItems: 'center', gap: 8 } }>
                      <Sparkline closes={closesMap[pos.symbol]} width={90} height={28} />
                      <span style={ { fontSize: 10, color: 'var(--muted)' } }>3 tháng</span>
                    </div>
                  )}

                  <div style={ { display: 'grid', gap: 10, gridTemplateColumns: '1fr auto', alignItems: 'end' } }>
                    <div style={ { minWidth: 0 } }>
                      <div style={LABEL}>Giá hiện tại</div>
                      <div className="num-premium" style={ { fontSize: 28, fontWeight: 800, marginTop: 4, lineHeight: 1.1, wordBreak: 'break-word' } }>
                        {fmtPrice(quote?.price ?? row.now)}
                      </div>
                      <div className="num-premium" style={ { fontSize: 13, fontWeight: 800, color: colorFor(quote?.change), marginTop: 4 } }>
                        {fmtChange(quote?.change)} · {fmtPct(quote?.pct)}
                      </div>
                    </div>
                    <div style={ { borderRadius: 16, padding: '12px 16px', minWidth: 120, textAlign: 'right', background: positive ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.10)', border: `1px solid ${positive ? 'rgba(16,185,129,0.20)' : 'rgba(244,63,94,0.20)'}`, color: positive ? C_GREEN : C_RED } }>
                      <div style={ { fontSize: 10, fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.04em' } }>PnL</div>
                      <div className="num-premium" style={ { fontSize: 18, fontWeight: 800, marginTop: 2 } }>{formatCurrency(row.pnl)}</div>
                      <div className="num-premium" style={ { fontSize: 13, fontWeight: 800, marginTop: 2 } }>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%</div>
                    </div>
                  </div>

                  <div style={ { display: 'flex', flexWrap: 'wrap', gap: 8 } }>
                    <div className="num-premium" style={PILL}>SL {pos.quantity}</div>
                    <div className="num-premium" style={PILL}>VỐN TB {formatCurrency(pos.avgBuyPrice)}</div>
                  </div>

                  <div style={ { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))' } }>
                    {[{ l: 'Tổng mua', v: row.cost }, { l: 'Hiện tại', v: row.value }].map(cell => (
                      <div key={cell.l} style={MINI_CARD}>
                        <div style={LABEL}>{cell.l}</div>
                        <div className="num-premium" style={ { fontSize: 16, fontWeight: 800, marginTop: 4 } }>{formatCurrency(cell.v)}</div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => openNews(pos.symbol)} style={ { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, cursor: 'pointer', color: C_TEXT, fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', width: '100%' } }>
                    <Newspaper size={16} color="var(--primary)" /> ĐỌC TIN TỨC
                  </button>

                  {expanded && (
                    <div style={ { display: 'grid', gap: 8 } }>
                      {pos.holdings.map((h: any) => {
                        const isStockDiv = Number(h.buy_price) === 0;
                        return (
                          <div key={h.id} style={MINI_CARD}>
                            <div className="num-premium" style={ { fontSize: 13, fontWeight: 800 } }>{fmtDate(h.buy_date)} · SL {h.quantity}</div>
                            <div className="num-premium" style={ { fontSize: 12, color: C_MUTED, marginTop: 4 } }>
                              {isStockDiv ? '🎁 Cổ tức cổ phiếu (giá vốn 0)' : `GIÁ MUA ${formatCurrency(Number(h.buy_price))}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div style={ { color: C_MUTED, fontSize: 14 } }>
            {'Chưa có vị thế đang nắm giữ'}
          </div>
        )}
      </section>

      {/* =========================================================
          PERFORMANCE CHART
      ========================================================= */}
      {accessToken && (
        <section style={ {
          borderRadius:         28,
          background:           'var(--card)',
          border:               '1px solid var(--border)',
          boxShadow:            'var(--shadow-soft)',
          backdropFilter:       'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          padding:              20,
        } }>
          <div style={ { marginBottom: 20 } }>
            <div style={ { fontSize: 11, color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' } }>
              Lịch sử
            </div>
            <div style={ { fontSize: 20, fontWeight: 800, marginTop: 4, color: 'var(--text)' } }>HIỆU SUẤT DANH MỤC</div>
          </div>
          <PerformanceChart accessToken={accessToken} />
        </section>
      )}

      {newsModal && (
        <NewsModal symbol={newsModal.symbol} news={newsModal.news} onClose={closeNews} />
      )}
    </>
  );
                }
