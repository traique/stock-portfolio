'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, CartesianGrid, Legend,
  ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';

// =========================================================
// TYPES
// =========================================================

type Snapshot = {
  snapshot_date:  string;
  total_assets:   number;
  market_value:   number;
  nav_cash:       number;
  net_capital:    number;
  total_pnl:      number;
  total_pnl_pct:  number;
  position_count: number;
};

type VnPoint = { date: string; close: number };

type ChartPoint = {
  display_date:  string;
  snapshot_date: string;
  total_assets:   number;
  nav_cash:       number;
  net_capital:    number;
  total_pnl:      number;
  total_pnl_pct:  number;
  position_count: number;
  vnindex_indexed?: number;
  nav_indexed?:     number;
};

type Range = '7d' | '30d' | '90d' | '180d' | '1y' | 'all';

type Props = { accessToken: string };

// =========================================================
// FORMATTERS
// =========================================================

const vnFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

const shortFmt = (v: number) => {
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}T`;
  if (Math.abs(v) >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)         return `${(v / 1_000).toFixed(0)}K`;
  return vnFmt.format(v);
};
const fmtCurrency = (v: number) => `${vnFmt.format(v)}₫`;
const fmtPct      = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const fmtDate     = (d: string) => { const [, m, day] = d.split('-'); return `${day}/${m}`; };
const fmtDateFull = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };
const fmtIdx      = (v: number) => `${v >= 100 ? '+' : ''}${(v - 100).toFixed(2)}%`;

// =========================================================
// CONSTANTS
// =========================================================

const RANGES: { key: Range; label: string }[] = [
  { key: '7d',  label: '7N'   },
  { key: '30d', label: '1T'   },
  { key: '90d', label: '3T'   },
  { key: '180d',label: '6T'   },
  { key: '1y',  label: '1N'   },
  { key: 'all', label: 'Tất cả' },
];

const C_GREEN  = 'var(--green)';
const C_RED    = 'var(--red)';
const C_MUTED  = 'var(--muted)';
const C_TEXT   = 'var(--text)';
const C_BORDER = 'var(--border)';
const C_VN     = '#f59e0b';

// ─── Static styles hoisted (tránh tạo object mới mỗi render) ───
const TOOLTIP_CURSOR = { stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1, strokeDasharray: '4 4' };
const AXIS_TICK = { fontSize: 11, fill: C_MUTED, fontWeight: 700 };
const VN_ACTIVE_DOT = { r: 4, fill: C_VN, stroke: 'var(--card)', strokeWidth: 2 };

// =========================================================
// TOOLTIP
// =========================================================

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPoint;
  if (!d) return null;

  const pnlPos = d.total_pnl >= 0;

  const rows = [
    { label: 'TỔNG TÀI SẢN', value: fmtCurrency(d.total_assets), color: C_TEXT, bold: true },
    { label: 'TIỀN MẶT',     value: fmtCurrency(d.nav_cash),     color: '#10b981' },
    { label: 'LÃI / LỖ',     value: `${fmtCurrency(d.total_pnl)} (${fmtPct(d.total_pnl_pct)})`, color: pnlPos ? C_GREEN : C_RED },
    { label: 'VỐN GỐC',      value: fmtCurrency(d.net_capital),  color: C_MUTED },
    ...(d.vnindex_indexed != null ? [{ label: 'VN-INDEX', value: `${d.vnindex_indexed.toFixed(1)} đ.cơ sở (${fmtIdx(d.vnindex_indexed)})`, color: C_VN }] : []),
    ...(d.nav_indexed != null ? [{ label: 'DANH MỤC', value: `${d.nav_indexed.toFixed(1)} đ.cơ sở (${fmtIdx(d.nav_indexed)})`, color: '#3b82f6' }] : []),
  ];

  return (
    <div style={ {
      background: 'var(--card)', border: '1px solid var(--border-strong)',
      borderRadius: 18, padding: '14px 16px',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      boxShadow: 'var(--shadow-strong)', minWidth: 220,
    } }>
      <div style={ { fontSize: 11, color: C_MUTED, fontWeight: 800, marginBottom: 12, letterSpacing: '0.04em' } }>
        {fmtDateFull(d.snapshot_date)}
      </div>

      <div style={ { display: 'flex', flexDirection: 'column', gap: 8 } }>
        {rows.map(item => {
          const valStyle = { fontSize: 13, fontWeight: item.bold ? 800 : 700, color: item.color };
          return (
            <div key={item.label} style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 } }>
              <span style={ { fontSize: 10, color: C_MUTED, fontWeight: 800, letterSpacing: '0.04em' } }>{item.label}</span>
              <span className="num-premium" style={valStyle}>{item.value}</span>
            </div>
          );
        })}
      </div>

      {d.position_count > 0 && (
        <div style={ { marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C_BORDER}`, fontSize: 10, color: C_MUTED, fontWeight: 700 } }>
          {d.position_count} mã đang nắm giữ
        </div>
      )}
    </div>
  );
}

