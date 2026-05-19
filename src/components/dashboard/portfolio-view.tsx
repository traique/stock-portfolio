'use client';

import { Newspaper, RefreshCw, X } from 'lucide-react';
import { PerformanceChart } from '@/components/dashboard/performance-chart';
import { useCallback, useState } from 'react';
import { calcPosition, formatCurrency, PriceMap, PositionGroup } from '@/lib/calculations';
import {
  AllocationItem, CashSummaryShape, NewsItem, QuoteItem,
} from '@/lib/dashboard-types';

type Props = {
  loading: boolean;
  accessToken: string;
  refreshing: boolean;
  positions: PositionGroup[];
  prices: PriceMap;
  quoteMap: Map<string, QuoteItem>;
  vnIndex: QuoteItem | null;
  allocations: AllocationItem[];
  totalAssets: number;
  totalPnl: number;
  totalPnlPct: number;
  actualNav: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalSellOrders: number;
  dayPnl: number;
  cashSummary: CashSummaryShape;
  aiNewsContext?: Record<string, NewsItem[]>;
  onRefreshPrices: () => void;
};

const C_MUTED = 'var(--muted)';
const C_TEXT = 'var(--text)';
const C_GREEN = 'var(--green)';
const C_RED = 'var(--red)';

const CARD: React.CSSProperties = {
  borderRadius: 28,
  background: 'var(--card)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-soft)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
};

const BENTO_CARD: React.CSSProperties = {
  ...CARD,
  padding: 20,
  overflow: 'hidden',
};

