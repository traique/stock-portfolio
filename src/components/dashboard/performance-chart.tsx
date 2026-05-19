'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

type Range =
  | '7d'
  | '30d'
  | '90d'
  | '180d'
  | '1y'
  | 'all';

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

const fmtCurrency = (v: number) =>
  `${vnFmt.format(v)}₫`;

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

function ChartTooltip({
  active,
  payload,
}: any) {
  if (!active || !payload?.length) {
    return null;
  }

  const d = payload[0]?.payload as Snapshot;

  if (!d) return null;

  const pnlPositive = d.total_pnl >= 0;

  return (
    <div
      style={{
        background: 'var(--card)',
        border:
          '1px solid var(--border-strong)',
        borderRadius: 18,
        padding: '14px 16px',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: 'var(--shadow-strong)',
        minWidth: 220,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: C_MUTED,
          fontWeight: 800,
          marginBottom: 12,
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
            value: `${fmtCurrency(
              d.total_pnl,
            )} (${fmtPct(d.total_pnl_pct)})`,
            color: pnlPositive
              ? C_GREEN
              : C_RED,
          },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
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
              {item.label}
            </span>

            <span
              className="num-premium"
              style={{
                fontSize: 13,
                fontWeight: item.bold
                  ? 800
                  : 700,
                color: item.color,
              }}
            >
              {item.value}
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

export function PerformanceChart({
  accessToken,
}: Props) {
  const [snapshots, setSnapshots] =
    useState<Snapshot[]>([]);

  const [range, setRange] =
    useState<Range>('all');

  const [loading, setLoading] =
    useState(true);

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
            data?.error ??
              'Không tải được dữ liệu',
          );
          return;
        }

        const normalized = (
          data.snapshots ?? []
        ).map((s: Snapshot) => ({
          ...s,
          total_assets: Number(
            s.total_assets || 0,
          ),
          market_value: Number(
            s.market_value || 0,
          ),
          nav_cash: Number(s.nav_cash || 0),
          net_capital: Number(
            s.net_capital || 0,
          ),
          total_pnl: Number(s.total_pnl || 0),
          total_pnl_pct: Number(
            s.total_pnl_pct || 0,
          ),
          position_count: Number(
            s.position_count || 0,
          ),
        }));

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
  // DATA
  // =========================================================

  const chartData = useMemo(() => {
    return snapshots.map((s) => ({
      ...s,
      display_date: fmtDate(
        s.snapshot_date,
      ),
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
        ? (diff /
            firstSnapshot.total_assets) *
          100
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
  // Focus only NAV for premium visual
  // =========================================================

  const yMin = useMemo(() => {
    if (!snapshots.length) return 0;

    const values = snapshots.map(
      (s) => s.total_assets,
    );

    const min = Math.min(...values);
    const max = Math.max(...values);

    const diff = max - min;

    const padding =
      diff === 0
        ? min * 0.04
        : diff * 0.45;

    return Math.floor(min - padding);
  }, [snapshots]);

  const yMax = useMemo(() => {
    if (!snapshots.length) return 0;

    const values = snapshots.map(
      (s) => s.total_assets,
    );

    const min = Math.min(...values);
    const max = Math.max(...values);

    const diff = max - min;

    const padding =
      diff === 0
        ? max * 0.04
        : diff * 0.45;

    return Math.ceil(max + padding);
  }, [snapshots]);

  // =========================================================
  // EMPTY
  // =========================================================

  if (loading) {
    return (
      <div
        className="ab-skeleton"
        style={{
          width: '100%',
          height: 320,
          borderRadius: 24,
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
          borderRadius: 24,
          border: `1px solid ${C_BORDER}`,
        }}
      >
        <div
          style={{
            fontSize: 34,
            marginBottom: 10,
          }}
        >
          📈
        </div>

        <div
          style={{
            fontSize: 15,
            color: C_TEXT,
            fontWeight: 800,
            marginBottom: 6,
          }}
        >
          Chưa có dữ liệu hiệu suất
        </div>

        <div
          style={{
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          Hệ thống sẽ tự động ghi nhận NAV
          mỗi ngày giao dịch.
        </div>
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
        gap: 22,
      }}
    >
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 14,
        }}
      >
        <div>
          {lastSnapshot && (
            <>
              <div
                className="num-premium"
                style={{
                  fontSize:
                    'clamp(24px,4vw,36px)',
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
                    marginTop: 8,
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
                          ? 'rgba(16,185,129,0.18)'
                          : 'rgba(244,63,94,0.18)'
                      }`,
                      padding: '5px 12px',
                      borderRadius: 999,
                    }}
                  >
                    {fmtPct(totalReturn.pct)}
                  </span>

                  <span
                    className="num-premium"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: C_MUTED,
                    }}
                  >
                    {returnPositive
                      ? '+'
                      : ''}
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
            padding: 5,
            background: 'var(--soft)',
            border: `1px solid ${C_BORDER}`,
            borderRadius: 999,
          }}
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: 'none',
                background:
                  range === r.key
                    ? 'var(--text)'
                    : 'transparent',
                color:
                  range === r.key
                    ? 'var(--bg)'
                    : C_MUTED,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                transition:
                  'all 0.18s ease',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="ab-error">
          {error}
        </div>
      )}

      {/* =====================================================
          CHART
      ===================================================== */}

      <div
        style={{
          width: '100%',
          height: 330,
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
              right: 2,
              left: -10,
              bottom: 0,
            }}
          >
            {/* =================================================
                GRADIENTS
            ================================================= */}

            <defs>
              <linearGradient
                id="navGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="#3b82f6"
                  stopOpacity={0.14}
                />

                <stop
                  offset="100%"
                  stopColor="#3b82f6"
                  stopOpacity={0.01}
                />
              </linearGradient>
            </defs>

            {/* =================================================
                GRID
            ================================================= */}

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />

            {/* =================================================
                X AXIS
            ================================================= */}

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

            {/* =================================================
                Y AXIS
            ================================================= */}

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
              width={60}
            />

            {/* =================================================
                TOOLTIP
            ================================================= */}

            <Tooltip
              content={<ChartTooltip />}
              cursor={{
                stroke:
                  'rgba(255,255,255,0.14)',
                strokeWidth: 1,
                strokeDasharray: '4 4',
              }}
            />

            {/* =================================================
                NET CAPITAL
            ================================================= */}

            {lastSnapshot?.net_capital >
              0 && (
              <ReferenceLine
                y={
                  lastSnapshot.net_capital
                }
                stroke="rgba(255,255,255,0.35)"
                strokeDasharray="5 5"
                strokeWidth={1}
              />
            )}

            {/* =================================================
                MARKET VALUE
            ================================================= */}

            <Area
              type="monotone"
              dataKey="market_value"
              connectNulls
              stroke="rgba(96,165,250,0.28)"
              strokeWidth={1.3}
              fillOpacity={0}
              dot={false}
              activeDot={false}
              isAnimationActive
              animationDuration={500}
            />

            {/* =================================================
                TOTAL ASSETS
            ================================================= */}

            <Area
              type="monotone"
              dataKey="total_assets"
              connectNulls
              stroke="#3b82f6"
              strokeWidth={3.5}
              fill="url(#navGradient)"
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

      {/* =====================================================
          LEGEND
      ===================================================== */}

      <div
        style={{
          display: 'flex',
          gap: 22,
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
            color:
              'rgba(96,165,250,0.40)',
            label: 'Giá trị TT',
            value: lastSnapshot
              ? fmtCurrency(
                  lastSnapshot.market_value,
                )
              : '—',
          },
          {
            color:
              'rgba(255,255,255,0.45)',
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
                width: 14,
                height: 3,
                borderRadius: 999,
                background: item.color,
                flexShrink: 0,
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

      {/* =====================================================
          FOOTER
      ===================================================== */}

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
