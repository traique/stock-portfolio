'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts';

// =========================================================
// TYPES
// =========================================================

type Snapshot = {
  snapshot_date: string;
  total_assets:  number;
  market_value:  number;
  nav_cash:      number;
  net_capital:   number;
  total_pnl:     number;
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

const vnFmt    = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const shortFmt = (v: number) => {
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}T`;
  if (Math.abs(v) >= 1_000_000)     return `${(v / 1_000_000).toFixed(0)}M`;
  if (Math.abs(v) >= 1_000)         return `${(v / 1_000).toFixed(0)}K`;
  return vnFmt.format(v);
};
const fmtCurrency = (v: number) => vnFmt.format(v) + '₫';
const fmtPct      = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const fmtDate     = (d: string) => {
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
  { key: '7d',   label: '7N'  },
  { key: '30d',  label: '1T'  },
  { key: '90d',  label: '3T'  },
  { key: '180d', label: '6T'  },
  { key: '1y',   label: '1N'  },
  { key: 'all',  label: 'Tất cả' },
];

const C_GREEN  = 'var(--green)';
const C_RED    = 'var(--red)';
const C_MUTED  = 'var(--muted)';
const C_TEXT   = 'var(--text)';
const C_BORDER = 'var(--border)';

// =========================================================
// CUSTOM TOOLTIP
// =========================================================

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as Snapshot & { display_date: string };
  if (!d) return null;

  const pnlPos = d.total_pnl >= 0;

  return (
    <div style={{
      background:           'var(--card)',
      border:               '1px solid var(--border-strong)',
      borderRadius:         16,
      padding:              '12px 16px',
      backdropFilter:       'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      boxShadow:            'var(--shadow-strong)',
      minWidth:             200,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C_MUTED, marginBottom: 10, letterSpacing: '0.04em' }}>
        {fmtDateFull(d.snapshot_date)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { label: 'TỔNG TÀI SẢN', value: fmtCurrency(d.total_assets),   color: C_TEXT,              bold: true },
          { label: 'THỊ TRƯỜNG',   value: fmtCurrency(d.market_value),   color: '#3b82f6'                       },
          { label: 'TIỀN MẶT',     value: fmtCurrency(d.nav_cash),       color: '#10b981'                       },
          { label: 'LÃI / LỖ',     value: `${fmtCurrency(d.total_pnl)} (${fmtPct(d.total_pnl_pct)})`,
            color: pnlPos ? C_GREEN : C_RED },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C_MUTED, letterSpacing: '0.04em' }}>{row.label}</span>
            <span className="num-premium" style={{ fontSize: 13, fontWeight: row.bold ? 800 : 700, color: row.color }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {d.position_count > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C_BORDER}`, fontSize: 10, color: C_MUTED, fontWeight: 700 }}>
          {d.position_count} mã đang nắm giữ
        </div>
      )}
    </div>
  );
}

// =========================================================
// MAIN COMPONENT
// =========================================================