const PILL: React.CSSProperties = {
  borderRadius: 999,
  padding: '6px 12px',
  background: 'var(--soft)',
  border: '1px solid var(--border)',
  color: C_TEXT,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.04em',
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  color: C_MUTED,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const MINI_CARD: React.CSSProperties = {
  ...CARD,
  padding: 14,
  borderRadius: 20,
  boxShadow: 'none',
};

const vnFmt = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const fmtPrice = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? 'N/A' : vnFmt.format(v);

const fmtChange = (v?: number | null) =>
  v == null || !Number.isFinite(v)
    ? 'N/A'
    : `${v > 0 ? '+' : ''}${vnFmt.format(v)}`;

const fmtPct = (v?: number | null) =>
  v == null || !Number.isFinite(v)
    ? 'N/A'
    : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

const colorFor = (v?: number | null): string =>
  !Number.isFinite(v as number)
    ? C_MUTED
    : (v as number) > 0
      ? C_GREEN
      : (v as number) < 0
        ? C_RED
        : C_MUTED;

function HeroMetric({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean | null;
}) {
  const color = positive == null ? C_TEXT : positive ? C_GREEN : C_RED;

  return (
    <div
      style={{
        ...MINI_CARD,
        background: 'var(--soft)',
        display: 'grid',
        gap: 6,
        minHeight: 120,
      }}
    >
      <div style={LABEL}>{label}</div>

      <div
        className="num-premium"
        style={{
          fontSize: 22,
          lineHeight: 1.1,
          fontWeight: 800,
          color,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>

      {sub && (
        <div
          style={{
            fontSize: 12,
            color: C_MUTED,
            fontWeight: 600,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function NewsModal({ symbol, news, onClose }: {
  symbol: string;
  news: NewsItem[];
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.60)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="ab-premium-card"
        style={{
          width: '100%',
          maxWidth: 450,
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Newspaper size={20} color="var(--primary)" />
            TIN TỨC: {symbol}
          </div>

          <button
            onClick={onClose}
            aria-label="Đóng"
            style={{
              background: 'var(--soft)',
              border: '1px solid var(--border)',
              color: C_MUTED,
              cursor: 'pointer',
              padding: 6,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {news.map((n, i) => (
            <a
              key={i}
              href={n.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="ab-news-item"
            >
              <div className="ab-news-title">{n.title}</div>

              <div className="ab-news-meta num-premium">
                {n.source}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PortfolioView({
  loading,
  refreshing,
  positions,
  prices,
  quoteMap,
  vnIndex,
  allocations,
  totalAssets,
  totalPnl,
  totalPnlPct,
  actualNav,
  marketValue,
  unrealizedPnl,
  realizedPnl,
  totalSellOrders,
  dayPnl,
  aiNewsContext,
  accessToken,
  onRefreshPrices,
}: Props) {
  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});

  const [newsModal, setNewsModal] = useState<{
    symbol: string;
    news: NewsItem[];
  } | null>(null);

  const toggleSymbol = useCallback((sym: string) => {
    setExpandedSymbols(p => ({
      ...p,
      [sym]: !p[sym],
    }));
  }, []);

  const openNews = useCallback((sym: string) => {
    setNewsModal({
      symbol: sym,
      news: aiNewsContext?.[sym] ?? [],
    });
  }, [aiNewsContext]);

  const val = (v: number) => loading ? '...' : formatCurrency(v);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 0.9fr)',
          gap: 20,
        }}
      >
        <div
          style={{
            ...BENTO_CARD,
            background:
              'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(59,130,246,0.06) 35%, rgba(15,23,42,0.02) 100%), var(--card)',
            display: 'grid',
            alignContent: 'space-between',
            minHeight: 340,
          }}
        >
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={LABEL}>TỔNG TÀI SẢN</div>

            <div
              className="num-premium"
              style={{
                fontSize: 'clamp(42px,7vw,72px)',
                lineHeight: 0.95,
                fontWeight: 900,
                color: C_TEXT,
                letterSpacing: '-0.04em',
              }}
            >
              {val(totalAssets)}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="num-premium"
                style={{
                  ...PILL,
                  color: colorFor(totalPnl),
                }}
              >
                PnL {val(totalPnl)}
              </span>

              <span
                className="num-premium"
                style={{
                  ...PILL,
                  color: colorFor(totalPnlPct),
                }}
              >
                {fmtPct(totalPnlPct)}
              </span>

              <span
                className="num-premium"
                style={{
                  ...PILL,
                  color: colorFor(dayPnl),
                }}
              >
                Hôm nay {val(dayPnl)}
              </span>
            </div>
          </div>

          {vnIndex && (
            <div
              style={{
                marginTop: 28,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={LABEL}>VNINDEX</div>

                <div
                  className="num-premium"
                  style={{
                    fontSize: 30,
                    fontWeight: 800,
                    marginTop: 6,
                  }}
                >
                  {fmtPrice(vnIndex.price)}
                </div>
              </div>

              <div
                className="num-premium"
                style={{
                  ...PILL,
                  color: colorFor(vnIndex.change),
                }}
              >
                {fmtChange(vnIndex.change)} · {fmtPct(vnIndex.pct)}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
            gap: 20,
          }}
        >
          <HeroMetric
            label="NAV THỰC TẾ"
            value={val(actualNav)}
            sub="Tiền mặt"
          />

          <HeroMetric
            label="GIÁ TRỊ THỊ TRƯỜNG"
            value={val(marketValue)}
            sub={`${positions.length} mã`}
          />

          <HeroMetric
            label="LÃI/LỖ ĐÃ CHỐT"
            value={val(realizedPnl)}
            sub={`${totalSellOrders} lệnh bán`}
            positive={realizedPnl >= 0}
          />

          <HeroMetric
            label="LÃI/LỖ ĐANG MỞ"
            value={val(unrealizedPnl)}
            sub="Vị thế hiện tại"
            positive={unrealizedPnl >= 0}
          />
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(0, 1.4fr)',
          gap: 20,
          alignItems: 'stretch',
        }}
      >
        {allocations.length > 0 && (
          <div style={BENTO_CARD}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <div>
                <div style={LABEL}>Portfolio</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                  ALLOCATION
                </div>
              </div>

              <div className="num-premium" style={PILL}>
                {positions.length} MÃ
              </div>
            </div>

            <div style={{ display: 'grid', gap: 18 }}>
              {allocations.map(item => (
                <div key={item.symbol}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{item.symbol}</div>

                    <div
                      className="num-premium"
                      style={{
                        fontSize: 13,
                        color: C_MUTED,
                        fontWeight: 700,
                      }}
                    >
                      {item.percent.toFixed(1)}%
                    </div>
                  </div>

                  <div
                    style={{
                      width: '100%',
                      height: 10,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: 'var(--soft)',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(item.percent, 2)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background:
                          'linear-gradient(90deg,rgba(37,99,235,0.95),rgba(96,165,250,0.7))',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {accessToken && (
          <div style={BENTO_CARD}>
            <div style={{ marginBottom: 18 }}>
              <div style={LABEL}>Analytics</div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  marginTop: 6,
                }}
              >
                PERFORMANCE
              </div>
            </div>

            <PerformanceChart accessToken={accessToken} />
          </div>
        )}
      </section>

      <section style={BENTO_CARD}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 22,
          }}
        >
          <div>
            <div style={LABEL}>Danh mục hiện tại</div>

            <div
              style={{
                fontSize: 26,
                fontWeight: 900,
                marginTop: 6,
                letterSpacing: '-0.03em',
              }}
            >
              HOLDINGS
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="num-premium" style={PILL}>
              {positions.length} MÃ
            </span>

            <button
              type="button"
              style={{
                ...PILL,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              onClick={onRefreshPrices}
              disabled={refreshing}
            >
              <RefreshCw size={12} className={refreshing ? 'spin-animation' : ''} />
              LÀM MỚI GIÁ
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {positions.map(pos => {
            const row = calcPosition(pos, prices);
            const quote = quoteMap.get(pos.symbol.toUpperCase());
            const positive = row.pnl >= 0;
            const expanded = !!expandedSymbols[pos.symbol];

            return (
              <article
                key={pos.symbol}
                style={{
                  ...MINI_CARD,
                  padding: 18,
                  display: 'grid',
                  gap: 18,
                  alignContent: 'start',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 34,
                        lineHeight: 1,
                        fontWeight: 900,
                        letterSpacing: '-0.04em',
                      }}
                    >
                      {pos.symbol}
                    </div>

                    <div
                      className="num-premium"
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: C_MUTED,
                        fontWeight: 800,
                      }}
                    >
                      {pos.quantity} CP
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 16,
                      background: positive
                        ? 'rgba(16,185,129,0.10)'
                        : 'rgba(244,63,94,0.10)',
                      border: `1px solid ${positive
                        ? 'rgba(16,185,129,0.20)'
                        : 'rgba(244,63,94,0.20)'}`,
                    }}
                  >
                    <div
                      className="num-premium"
                      style={{
                        fontSize: 16,
                        fontWeight: 800,
                        color: positive ? C_GREEN : C_RED,
                      }}
                    >
                      {formatCurrency(row.pnl)}
                    </div>

                    <div
                      className="num-premium"
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: positive ? C_GREEN : C_RED,
                      }}
                    >
                      {row.pnlPct.toFixed(2)}%
                    </div>
                  </div>
                </div>

                <div>
                  <div style={LABEL}>Giá hiện tại</div>

                  <div
                    className="num-premium"
                    style={{
                      fontSize: 34,
                      lineHeight: 1,
                      fontWeight: 900,
                      marginTop: 10,
                    }}
                  >
                    {fmtPrice(quote?.price ?? row.currentPrice)}
                  </div>

                  <div
                    className="num-premium"
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      fontWeight: 800,
                      color: colorFor(quote?.change),
                    }}
                  >
                    {fmtChange(quote?.change)} · {fmtPct(quote?.pct)}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
                    gap: 12,
                  }}
                >
                  <div style={MINI_CARD}>
                    <div style={LABEL}>Vốn trung bình</div>

                    <div
                      className="num-premium"
                      style={{
                        marginTop: 8,
                        fontWeight: 800,
                      }}
                    >
                      {formatCurrency(pos.avgBuyPrice)}
                    </div>
                  </div>

                  <div style={MINI_CARD}>
                    <div style={LABEL}>Giá trị hiện tại</div>

                    <div
                      className="num-premium"
                      style={{
                        marginTop: 8,
                        fontWeight: 800,
                      }}
                    >
                      {formatCurrency(row.totalNow)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => toggleSymbol(pos.symbol)}
                    style={{
                      ...PILL,
                      cursor: 'pointer',
                      flex: 1,
                    }}
                  >
                    {expanded ? 'ẨN LỆNH' : 'CHI TIẾT'}
                  </button>

                  <button
                    type="button"
                    onClick={() => openNews(pos.symbol)}
                    style={{
                      ...PILL,
                      cursor: 'pointer',
                      flex: 1,
                    }}
                  >
                    TIN TỨC
                  </button>
                </div>

                {expanded && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {pos.holdings.map((h: any) => (
                      <div key={h.id} style={MINI_CARD}>
                        <div
                          className="num-premium"
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                          }}
                        >
                          SL {h.quantity}
                        </div>

                        <div
                          className="num-premium"
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            color: C_MUTED,
                          }}
                        >
                          GIÁ MUA {formatCurrency(Number(h.buy_price))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {newsModal && (
        <NewsModal
          symbol={newsModal.symbol}
          news={newsModal.news}
          onClose={() => setNewsModal(null)}
        />
      )}
    </div>
  );
}
