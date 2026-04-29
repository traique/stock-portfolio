'use client';

import { Newspaper, RefreshCw, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { calcPosition, formatCurrency, PriceMap, PositionGroup } from '@/lib/calculations';
import {
  AllocationItem, CashSummaryShape, NewsItem, QuoteItem,
} from '@/lib/dashboard-types';

// =========================================================
// TYPES
// =========================================================

type Props = {
  loading:         boolean;
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
    <div style={{ ...STRONG_CARD, padding: 16, borderRadius: 20, boxShadow: 'none', background: 'var(--soft)' }}>
      <div style={LABEL}>{label}</div>
      <div className="num-premium" style={{ marginTop: 6, fontSize: 24, lineHeight: 1.15, fontWeight: 800, color, wordBreak: 'break-word' }}>
        {value}
      </div>
      {sub && <div style={{ marginTop: 6, fontSize: 12, color: C_MUTED, fontWeight: 600 }}>{sub}</div>}
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        className="ab-premium-card"
        style={{ width: '100%', maxWidth: 450, maxHeight: '80vh', overflowY: 'auto', padding: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Newspaper size={20} color="var(--primary)" />
            TIN TỨC: {symbol}
          </div>
          <button onClick={onClose} aria-label="Đóng" style={{ background: 'var(--soft)', border: '1px solid var(--border)', color: C_MUTED, cursor: 'pointer', padding: 6, borderRadius: '50%', display: 'grid', placeItems: 'center' }}>
            <X size={16} />
          </button>
        </div>

        {news.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {news.map((n, i) => (
              <a
                key={i}
                href={n.url ?? `https://www.google.com/search?q=${encodeURIComponent(n.title)}`}
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
          <div style={{ textAlign: 'center', padding: '32px 0', color: C_MUTED, fontSize: 14, lineHeight: 1.6 }}>
            Chưa có tin tức.<br />
            Bấm <strong>PHÂN TÍCH DANH MỤC</strong> trong phần AI để cập nhật.
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================
// MAIN EXPORT
// =========================================================

export function PortfolioView({
  loading, refreshing, positions, prices, quoteMap, vnIndex,
  allocations, totalAssets, totalPnl, totalPnlPct,
  actualNav, marketValue, unrealizedPnl, realizedPnl, totalSellOrders,
  dayPnl, cashSummary, aiNewsContext, onRefreshPrices,
}: Props) {

  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});
  const [newsModal, setNewsModal] = useState<{ symbol: string; news: NewsItem[] } | null>(null);

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
      <section style={{
        ...STRONG_CARD, padding: 16, overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(59,130,246,0.04) 35%, rgba(15,23,42,0.02) 100%), var(--card)',
      }}>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))' }}>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={LABEL}>TỔNG TÀI SẢN</div>
            <div className="num-premium" style={{ fontSize: 'clamp(32px,6vw,44px)', lineHeight: 1.05, fontWeight: 800, color: C_TEXT, wordBreak: 'break-word' }}>
              {val(totalAssets)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span className="num-premium" style={{ ...PILL, color: colorFor(totalPnl), background: pnlPos ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.10)', borderColor: pnlPos ? 'rgba(16,185,129,0.20)' : 'rgba(244,63,94,0.20)' }}>
                PnL {val(totalPnl)}
              </span>
              <span className="num-premium" style={{ ...PILL, color: colorFor(totalPnlPct) }}>
                {loading ? '...' : fmtPct(totalPnlPct)}
              </span>
              <span className="num-premium" style={{ ...PILL, color: colorFor(dayPnl) }}>
                Hôm nay {val(dayPnl)}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', alignSelf: 'stretch' }}>
            <HeroMetric label="NAV THỰC TẾ"        value={val(actualNav)}     sub="Tiền mặt hiện có" />
            <HeroMetric label="GIÁ TRỊ THỊ TRƯỜNG" value={val(marketValue)}   sub={`${positions.length} mã đang nắm`} />
            <HeroMetric label="LÃI/LỖ ĐÃ CHỐT"    value={val(realizedPnl)}   sub={`${totalSellOrders} lệnh bán`} positive={realizedPnl >= 0} />
            <HeroMetric label="LÃI/LỖ ĐANG MỞ"    value={val(unrealizedPnl)} sub="Vị thế hiện tại"  positive={unrealizedPnl >= 0} />
          </div>
        </div>

        {vnIndex && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={LABEL}>VN-INDEX</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="num-premium" style={{ fontSize: 20, fontWeight: 800 }}>{fmtPrice(vnIndex.price)}</span>
              <span className="num-premium" style={{ ...PILL, color: colorFor(vnIndex.change) }}>
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
        <section style={{ ...CARD, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={LABEL}>Cơ cấu danh mục</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>TỶ TRỌNG VỊ THẾ</div>
            </div>
            <span className="num-premium" style={PILL}>{positions.length} MÃ</span>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {allocations.map(item => (
              <div key={item.symbol}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 800 }}>{item.symbol}</div>
                  <div className="num-premium" style={{ fontSize: 13, fontWeight: 700, color: C_MUTED }}>
                    {formatCurrency(item.totalNow)} · {item.percent.toFixed(1)}%
                  </div>
                </div>
                <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--soft)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(item.percent, 2)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,rgba(37,99,235,0.8),rgba(96,165,250,0.6))' }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =========================================================
          HOLDINGS
      ========================================================= */}
      <section style={{ ...CARD, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={LABEL}>Danh mục hiện tại</div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>HOLDINGS</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="num-premium" style={PILL}>{positions.length} MÃ</span>
            <button type="button" style={{ ...PILL, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={onRefreshPrices} disabled={refreshing}>
              <RefreshCw size={12} className={refreshing ? 'spin-animation' : ''} />
              LÀM MỚI GIÁ
            </button>
          </div>
        </div>

        {!loading && positions.length > 0 ? (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
            {positions.map(pos => {
              const row      = calcPosition(pos, prices);
              const quote    = quoteMap.get(pos.symbol.toUpperCase());
              const positive = row.pnl >= 0;
              const expanded = !!expandedSymbols[pos.symbol];

              return (
                <article key={pos.symbol} style={{ ...STRONG_CARD, padding: 16, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'none' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 800 }}>{pos.symbol}</div>
                      <div className="num-premium" style={{ fontSize: 11, fontWeight: 800, color: C_MUTED, marginTop: 6, letterSpacing: '0.04em' }}>
                        {pos.holdings.length} LOT · SL {pos.quantity}
                      </div>
                    </div>
                    <button type="button" onClick={() => toggleSymbol(pos.symbol)} style={{ ...PILL, cursor: 'pointer', flexShrink: 0 }}>
                      {expanded ? 'ẨN LỆNH' : 'XEM LỆNH'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={LABEL}>Giá hiện tại</div>
                      <div className="num-premium" style={{ fontSize: 28, fontWeight: 800, marginTop: 4, lineHeight: 1.1, wordBreak: 'break-word' }}>
                        {fmtPrice(quote?.price ?? row.currentPrice)}
                      </div>
                      <div className="num-premium" style={{ fontSize: 13, fontWeight: 800, color: colorFor(quote?.change), marginTop: 4 }}>
                        {fmtChange(quote?.change)} · {fmtPct(quote?.pct)}
                      </div>
                    </div>
                    <div style={{ borderRadius: 16, padding: '12px 16px', minWidth: 120, textAlign: 'right', background: positive ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.10)', border: `1px solid ${positive ? 'rgba(16,185,129,0.20)' : 'rgba(244,63,94,0.20)'}`, color: positive ? C_GREEN : C_RED }}>
                      <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>PnL</div>
                      <div className="num-premium" style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{formatCurrency(row.pnl)}</div>
                      <div className="num-premium" style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <div className="num-premium" style={PILL}>SL {pos.quantity}</div>
                    <div className="num-premium" style={PILL}>VỐN TB {formatCurrency(pos.avgBuyPrice)}</div>
                  </div>

                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))' }}>
                    {[{ l: 'Tổng mua', v: row.totalBuy }, { l: 'Hiện tại', v: row.totalNow }].map(cell => (
                      <div key={cell.l} style={MINI_CARD}>
                        <div style={LABEL}>{cell.l}</div>
                        <div className="num-premium" style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{formatCurrency(cell.v)}</div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => openNews(pos.symbol)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, cursor: 'pointer', color: C_TEXT, fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', width: '100%' }}>
                    <Newspaper size={16} color="var(--primary)" /> ĐỌC TIN TỨC
                  </button>

                  {expanded && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {pos.holdings.map((h: any) => (
                        <div key={h.id} style={MINI_CARD}>
                          <div className="num-premium" style={{ fontSize: 13, fontWeight: 800 }}>{fmtDate(h.buy_date)} · SL {h.quantity}</div>
                          <div className="num-premium" style={{ fontSize: 12, color: C_MUTED, marginTop: 4 }}>GIÁ MUA {formatCurrency(Number(h.buy_price))}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div style={{ color: C_MUTED, fontSize: 14 }}>
            {loading ? 'Đang tải danh mục...' : 'Chưa có vị thế đang nắm giữ'}
          </div>
        )}
      </section>

      {newsModal && (
        <NewsModal symbol={newsModal.symbol} news={newsModal.news} onClose={closeNews} />
      )}
    </>
  );
}
