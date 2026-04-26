'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Search } from 'lucide-react';
import AppShellHeader from '@/components/app-shell-header';
import { supabase } from '@/lib/supabase';

// ================= TYPES =================

type ScanTrade = {
  side?:        string;
  entry_price?: number;
  exit_price?:  number;
  pnl_pct?:     number;
  entry_ts?:    number;
  exit_ts?:     number;
};

type ScanData = {
  symbol?:           string;
  win_rate?:         number;
  total_pnl_pct?:    number;
  total_trades?:     number;
  current_price?:    number;
  price_change?:     number;
  price_change_pct?: number;
  trades?:           ScanTrade[];
};

type ScanResponse = {
  success?: boolean;
  data?:    ScanData;
  error?:   string;
};

// ================= FORMATTERS =================

const priceFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const dateFormatter  = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });

const fmtPrice = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? '—' : priceFormatter.format(v);

const fmtPct = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

const fmtTradeDate = (ts?: number) => {
  if (!ts || !Number.isFinite(ts)) return '—';
  const d = new Date(ts * 1000);
  return Number.isFinite(d.getTime()) ? dateFormatter.format(d) : '—';
};

const colorFor = (v?: number | null) =>
  !v ? 'inherit' : v > 0 ? 'var(--green)' : 'var(--red)';

// ================= STATIC STYLES =================

const STAT_CARD: React.CSSProperties = {
  padding:       12,
  background:    'var(--soft)',
  borderRadius:  18,
  border:        '1px solid var(--border)',
};

const STAT_LABEL: React.CSSProperties = {
  fontSize:      11,
  fontWeight:    800,
  color:         'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom:  6,
};

const TH: React.CSSProperties = {
  textAlign:     'left',
  padding:       '10px 8px',
  fontSize:      11,
  fontWeight:    800,
  color:         'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom:  '1px solid var(--border)',
  whiteSpace:    'nowrap',
};

const TD: React.CSSProperties = {
  padding:    '10px 8px',
  fontSize:   14,
  fontWeight: 600,
  borderTop:  '1px solid var(--border)',
};

// ================= COMPONENT =================

