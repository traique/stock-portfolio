'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';

// =========================================================
// TYPES
// =========================================================

type Snapshot = {
  snapshot_date: string;
  total_assets: number;
  market_value: number;
  nav_cash: number;
  net_capital: number;
  total_pnl: number;
  total_pnl_pct: number;
  position_count: number;
};

type Range = '7d' | '30d' | '90d' | '180d' | '1y' | 'all';

type Props = {
  accessToken: string;
};

// =========================================================
// FORMATTERS
// =========================================================

const vnFmt = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

const shortFmt = (v: number) => {
  if (Math.abs(v) >= 1_000_000_000) {
    return `${(v / 1_000_000_000).toFixed(1)}T`;
  }

  if (Math.abs(v) >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(v) >= 1_000) {
    return `${(v / 1_000).toFixed(0)}K`;
  }

  return vnFmt.format(v);
};

const fmtCurrency = (v: number) => `${vnFmt.format(v)}₫`;

const fmtPct = (v: number) =>
  `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const fmtDate = (d: string) => {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
};

const fmtDateFull = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

// =========================================================
// CONSTANTS
// =========================================================

const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: '7N' },
  { key: '30d', label: '1T' },
  { key: '90d', label: '3T' },
  { key: '180d', label: '6T' },
  { key: '1y', label: '1N' },
  { key: 'all', label: 'Tất cả' },
];

const C_GREEN = 'var(--green)';
const C_RED = 'var(--red)';
const C_MUTED = 'var(--muted)';
const C_TEXT = 'var(--text)';
const C_BORDER = 'var(--border)';

// =========================================================
// TOOLTIP
// =========================================================

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const d = payload[0]?.payload as Snapshot;

  if (!d) return null;

  const pnlPos = d.total_pnl >= 0;

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border-strong)',
        borderRadius: 16,
        padding: '12px 16px',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: 'var(--shadow-strong)',
        minWidth: 220,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: C_MUTED,
          marginBottom: 10,
          letterSpacing: '0.04em',
        }}
      >
        {fmtDateFull(d.snapshot_date)}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {[
          {
            label: 'TỔNG TÀI SẢN',
            value: fmtCurrency(d.total_assets),
            color: C_TEXT,
            bold: true,
          },
          {
            label: 'GIÁ TRỊ TT',
            value: fmtCurrency(d.market_value),
            color: '#60a5fa',
          },
          {
            label: 'TIỀN MẶT',
            value: fmtCurrency(d.nav_cash),
            color: '#10b981',
          },
          {
            label: 'LÃI / LỖ',
            value: `${fmtCurrency(d.total_pnl)} (${fmtPct(
              d.total_pnl_pct,
            )})`,
            color: pnlPos ? C_GREEN : C_RED,
          },
        ].map((row) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: C_MUTED,
                fontWeight: 800,
                letterSpacing: '0.04em',
              }}
            >
              {row.label}
            </span>

            <span
              className="num-premium"
              style={{
                fontSize: 13,
                fontWeight: row.bold ? 800 : 700,
                color: row.color,
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {d.position_count > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${C_BORDER}`,
            fontSize: 10,
            color: C_MUTED,
            fontWeight: 700,
          }}
        >
          {d.position_count} mã đang nắm giữ
        </div>
      )}
    </div>
  );
}

// =========================================================
// MAIN
// =========================================================