// =========================================================
// MAIN COMPONENT (memo)
// =========================================================

export const PerformanceChart = memo(function PerformanceChart({ accessToken }: Props) {
  const [snapshots,   setSnapshots]   = useState<Snapshot[]>([]);
  const [vnHistory,   setVnHistory]   = useState<VnPoint[]>([]);
  const [range,       setRange]       = useState<Range>('all');
  const [loading,     setLoading]     = useState(true);
  const [showCompare, setShowCompare] = useState(true);
  const [error,       setError]       = useState('');

  // ✨ Gộp 2 fetch (snapshots + VN-Index) vào 1 effect, có AbortController.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const [snapRes, vnRes] = await Promise.all([
          fetch(`/api/portfolio/snapshots?range=${range}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch(`/api/prices/history?symbol=VNINDEX&range=${range}`, {
            cache: 'no-store',
            signal: controller.signal,
          }).catch(() => null),
        ]);

        if (!active) return;

        const snapData = await snapRes.json();
        if (!snapRes.ok) {
          setError(snapData?.error ?? 'Không tải được dữ liệu');
        } else {
          setSnapshots((snapData.snapshots ?? []).map((s: Snapshot) => ({
            ...s,
            total_assets:   Number(s.total_assets   || 0),
            market_value:   Number(s.market_value   || 0),
            nav_cash:       Number(s.nav_cash        || 0),
            net_capital:    Number(s.net_capital     || 0),
            total_pnl:      Number(s.total_pnl       || 0),
            total_pnl_pct:  Number(s.total_pnl_pct   || 0),
            position_count: Number(s.position_count  || 0),
          })));
        }

        // VN-Index optional: 404/lỗi → ẩn compare mode, không chặn snapshot.
        if (vnRes && vnRes.ok) {
          const vnData = await vnRes.json();
          if (active) setVnHistory(vnData.history ?? []);
        } else if (active) {
          setVnHistory([]);
        }
      } catch (e) {
        if (active && (e as Error).name !== 'AbortError') setError('Lỗi kết nối');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [range, accessToken]);

  // ─── Build indexed chart data ───────────────────────
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!snapshots.length) return [];

    const baseNav = snapshots[0].total_assets;
    const vnMap   = new Map(vnHistory.map(p => [p.date, p.close]));
    const baseVn  = vnMap.get(snapshots[0].snapshot_date) ?? 0;

    return snapshots.map(s => {
      const vnClose = vnMap.get(s.snapshot_date);
      return {
        display_date:    fmtDate(s.snapshot_date),
        snapshot_date:   s.snapshot_date,
        total_assets:    s.total_assets,
        nav_cash:        s.nav_cash,
        net_capital:     s.net_capital,
        total_pnl:       s.total_pnl,
        total_pnl_pct:   s.total_pnl_pct,
        position_count:  s.position_count,
        nav_indexed:     baseNav > 0 ? (s.total_assets / baseNav) * 100 : undefined,
        vnindex_indexed: (baseVn > 0 && vnClose != null) ? (vnClose / baseVn) * 100 : undefined,
      };
    });
  }, [snapshots, vnHistory]);

  const hasVnData  = vnHistory.length > 0 && chartData.some(p => p.vnindex_indexed != null);
  const firstPoint = chartData[0];
  const lastPoint  = chartData[chartData.length - 1];
  const isPositive = (lastPoint?.total_pnl ?? 0) >= 0;
  const navStroke  = isPositive ? '#3b82f6' : '#ef4444';

  const totalReturn = useMemo(() => {
    if (!firstPoint || !lastPoint) return null;
    const diff = lastPoint.total_assets - firstPoint.total_assets;
    const pct  = firstPoint.total_assets > 0 ? (diff / firstPoint.total_assets) * 100 : 0;
    return { diff, pct };
  }, [firstPoint, lastPoint]);

  const vnReturn = useMemo(() => {
    if (!hasVnData || !firstPoint?.vnindex_indexed || !lastPoint?.vnindex_indexed) return null;
    return lastPoint.vnindex_indexed - 100;
  }, [hasVnData, firstPoint, lastPoint]);

  const returnPositive = (totalReturn?.pct ?? 0) >= 0;

  const [yMin, yMax] = useMemo(() => {
    const key = (showCompare && hasVnData) ? 'nav_indexed' : 'total_assets';
    const vals = chartData.map(p => (p as any)[key]).filter(Boolean) as number[];
    if (!vals.length) return [0, 100];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (showCompare && hasVnData) {
      const vnVals = chartData.map(p => p.vnindex_indexed).filter(Boolean) as number[];
      const vnMin  = Math.min(...vnVals);
      const vnMax  = Math.max(...vnVals);
      const allMin = Math.min(min, vnMin);
      const allMax = Math.max(max, vnMax);
      const pad    = (allMax - allMin) * 0.15 || 2;
      return [Math.floor(allMin - pad), Math.ceil(allMax + pad)];
    }
    const diff = max - min;
    const pad  = diff === 0 ? min * 0.04 : diff * 0.45;
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [chartData, showCompare, hasVnData]);

  // ─── Loading / Empty ──────────────────────────
  if (loading) return (
    <div className="ab-skeleton" style={ { width: '100%', height: 330, borderRadius: 28 } } />
  );

  if (!snapshots.length) return (
    <div style={ { textAlign: 'center', padding: '48px 24px', color: C_MUTED, background: 'var(--soft)', borderRadius: 28, border: `1px solid ${C_BORDER}` } }>
      <div style={ { fontSize: 34, marginBottom: 10 } }>📈</div>
      <div style={ { fontSize: 15, color: C_TEXT, fontWeight: 800, marginBottom: 6 } }>Chưa có dữ liệu hiệu suất</div>
      <div style={ { fontSize: 13, lineHeight: 1.7 } }>Hệ thống sẽ tự động ghi nhận NAV mỗi ngày giao dịch.</div>
    </div>
  );

  const chartMargin = { top: 10, right: 4, left: showCompare && hasVnData ? 0 : -10, bottom: 0 };
  const navActiveDot = { r: 5, fill: navStroke, stroke: 'var(--card)', strokeWidth: 3 };
  const navPillStyle = {
    fontSize: 13, fontWeight: 800,
    color: returnPositive ? C_GREEN : C_RED,
    background: returnPositive ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.10)',
    border: `1px solid ${returnPositive ? 'rgba(16,185,129,0.18)' : 'rgba(244,63,94,0.18)'}`,
    padding: '5px 12px', borderRadius: 999,
  };
  const compareBtnStyle = {
    padding: '6px 14px', borderRadius: 999, border: `1px solid ${C_BORDER}`,
    background: showCompare ? 'rgba(245,158,11,0.12)' : 'var(--soft)',
    color: showCompare ? C_VN : C_MUTED,
    fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'all 0.18s',
  };

  const legendItems = [
    { color: navStroke, label: 'Tổng tài sản', value: lastPoint ? fmtCurrency(lastPoint.total_assets) : '—' },
    { color: 'rgba(255,255,255,0.45)', label: 'Vốn gốc', value: lastPoint ? fmtCurrency(lastPoint.net_capital) : '—' },
  ];

  // ─── Render ─────────────────────────────────
  return (
    <div style={ { display: 'flex', flexDirection: 'column', gap: 22 } }>

      {/* HEADER */}
      <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 } }>
        <div>
          {lastPoint && (
            <>
              <div className="num-premium" style={ { fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, lineHeight: 1.1, color: C_TEXT } }>
                {fmtCurrency(lastPoint.total_assets)}
              </div>
              {totalReturn && (
                <div style={ { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' } }>
                  <span className="num-premium" style={navPillStyle}>
                    DM {fmtPct(totalReturn.pct)}
                  </span>

                  {vnReturn != null && (
                    <span className="num-premium" style={ { fontSize: 13, fontWeight: 800, color: C_VN, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.20)', padding: '5px 12px', borderRadius: 999 } }>
                      VNI {vnReturn >= 0 ? '+' : ''}{vnReturn.toFixed(2)}%
                    </span>
                  )}

                  <span className="num-premium" style={ { fontSize: 12, fontWeight: 700, color: C_MUTED } }>
                    trong kỳ
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Controls */}
        <div style={ { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 } }>
          {hasVnData && (
            <button type="button" onClick={() => setShowCompare(p => !p)} style={compareBtnStyle}>
              So sánh VN-Index
            </button>
          )}

          <div style={ { display: 'flex', gap: 4, padding: 5, background: 'var(--soft)', border: `1px solid ${C_BORDER}`, borderRadius: 999 } }>
            {RANGES.map(r => {
              const active = range === r.key;
              const btnStyle = {
                padding: '8px 14px', borderRadius: 999, border: 'none',
                background: active ? 'var(--text)' : 'transparent',
                color: active ? 'var(--bg)' : C_MUTED,
                fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'all 0.18s ease',
              };
              return (
                <button key={r.key} type="button" onClick={() => setRange(r.key)} style={btnStyle}>
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <div className="ab-error">{error}</div>}

      {/* CHART */}
      <div style={ { width: '100%', height: 330 } }>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={chartMargin}>
            <defs>
              <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={navStroke} stopOpacity={0.18} />
                <stop offset="100%" stopColor={navStroke} stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="vnGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={C_VN} stopOpacity={0.12} />
                <stop offset="100%" stopColor={C_VN} stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />

            <XAxis dataKey="display_date" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />

            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={showCompare && hasVnData ? (v: number) => `${(v - 100).toFixed(0)}%` : shortFmt}
              tick={AXIS_TICK}
              tickLine={false} axisLine={false} width={60}
            />

            <Tooltip content={<ChartTooltip />} cursor={TOOLTIP_CURSOR} />

            {!showCompare && (lastPoint?.net_capital ?? 0) > 0 && (
              <ReferenceLine y={lastPoint!.net_capital} stroke="rgba(255,255,255,0.32)" strokeDasharray="5 5" strokeWidth={1} />
            )}

            {showCompare && hasVnData && (
              <ReferenceLine y={100} stroke="rgba(255,255,255,0.20)" strokeDasharray="5 5" strokeWidth={1} />
            )}

            {showCompare && hasVnData && (
              <Area type="monotone" dataKey="vnindex_indexed" connectNulls
                stroke={C_VN} strokeWidth={2.5}
                fill="url(#vnGradient)" dot={false}
                activeDot={VN_ACTIVE_DOT}
                isAnimationActive animationDuration={700}
                name="VN-Index"
              />
            )}

            <Area
              type="monotone"
              dataKey={showCompare && hasVnData ? 'nav_indexed' : 'total_assets'}
              connectNulls
              stroke={navStroke} strokeWidth={3.5}
              fill="url(#navGradient)" dot={false}
              activeDot={navActiveDot}
              isAnimationActive animationDuration={700}
              name="Danh mục"
            />

            {showCompare && hasVnData && (
              <Legend formatter={(value) => (
                <span style={ { fontSize: 11, fontWeight: 700, color: C_MUTED } }>{value}</span>
              )} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* LEGEND / FOOTER */}
      <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 } }>
        <div style={ { display: 'flex', gap: 22, flexWrap: 'wrap' } }>
          {legendItems.map(item => (
            <div key={item.label} style={ { display: 'flex', alignItems: 'center', gap: 8 } }>
              <div style={ { width: 14, height: 3, borderRadius: 999, background: item.color, flexShrink: 0 } } />
              <div>
                <div style={ { fontSize: 10, color: C_MUTED, fontWeight: 800, letterSpacing: '0.04em' } }>{item.label}</div>
                <div className="num-premium" style={ { fontSize: 12, fontWeight: 700, color: C_TEXT } }>{item.value}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={ { fontSize: 11, color: C_MUTED, fontWeight: 700 } }>
          {snapshots.length} điểm dữ liệu · Cập nhật lúc 15:10 thứ 2–6
        </div>
      </div>
    </div>
  );
});