export function PerformanceChart({ accessToken }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [range,     setRange]     = useState<Range>('90d');
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  const fetchSnapshots = useCallback(async (r: Range) => {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/portfolio/snapshots?range=${r}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache:   'no-store',
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? 'Không tải được lịch sử'); return; }
      setSnapshots(data.snapshots ?? []);
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { fetchSnapshots(range); }, [range, fetchSnapshots]);

  // ---- Derived chart data ----
  const chartData = useMemo(() =>
    snapshots.map(s => ({ ...s, display_date: fmtDate(s.snapshot_date) })),
  [snapshots]);

  const firstSnapshot = snapshots[0];
  const lastSnapshot  = snapshots[snapshots.length - 1];

  const totalReturn = useMemo(() => {
    if (!firstSnapshot || !lastSnapshot) return null;
    const diff = lastSnapshot.total_assets - firstSnapshot.total_assets;
    const pct  = firstSnapshot.total_assets > 0
      ? (diff / firstSnapshot.total_assets) * 100 : 0;
    return { diff, pct };
  }, [firstSnapshot, lastSnapshot]);

  const netCapitalLine = lastSnapshot?.net_capital ?? 0;

  const yMin = useMemo(() => {
    if (!snapshots.length) return 0;
    const min = Math.min(...snapshots.map(s => Math.min(s.total_assets, s.net_capital)));
    return Math.floor(min * 0.97);
  }, [snapshots]);

  const yMax = useMemo(() => {
    if (!snapshots.length) return 0;
    const max = Math.max(...snapshots.map(s => s.total_assets));
    return Math.ceil(max * 1.03);
  }, [snapshots]);

  const returnPositive = (totalReturn?.pct ?? 0) >= 0;

  // =========================================================
  // SKELETON
  // =========================================================

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {RANGES.map(r => (
            <div key={r.key} className="ab-skeleton" style={{ width: 40, height: 32, borderRadius: 99 }} />
          ))}
        </div>
        <div className="ab-skeleton" style={{ width: '100%', height: 280, borderRadius: 20 }} />
      </div>
    );
  }

  // =========================================================
  // EMPTY STATE
  // =========================================================

  if (!loading && !snapshots.length) {
    return (
      <div style={{
        textAlign:    'center',
        padding:      '48px 24px',
        color:        C_MUTED,
        background:   'var(--soft)',
        borderRadius: 20,
        border:       `1px solid ${C_BORDER}`,
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: C_TEXT, marginBottom: 6 }}>
          Chưa có dữ liệu hiệu suất
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          Hệ thống sẽ tự động ghi lại tổng tài sản lúc <strong>15:10</strong> mỗi ngày thứ 2 → thứ 6.<br />
          Biểu đồ sẽ hiển thị sau ngày giao dịch đầu tiên.
        </div>
      </div>
    );
  }

  // =========================================================
  // CHART
  // =========================================================

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ---- HEADER STATS ---- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>

        {/* Current value + return */}
        <div>
          {lastSnapshot && (
            <>
              <div className="num-premium" style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 800, lineHeight: 1.1, color: C_TEXT }}>
                {fmtCurrency(lastSnapshot.total_assets)}
              </div>
              {totalReturn && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="num-premium" style={{
                    fontSize: 13, fontWeight: 800,
                    color:      returnPositive ? C_GREEN : C_RED,
                    background: returnPositive ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.10)',
                    border:     `1px solid ${returnPositive ? 'rgba(16,185,129,0.20)' : 'rgba(244,63,94,0.20)'}`,
                    padding:    '4px 10px', borderRadius: 99,
                  }}>
                    {fmtPct(totalReturn.pct)}
                  </span>
                  <span className="num-premium" style={{ fontSize: 12, color: C_MUTED, fontWeight: 700 }}>
                    {returnPositive ? '+' : ''}{fmtCurrency(totalReturn.diff)} trong kỳ
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Range selector */}
        <div style={{
          display:      'flex',
          gap:          4,
          padding:      4,
          background:   'var(--soft)',
          border:       `1px solid ${C_BORDER}`,
          borderRadius: 99,
          flexShrink:   0,
        }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              style={{
                padding:      '6px 12px',
                borderRadius: 99,
                border:       'none',
                fontSize:     12,
                fontWeight:   800,
                cursor:       'pointer',
                letterSpacing:'0.02em',
                transition:   'all 0.15s',
                background:   range === r.key ? 'var(--text)' : 'transparent',
                color:        range === r.key ? 'var(--bg)'   : C_MUTED,
                boxShadow:    range === r.key ? 'var(--shadow-soft)' : 'none',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="ab-error">{error}</div>}

      {/* ---- RECHARTS AREA CHART ---- */}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              {/* Total assets gradient — primary line */}
              <linearGradient id="gradTotalAssets" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
              {/* Market value gradient */}
              <linearGradient id="gradMarketValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />

            <XAxis
              dataKey="display_date"
              tick={{ fontSize: 11, fill: C_MUTED, fontWeight: 700 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />

            <YAxis
              tickFormatter={shortFmt}
              tick={{ fontSize: 11, fill: C_MUTED, fontWeight: 700 }}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={[yMin, yMax]}
            />

            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />

            {/* Net capital baseline — dashed reference line */}
            {netCapitalLine > 0 && (
              <ReferenceLine
                y={netCapitalLine}
                stroke="var(--muted)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value:    'VỐN',
                  position: 'insideTopRight',
                  fontSize: 10,
                  fill:     C_MUTED,
                  fontWeight: 800,
                }}
              />
            )}

            {/* Market value — secondary area (behind) */}
            <Area
              type="monotone"
              dataKey="market_value"
              stroke="#3b82f6"
              strokeWidth={0}
              fill="url(#gradMarketValue)"
              dot={false}
              activeDot={false}
              isAnimationActive={true}
              animationDuration={600}
            />

            {/* Total assets — primary line */}
            <Area
              type="monotone"
              dataKey="total_assets"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#gradTotalAssets)"
              dot={false}
              activeDot={{
                r:           5,
                fill:        '#3b82f6',
                stroke:      'var(--card)',
                strokeWidth: 3,
              }}
              isAnimationActive={true}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ---- LEGEND ---- */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {[
          { color: '#3b82f6', label: 'Tổng tài sản', value: lastSnapshot ? fmtCurrency(lastSnapshot.total_assets) : '—' },
          { color: 'rgba(59,130,246,0.45)', label: 'Giá trị TT',  value: lastSnapshot ? fmtCurrency(lastSnapshot.market_value) : '—' },
          { color: C_MUTED,  label: 'Vốn gốc',     value: lastSnapshot ? fmtCurrency(lastSnapshot.net_capital) : '—', dashed: true },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width:        item.dashed ? 16 : 12,
              height:       item.dashed ? 2  : 3,
              borderRadius: 99,
              background:   item.color,
              borderTop:    item.dashed ? `2px dashed ${item.color}` : 'none',
              flexShrink:   0,
            }} />
            <div>
              <div style={{ fontSize: 10, color: C_MUTED, fontWeight: 800, letterSpacing: '0.04em' }}>{item.label}</div>
              <div className="num-premium" style={{ fontSize: 12, fontWeight: 700, color: C_TEXT }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ---- SNAPSHOT COUNT ---- */}
      <div style={{ fontSize: 11, color: C_MUTED, fontWeight: 700 }}>
        {snapshots.length} điểm dữ liệu · Cập nhật lúc 15:10 thứ 2–6
      </div>
    </div>
  );
}
