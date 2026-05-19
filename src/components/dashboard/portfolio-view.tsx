'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

import {
  calcPosition,
  formatCurrency,
  PriceMap,
  PositionGroup,
} from '@/lib/calculations';

import {
  AllocationItem,
  CashSummaryShape,
  NewsItem,
  QuoteItem,
} from '@/lib/dashboard-types';

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
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))',
  backdropFilter: 'blur(18px)',
  boxShadow: 'var(--shadow-soft)',
};

export function PortfolioView(props: Props) {
  const {
    loading,
    accessToken,
    refreshing,
    positions,
    prices,
    quoteMap,

    totalAssets,
    totalPnl,

    onRefreshPrices,
  } = props;

  const val = (v: number) =>
    loading ? '...' : formatCurrency(v);

  const pnlColor =
    totalPnl >= 0
      ? 'var(--green)'
      : 'var(--red)';

  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
      }}
    >
      <section
        style={{
          ...card,
          padding: 18,
          display: 'grid',
          gap: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'var(--muted)',
            fontWeight: 800,
          }}
        >
          TỔNG TÀI SẢN
        </div>

        <div
          className='num-premium'
          style={{
            fontSize: 'clamp(34px,9vw,64px)',
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: '-0.05em',
            color: pnlColor,
          }}
        >
          {val(totalAssets)}
        </div>
      </section>

      <section
        style={{
          ...card,
          padding: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--muted)',
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              HOLDINGS
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                marginTop: 6,
              }}
            >
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
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            <RefreshCw
              size={14}
              className={
                refreshing
                  ? 'spin-animation'
                  : ''
              }
            />

            REFRESH
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 12,
          }}
        >
          {positions.map((pos) => {
            const row = calcPosition(
              pos,
              prices
            );

            const quote = quoteMap.get(
              pos.symbol.toUpperCase()
            );

            const currentPrice = Number(
              quote?.price ||
                row.currentPrice ||
                0
            );

            const change = Number(
              quote?.change || 0
            );

            const pct = Number(
              quote?.pct ||
                row.pnlPct ||
                0
            );

            const marketColor =
              change >= 0
                ? 'var(--green)'
                : 'var(--red)';

            return (
              <div
                key={pos.symbol}
                style={{
                  ...card,
                  padding: 18,
                  display: 'grid',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 800,
                        lineHeight: 1,
                        letterSpacing:
                          '-0.03em',
                      }}
                    >
                      {pos.symbol}
                    </div>

                    <div
                      className='num-premium'
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        color:
                          'var(--muted)',
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        {pos.quantity} CP
                      </span>

                      <span>•</span>

                      <span>
                        Avg{' '}
                        {formatCurrency(
                          pos.avgBuyPrice
                        )}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      textAlign: 'right',
                    }}
                  >
                    <div
                      className='num-premium'
                      style={{
                        color:
                          row.pnl >= 0
                            ? 'var(--green)'
                            : 'var(--red)',
                        fontWeight: 800,
                        fontSize: 15,
                      }}
                    >
                      {formatCurrency(
                        row.pnl
                      )}
                    </div>

                    <div
                      className='num-premium'
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color:
                          row.pnl >= 0
                            ? 'var(--green)'
                            : 'var(--red)',
                      }}
                    >
                      {row.pnlPct.toFixed(
                        2
                      )}
                      %
                    </div>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color:
                        'var(--muted)',
                      fontWeight: 700,
                      letterSpacing:
                        '0.04em',
                    }}
                  >
                    GIÁ HIỆN TẠI
                  </div>

                  <div
                    className='num-premium'
                    style={{
                      marginTop: 6,
                      fontSize: 22,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: marketColor,
                    }}
                  >
                    {formatCurrency(
                      currentPrice
                    )}
                  </div>

                  <div
                    className='num-premium'
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      color: marketColor,
                    }}
                  >
                    {change > 0
                      ? '+'
                      : ''}
                    {formatCurrency(
                      change
                    )}{' '}
                    (
                    {pct > 0
                      ? '+'
                      : ''}
                    {pct.toFixed(2)}%)
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent:
                      'space-between',
                    alignItems: 'center',
                    paddingTop: 10,
                    borderTop:
                      '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color:
                        'var(--muted)',
                    }}
                  >
                    Market Value
                  </div>

                  <div
                    className='num-premium'
                    style={{
                      fontWeight: 800,
                    }}
                  >
                    {formatCurrency(
                      row.totalNow
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {accessToken && (
          <div
            style={{
              marginTop: 18,
              ...card,
              padding: 18,
            }}
          >
            <PerformanceChart
              accessToken={accessToken}
            />
          </div>
        )}
      </section>
    </div>
  );
}