export function PerformanceChart({ accessToken }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [range, setRange] = useState<Range>('90d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // =========================================================
  // FETCH
  // =========================================================

  const fetchSnapshots = useCallback(
    async (r: Range) => {
      setLoading(true);
      setError('');

      try {
        const res = await fetch(
          `/api/portfolio/snapshots?range=${r}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            cache: 'no-store',
          },
        );

        const data = await res.json();

        if (!res.ok) {
          setError(
            data?.error ?? 'Không tải được lịch sử',
          );
          return;
        }

        const normalized = (data.snapshots ?? []).map(
          (s: Snapshot) => ({
            ...s,
            total_assets: Number(s.total_assets || 0),
            market_value: Number(s.market_value || 0),
            nav_cash: Number(s.nav_cash || 0),
            net_capital: Number(s.net_capital || 0),
            total_pnl: Number(s.total_pnl || 0),
            total_pnl_pct: Number(s.total_pnl_pct || 0),
            position_count: Number(s.position_count || 0),
          }),
        );

        setSnapshots(normalized);
      } catch {
        setError('Lỗi kết nối');
      } finally {
        setLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    fetchSnapshots(range);
  }, [range, fetchSnapshots]);

  // =========================================================
  // CHART DATA
  // =========================================================

  const chartData = useMemo(() => {
    return snapshots.map((s) => ({
      ...s,
      display_date: fmtDate(s.snapshot_date),
    }));
  }, [snapshots]);

  const firstSnapshot = snapshots[0];
  const lastSnapshot =
    snapshots[snapshots.length - 1];

  // =========================================================
  // RETURN
  // =========================================================

  const totalReturn = useMemo(() => {
    if (!firstSnapshot || !lastSnapshot) {
      return null;
    }

    const diff =
      lastSnapshot.total_assets -
      firstSnapshot.total_assets;

    const pct =
      firstSnapshot.total_assets > 0
        ? (diff / firstSnapshot.total_assets) * 100
        : 0;

    return {
      diff,
      pct,
    };
  }, [firstSnapshot, lastSnapshot]);

  const returnPositive =
    (totalReturn?.pct ?? 0) >= 0;

  // =========================================================
  // Y DOMAIN
  // =========================================================

  const yMin = useMemo(() => {
    if (!snapshots.length) return 0;

    const values = snapshots
      .flatMap((s) => [
        s.total_assets,
        s.market_value,
        s.net_capital,
      ])
      .filter((v) => Number.isFinite(v));

    const min = Math.min(...values);

    return Math.floor(min * 0.95);
  }, [snapshots]);

  const yMax = useMemo(() => {
    if (!snapshots.length) return 0;

    const values = snapshots
      .flatMap((s) => [
        s.total_assets,
        s.market_value,
        s.net_capital,
      ])
      .filter((v) => Number.isFinite(v));

    const max = Math.max(...values);

    return Math.ceil(max * 1.05);
  }, [snapshots]);

  // =========================================================
  // EMPTY
  // =========================================================

  if (loading) {
    return (
      <div
        style={{
          width: '100%',
          height: 320,
          borderRadius: 24,
          background: 'var(--soft)',
        }}
      />
    );
  }

  if (!loading && !snapshots.length) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          color: C_MUTED,
          background: 'var(--soft)',
          borderRadius: 20,
          border: `1px solid ${C_BORDER}`,
        }}
      >
        Chưa có dữ liệu hiệu suất
      </div>
    );
  }

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          {lastSnapshot && (
            <>
              <div
                className="num-premium"
                style={{
                  fontSize:
                    'clamp(24px,4vw,34px)',
                  fontWeight: 800,
                  lineHeight: 1.1,
                  color: C_TEXT,
                }}
              >
                {fmtCurrency(
                  lastSnapshot.total_assets,
                )}
              </div>

              {totalReturn && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    className="num-premium"
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: returnPositive
                        ? C_GREEN
                        : C_RED,
                      background: returnPositive
                        ? 'rgba(16,185,129,0.10)'
                        : 'rgba(244,63,94,0.10)',
                      border: `1px solid ${
                        returnPositive
                          ? 'rgba(16,185,129,0.20)'
                          : 'rgba(244,63,94,0.20)'
                      }`,
                      padding: '4px 10px',
                      borderRadius: 99,
                    }}
                  >
                    {fmtPct(totalReturn.pct)}
                  </span>

                  <span
                    className="num-premium"
                    style={{
                      fontSize: 12,
                      color: C_MUTED,
                      fontWeight: 700,
                    }}
                  >
                    {returnPositive ? '+' : ''}
                    {fmtCurrency(
                      totalReturn.diff,
                    )}{' '}
                    trong kỳ
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* RANGE */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: 'var(--soft)',
            border: `1px solid ${C_BORDER}`,
            borderRadius: 99,
          }}
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              style={{
                padding: '6px 12px',
                borderRadius: 99,
                border: 'none',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                background:
                  range === r.key
                    ? 'var(--text)'
                    : 'transparent',
                color:
                  range === r.key
                    ? 'var(--bg)'
                    : C_MUTED,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="ab-error">{error}</div>
      )}

      {/* CHART */}
      <div
        style={{
          width: '100%',
          height: 320,
        }}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
        >
          <AreaChart
            data={chartData}
            margin={{
              top: 10,
              right: 5,
              left: 0,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient
                id="gradTotalAssets"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#3b82f6"
                  stopOpacity={0.22}
                />
                <stop
                  offset="100%"
                  stopColor="#3b82f6"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />

            <XAxis
              dataKey="display_date"
              tick={{
                fontSize: 11,
                fill: C_MUTED,
                fontWeight: 700,
              }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={shortFmt}
              tick={{
                fontSize: 11,
                fill: C_MUTED,
                fontWeight: 700,
              }}
              tickLine={false}
              axisLine={false}
              width={58}
            />

            <Tooltip
              content={<ChartTooltip />}
              cursor={{
                stroke:
                  'var(--border-strong)',
                strokeWidth: 1,
                strokeDasharray: '4 4',
              }}
            />

            {/* VỐN GỐC */}
            {lastSnapshot?.net_capital > 0 && (
              <ReferenceLine
                y={lastSnapshot.net_capital}
                stroke="var(--muted)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            )}

            {/* MARKET VALUE */}
            <Area
              type="linear"
              dataKey="market_value"
              stackId={undefined}
              connectNulls
              stroke="rgba(59,130,246,0.45)"
              strokeWidth={1}
              fill="rgba(59,130,246,0.06)"
              dot={false}
              activeDot={false}
              isAnimationActive
              animationDuration={500}
            />

            {/* TOTAL ASSETS */}
            <Area
              type="linear"
              dataKey="total_assets"
              stackId={undefined}
              connectNulls
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#gradTotalAssets)"
              dot={false}
              activeDot={{
                r: 5,
                fill: '#3b82f6',
                stroke: 'var(--card)',
                strokeWidth: 3,
              }}
              isAnimationActive
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* LEGEND */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        {[
          {
            color: '#3b82f6',
            label: 'Tổng tài sản',
            value: lastSnapshot
              ? fmtCurrency(
                  lastSnapshot.total_assets,
                )
              : '—',
          },
          {
            color: 'rgba(59,130,246,0.45)',
            label: 'Giá trị TT',
            value: lastSnapshot
              ? fmtCurrency(
                  lastSnapshot.market_value,
                )
              : '—',
          },
          {
            color: C_MUTED,
            label: 'Vốn gốc',
            value: lastSnapshot
              ? fmtCurrency(
                  lastSnapshot.net_capital,
                )
              : '—',
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 12,
                height: 3,
                borderRadius: 99,
                background: item.color,
              }}
            />

            <div>
              <div
                style={{
                  fontSize: 10,
                  color: C_MUTED,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                }}
              >
                {item.label}
              </div>

              <div
                className="num-premium"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C_TEXT,
                }}
              >
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div
        style={{
          fontSize: 11,
          color: C_MUTED,
          fontWeight: 700,
        }}
      >
        {snapshots.length} điểm dữ liệu ·
        Cập nhật lúc 15:10 thứ 2–6
      </div>
    </div>
  );
      }
