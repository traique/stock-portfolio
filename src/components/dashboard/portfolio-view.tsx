'use client';

import { RefreshCw } from 'lucide-react';
import { calcPosition, formatCurrency, PriceMap, PositionGroup } from '@/lib/calculations';
import { AllocationItem, CashSummaryShape, NewsItem, QuoteItem } from '@/lib/dashboard-types';
import { PerformanceChart } from '@/components/dashboard/performance-chart';

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

const card: React.CSSProperties = {
  borderRadius: 24,
  border: '1px solid var(--border)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: 'var(--shadow-soft)',
};

export function PortfolioView({
  loading,
  accessToken,
  refreshing,
  positions,
  prices,
  allocations,
  totalAssets,
  totalPnl,
  totalPnlPct,
  actualNav,
  marketValue,
  unrealizedPnl,
  realizedPnl,
  dayPnl,
  onRefreshPrices,
}: Props) {
  const val = (v: number) => loading ? '...' : formatCurrency(v);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section
        style={{
          ...card,
          padding: 18,
          display: 'grid',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 800 }}>
          TỔNG TÀI SẢN
        </div>

        <div
          className='num-premium'
          style={{
            fontSize: 'clamp(36px, 10vw, 68px)',
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: '-0.05em',
            wordBreak: 'break-word',
          }}
        >
          {val(totalAssets)}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
            gap: 12,
          }}
        >
          {[
            ['NAV THỰC TẾ', val(actualNav)],
            ['GIÁ TRỊ THỊ TRƯỜNG', val(marketValue)],
            ['LÃI/LỖ ĐÃ CHỐT', val(realizedPnl)],
            ['LÃI/LỖ ĐANG MỞ', val(unrealizedPnl)],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                ...card,
                padding: 14,
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800 }}>
                {label}
              </div>

              <div
                className='num-premium'
                style={{
                  marginTop: 10,
                  fontSize: 'clamp(18px,5vw,28px)',
                  fontWeight: 800,
                  lineHeight: 1.2,
                  wordBreak: 'break-word',
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[`PnL ${val(totalPnl)}`, `${totalPnlPct.toFixed(2)}%`, `Hôm nay ${val(dayPnl)}`].map(v => (
            <div
              key={v}
              className='num-premium'
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                background: 'var(--soft)',
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              {v}
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 16,
        }}
      >
        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800 }}>
                PORTFOLIO
              </div>

              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
                ALLOCATION
              </div>
            </div>

            <div className='num-premium' style={{ fontSize: 12, fontWeight: 800 }}>
              {positions.length} MÃ
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {allocations.map(item => (
              <div key={item.symbol}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>{item.symbol}</strong>
                  <span className='num-premium'>{item.percent.toFixed(1)}%</span>
                </div>

                <div style={{ height: 10, borderRadius: 999, background: 'var(--soft)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(item.percent, 3)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg,#2563eb,#60a5fa)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {accessToken && (
          <div style={{ ...card, padding: 18, overflow: 'hidden' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800 }}>
              ANALYTICS
            </div>

            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, marginBottom: 18 }}>
              PERFORMANCE
            </div>

            <PerformanceChart accessToken={accessToken} />
          </div>
        )}
      </section>

      <section style={{ ...card, padding: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800 }}>
              HOLDINGS
            </div>

            <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
              DANH MỤC
            </div>
          </div>

          <button
            onClick={onRefreshPrices}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--soft)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 800,
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin-animation' : ''} />
            REFRESH
          </button>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          {positions.map(pos => {
            const row = calcPosition(pos, prices);

            return (
              <div
                key={pos.symbol}
                style={{
                  ...card,
                  padding: 16,
                  display: 'grid',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1 }}>
                      {pos.symbol}
                    </div>

                    <div className='num-premium' style={{ marginTop: 6, fontSize: 12 }}>
                      {pos.quantity} CP
                    </div>
                  </div>

                  <div
                    className='num-premium'
                    style={{
                      color: row.pnl >= 0 ? 'var(--green)' : 'var(--red)',
                      fontWeight: 900,
                      fontSize: 16,
                      textAlign: 'right',
                    }}
                  >
                    {formatCurrency(row.pnl)}
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      {row.pnlPct.toFixed(2)}%
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
                    gap: 10,
                  }}
                >
                  <div style={{ ...card, padding: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800 }}>
                      GIÁ TB
                    </div>

                    <div className='num-premium' style={{ marginTop: 8, fontWeight: 800 }}>
                      {formatCurrency(pos.avgBuyPrice)}
                    </div>
                  </div>

                  <div style={{ ...card, padding: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800 }}>
                      GIÁ TRỊ
                    </div>

                    <div className='num-premium' style={{ marginTop: 8, fontWeight: 800 }}>
                      {formatCurrency(row.totalNow)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