export default function BacktestPage() {
  const [email,       setEmail]       = useState('');
  const [symbolInput, setSymbolInput] = useState('GVR');
  const [scanData,    setScanData]    = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [message,     setMessage]     = useState('');

  // Auth guard
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      if (!data.user) { window.location.href = '/'; return; }
      setEmail(data.user.email ?? '');
    });
    return () => { mounted = false; };
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  }, []);

  const loadScan = useCallback(async (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    setScanLoading(true);
    setMessage('');

    const endpoints = [
      `/api/backtest?symbol=${normalized}&timeframe=1D&limit=5000`,
      `/api/sieutinhieu/performance?symbol=${normalized}`,
    ];

    let finalError = 'Không tìm thấy dữ liệu backtest cho mã này.';

    try {
      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, { cache: 'no-store' });
        let data: ScanResponse = {};
        try { data = await res.json(); } catch {}

        if (res.ok && data.success && data.data) {
          setScanData(data.data);
          setSymbolInput(normalized);
          return;
        }

        if (data.error)  finalError = data.error;
        else if (!res.ok) finalError = `API lỗi (${res.status}).`;
      }

      setScanData(null);
      setMessage(finalError);
    } catch {
      setScanData(null);
      setMessage('Kết nối API thất bại. Vui lòng thử lại sau.');
    } finally {
      setScanLoading(false);
    }
  }, []);

  const latestTrade = useMemo(() => scanData?.trades?.[0], [scanData]);

  const statCards = useMemo(() => [
    {
      label: 'Mã',
      value: scanData?.symbol ?? symbolInput,
      style: { fontSize: 22, fontWeight: 800 } as React.CSSProperties,
    },
    {
      label: 'Giá hiện tại',
      value: fmtPrice(scanData?.current_price),
      style: { fontSize: 22, fontWeight: 800 } as React.CSSProperties,
    },
    {
      label: 'Biến động',
      value: `${fmtPrice(scanData?.price_change)} (${fmtPct(scanData?.price_change_pct)})`,
      style: { fontSize: 18, fontWeight: 800, color: colorFor(scanData?.price_change) } as React.CSSProperties,
    },
    {
      label: 'Win rate',
      value: fmtPct(scanData?.win_rate),
      style: { fontSize: 22, fontWeight: 800 } as React.CSSProperties,
    },
    {
      label: 'Tổng PnL',
      value: fmtPct(scanData?.total_pnl_pct),
      style: { fontSize: 22, fontWeight: 800, color: colorFor(scanData?.total_pnl_pct) } as React.CSSProperties,
    },
    {
      label: 'Lệnh gần nhất',
      value: latestTrade
        ? `${latestTrade.side ?? '—'} (${fmtPct(latestTrade.pnl_pct)})`
        : '—',
      style: { fontSize: 18, fontWeight: 800, color: colorFor(latestTrade?.pnl_pct) } as React.CSSProperties,
    },
  ], [scanData, symbolInput, latestTrade]);

  return (
    <main className="ab-page">
      <div className="ab-shell">

        {/* title prop removed — not in AppShellHeader Props */}
        <AppShellHeader
          isLoggedIn={Boolean(email)}
          email={email}
          currentTab="backtest"
          onLogout={handleLogout}
        />

        {/* --- SEARCH --- */}
        <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
          <div className="ab-row-between align-center" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
              <BarChart3 size={16} />
              DATA.SCAN theo mã
            </div>
            <button
              type="button"
              className="ab-btn ab-btn-primary"
              style={{ padding: '8px 16px', fontSize: 12 }}
              onClick={() => void loadScan(symbolInput)}
              disabled={scanLoading}
            >
              <RefreshCw size={14} className={scanLoading ? 'spin-animation' : ''} />
              Quét lại
            </button>
          </div>

          <form
            onSubmit={e => { e.preventDefault(); void loadScan(symbolInput); }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}
              />
              <input
                value={symbolInput}
                onChange={e => setSymbolInput(e.target.value.toUpperCase())}
                placeholder="Nhập mã (VD: GVR, SSI, HPG...)"
                className="ab-input"
                style={{ paddingLeft: 40, width: '100%' }}
              />
            </div>
            <button type="submit" className="ab-btn ab-btn-primary" disabled={scanLoading}>
              {scanLoading ? 'Đang phân tích...' : 'Phân tích'}
            </button>
          </form>

          {message && <div className="ab-error">{message}</div>}
        </section>

        {/* --- RESULTS --- */}
        {scanLoading ? (
          <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="ab-skeleton" style={{ height: 72, borderRadius: 18 }} />
            ))}
          </section>

        ) : scanData ? (
          <section className="ab-premium-card" style={{ display: 'grid', gap: 16 }}>

            {/* Stat grid */}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {statCards.map(card => (
                <div key={card.label} style={STAT_CARD}>
                  <div style={STAT_LABEL}>{card.label}</div>
                  <div className="num-premium" style={card.style}>{card.value}</div>
                </div>
              ))}
            </div>

            {/* Trade history table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                <thead>
                  <tr>
                    {['Loại', 'Ngày vào', 'Giá vào', 'Ngày ra', 'Giá ra', 'Kết quả'].map((h, i) => (
                      <th key={h} style={{ ...TH, textAlign: i >= 2 && i !== 3 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scanData.trades && scanData.trades.length > 0 ? (
                    scanData.trades.slice(0, 20).map((trade, idx) => (
                      <tr key={`${trade.entry_ts ?? idx}-${idx}`}>
                        <td style={{ ...TD, fontWeight: 800, color: trade.side === 'BUY' ? 'var(--green)' : trade.side === 'SELL' ? 'var(--red)' : 'inherit' }}>
                          {trade.side ?? '—'}
                        </td>
                        <td style={TD}>{fmtTradeDate(trade.entry_ts)}</td>
                        <td style={{ ...TD, textAlign: 'right' }} className="num-premium">{fmtPrice(trade.entry_price)}</td>
                        <td style={TD}>{fmtTradeDate(trade.exit_ts)}</td>
                        <td style={{ ...TD, textAlign: 'right' }} className="num-premium">{fmtPrice(trade.exit_price)}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: colorFor(trade.pnl_pct) }} className="num-premium">
                          {fmtPct(trade.pnl_pct)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                        Không có dữ liệu lịch sử lệnh.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </section>

        ) : (
          <section className="ab-premium-card">
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>
              Nhập mã cổ phiếu và bấm <strong>Phân tích</strong> để xem kết quả backtest.
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
