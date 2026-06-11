'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Search } from 'lucide-react';
import AppShellHeader from '@/components/app-shell-header';
import { supabase } from '@/lib/supabase';
import { useCompanyName } from '@/lib/hooks/use-company-name';
import { useMarketData } from '@/lib/hooks/use-market-data';

// ================= TYPES =================

type ScanTrade = {
  side?: string;
  entry_price?: number;
  exit_price?: number;
  pnl_pct?: number;
  entry_ts?: number;
  exit_ts?: number;
};

type SignalInfo = {
  type?: string;
  raw_type?: string;
  confirmed_at?: number;
  timestamp?: number;
};

type PlanInfo = {
  entry_low?: number;
  entry_high?: number;
  take_profit?: number;
  stop_loss?: number;
  profit_pct?: number;
  risk_reward?: number;
};

type ScanData = {
  symbol?: string;
  win_rate?: number;
  total_pnl_pct?: number;
  total_trades?: number;
  current_price?: number;
  price_change?: number;
  price_change_pct?: number;
  signal?: SignalInfo | null;
  plan?: PlanInfo | null;
  trades?: ScanTrade[];
};

type ScanResponse = {
  success?: boolean;
  data?: ScanData;
  error?: string;
};

// ================= FORMATTERS =================

const priceFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });

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
  padding: 12,
  background: 'var(--soft)',
  borderRadius: 18,
  border: '1px solid var(--border)',
};

const STAT_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 6,
};

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 14,
  fontWeight: 600,
  borderTop: '1px solid var(--border)',
};

// ----- thẻ Giá (như watchlist) + Tín hiệu + Kế hoạch -----

const TOP_GRID: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
};

const QUOTE_CARD: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 16,
  background: 'var(--soft)',
  borderRadius: 18,
  border: '1px solid var(--border)',
};

const QUOTE_SYMBOL: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: '0.02em',
};

const QUOTE_COMPANY: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--muted)',
};

const QUOTE_PRICE: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 900,
  marginTop: 6,
};

const SIGNAL_BOX: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 16,
  background: 'var(--soft)',
  borderRadius: 18,
  border: '1px solid var(--border)',
};

const SIGNAL_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const SIGNAL_SUB: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  marginTop: 4,
};

const PLAN_GRID: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  marginTop: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
};

const PLAN_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 6,
};

const PLAN_VALUE: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
};

// ----- style helpers (đều trả CSSProperties; dùng style={TÊN} một ngoặc) -----

const withColor = (base: React.CSSProperties, color: string): React.CSSProperties => ({
  ...base,
  color,
});

const thStyle = (i: number): React.CSSProperties => ({
  ...TH,
  textAlign: i >= 2 && i !== 3 ? 'right' : 'left',
});

const tdSide = (side?: string): React.CSSProperties => ({
  ...TD,
  fontWeight: 800,
  color: side === 'BUY' ? 'var(--green)' : side === 'SELL' ? 'var(--red)' : 'inherit',
});

const tdRight: React.CSSProperties = { ...TD, textAlign: 'right' };

const tdResult = (pnl?: number): React.CSSProperties => ({
  ...TD,
  textAlign: 'right',
  fontWeight: 800,
  color: colorFor(pnl),
});

const signalTitle = (raw?: string): React.CSSProperties => ({
  fontSize: 26,
  fontWeight: 900,
  color: raw === 'SELL' ? 'var(--red)' : 'var(--green)',
});

const quoteChangeStyle = (v?: number): React.CSSProperties => ({
  fontSize: 14,
  fontWeight: 700,
  color: colorFor(v),
});

// ================= COMPONENT =================

export default function BacktestPage() {
  const [email, setEmail] = useState('');
  const [symbolInput, setSymbolInput] = useState('GVR');
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Auth guard
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      if (!data.user) {
        window.location.href = '/';
        return;
      }
      setEmail(data.user.email ?? '');
    });
    return () => {
      mounted = false;
    };
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
        try {
          data = await res.json();
        } catch {}

        if (res.ok && data.success && data.data) {
          setScanData(data.data);
          setSymbolInput(normalized);
          return;
        }

        if (data.error) finalError = data.error;
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

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void loadScan(symbolInput);
    },
    [loadScan, symbolInput],
  );

  const handleRescan = useCallback(() => {
    void loadScan(symbolInput);
  }, [loadScan, symbolInput]);

  // ── Giá + tên công ty (theo DNSE, giống trang watchlist) ──
  const headerSymbol = scanData?.symbol ?? '';
  const companyName = useCompanyName(headerSymbol);
  const priceSymbols = useMemo(
    () => (headerSymbol ? [headerSymbol] : []),
    [headerSymbol],
  );
  const { quotes } = useMarketData(priceSymbols, Boolean(headerSymbol));
  const liveQuote = useMemo(
    () => quotes.find(q => q.symbol === headerSymbol) ?? null,
    [quotes, headerSymbol],
  );

  const price = liveQuote?.price ?? scanData?.current_price;
  const priceChange = liveQuote?.change ?? scanData?.price_change;
  const pricePct = liveQuote?.pct ?? scanData?.price_change_pct;

  const latestTrade = useMemo(() => scanData?.trades?.[0], [scanData]);

  const statCards = useMemo(
    () => [
      { label: 'Mã', value: scanData?.symbol ?? symbolInput, style: { fontSize: 22, fontWeight: 800 } as React.CSSProperties },
      { label: 'Giá hiện tại', value: fmtPrice(price), style: { fontSize: 22, fontWeight: 800 } as React.CSSProperties },
      {
        label: 'Biến động',
        value: `${fmtPrice(priceChange)} (${fmtPct(pricePct)})`,
        style: { fontSize: 18, fontWeight: 800, color: colorFor(priceChange) } as React.CSSProperties,
      },
      { label: 'Win rate', value: fmtPct(scanData?.win_rate), style: { fontSize: 22, fontWeight: 800 } as React.CSSProperties },
      {
        label: 'Tổng PnL',
        value: fmtPct(scanData?.total_pnl_pct),
        style: { fontSize: 22, fontWeight: 800, color: colorFor(scanData?.total_pnl_pct) } as React.CSSProperties,
      },
      {
        label: 'Lệnh gần nhất',
        value: latestTrade ? `${latestTrade.side ?? '—'} (${fmtPct(latestTrade.pnl_pct)})` : '—',
        style: { fontSize: 18, fontWeight: 800, color: colorFor(latestTrade?.pnl_pct) } as React.CSSProperties,
      },
    ],
    [scanData, symbolInput, latestTrade, price, priceChange, pricePct],
  );

  const signal = scanData?.signal ?? null;
  const plan = scanData?.plan ?? null;

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
        <section className="ab-premium-card" style={SEARCH_CARD}>
          <div className="ab-row-between align-center" style={SEARCH_HEAD}>
            <div style={SEARCH_TITLE}>
              <BarChart3 size={16} />
              DATA.SCAN theo mã
            </div>
            <button
              type="button"
              className="ab-btn ab-btn-primary"
              style={RESCAN_BTN}
              onClick={handleRescan}
              disabled={scanLoading}
            >
              <RefreshCw size={14} className={scanLoading ? 'spin-animation' : ''} />
              Quét lại
            </button>
          </div>

          <form onSubmit={handleSubmit} style={SEARCH_FORM}>
            <div style={INPUT_WRAP}>
              <Search size={16} style={INPUT_ICON} />
              <input
                value={symbolInput}
                onChange={e => setSymbolInput(e.target.value.toUpperCase())}
                placeholder="Nhập mã (VD: GVR, SSI, HPG...)"
                className="ab-input"
                style={INPUT_STYLE}
              />
            </div>
            <button type="submit" className="ab-btn ab-btn-primary" disabled={scanLoading}>
              {scanLoading ? 'Đang phân tích...' : 'Phân tích'}
            </button>
          </form>

          {message ? <div className="ab-error">{message}</div> : null}
        </section>

        {/* --- RESULTS --- */}
        {scanLoading ? (
          <section className="ab-premium-card" style={GRID_GAP_12}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="ab-skeleton" style={SKELETON} />
            ))}
          </section>
        ) : scanData ? (
          <section className="ab-premium-card" style={GRID_GAP_16}>

            {/* Giá + Tín hiệu */}
            <div style={TOP_GRID}>
              {/* Thẻ giá + tên công ty theo DNSE (như watchlist) */}
              <div style={QUOTE_CARD}>
                <span style={QUOTE_SYMBOL}>{scanData.symbol ?? symbolInput}</span>
                <span style={QUOTE_COMPANY}>{companyName ?? 'Cổ phiếu'}</span>
                <span className="num-premium" style={QUOTE_PRICE}>{fmtPrice(price)}</span>
                <span className="num-premium" style={quoteChangeStyle(priceChange)}>
                  {fmtPrice(priceChange)} ({fmtPct(pricePct)})
                </span>
              </div>

              {/* Tín hiệu hiện tại */}
              <div style={SIGNAL_BOX}>
                <span style={SIGNAL_LABEL}>Tín hiệu hiện tại</span>
                {signal ? (
                  <>
                    <span style={signalTitle(signal.raw_type)}>
                      {signal.type ?? signal.raw_type ?? '—'}
                    </span>
                    <span style={SIGNAL_SUB}>Xác nhận tại {fmtPrice(signal.confirmed_at)}</span>
                  </>
                ) : (
                  <span style={SIGNAL_SUB}>Chưa có tín hiệu cho mã này.</span>
                )}
              </div>
            </div>

            {/* Kế hoạch giao dịch */}
            {plan ? (
              <div>
                <div style={SIGNAL_LABEL}>Kế hoạch giao dịch</div>
                <div style={PLAN_GRID}>
                  <div>
                    <div style={PLAN_LABEL}>Vùng vào</div>
                    <div className="num-premium" style={PLAN_VALUE}>
                      {fmtPrice(plan.entry_low)} – {fmtPrice(plan.entry_high)}
                    </div>
                  </div>
                  <div>
                    <div style={PLAN_LABEL}>Mục tiêu (TP1)</div>
                    <div className="num-premium" style={withColor(PLAN_VALUE, 'var(--green)')}>
                      {fmtPrice(plan.take_profit)}
                    </div>
                  </div>
                  <div>
                    <div style={PLAN_LABEL}>Dừng lỗ</div>
                    <div className="num-premium" style={withColor(PLAN_VALUE, 'var(--red)')}>
                      {fmtPrice(plan.stop_loss)}
                    </div>
                  </div>
                  <div>
                    <div style={PLAN_LABEL}>Lợi nhuận</div>
                    <div className="num-premium" style={withColor(PLAN_VALUE, 'var(--green)')}>
                      {fmtPct(plan.profit_pct)}
                    </div>
                  </div>
                  <div>
                    <div style={PLAN_LABEL}>R:R</div>
                    <div className="num-premium" style={PLAN_VALUE}>
                      {plan.risk_reward != null ? plan.risk_reward.toFixed(2) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Stat grid */}
            <div style={STAT_GRID}>
              {statCards.map(card => (
                <div key={card.label} style={STAT_CARD}>
                  <div style={STAT_LABEL}>{card.label}</div>
                  <div className="num-premium" style={card.style}>{card.value}</div>
                </div>
              ))}
            </div>

            {/* Trade history table */}
            <div style={TABLE_WRAP}>
              <table style={TABLE}>
                <thead>
                  <tr>
                    {['Loại', 'Ngày vào', 'Giá vào', 'Ngày ra', 'Giá ra', 'Kết quả'].map((h, i) => (
                      <th key={h} style={thStyle(i)}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scanData.trades && scanData.trades.length > 0 ? (
                    scanData.trades.slice(0, 20).map((trade, idx) => (
                      <tr key={`${trade.entry_ts ?? idx}-${idx}`}>
                        <td style={tdSide(trade.side)}>{trade.side ?? '—'}</td>
                        <td style={TD}>{fmtTradeDate(trade.entry_ts)}</td>
                        <td style={tdRight} className="num-premium">{fmtPrice(trade.entry_price)}</td>
                        <td style={TD}>{fmtTradeDate(trade.exit_ts)}</td>
                        <td style={tdRight} className="num-premium">{fmtPrice(trade.exit_price)}</td>
                        <td style={tdResult(trade.pnl_pct)} className="num-premium">
                          {fmtPct(trade.pnl_pct)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={EMPTY_CELL}>
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
            <div style={EMPTY_HINT}>
              Nhập mã cổ phiếu và bấm <strong>Phân tích</strong> để xem kết quả backtest.
            </div>
          </section>
        )}

      </div>
    </main>
  );
}

// ----- style consts tách riêng để JSX dùng một ngoặc style={TÊN} -----

const SEARCH_CARD: React.CSSProperties = { display: 'grid', gap: 12 };
const SEARCH_HEAD: React.CSSProperties = { gap: 8, flexWrap: 'wrap' };
const SEARCH_TITLE: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 };
const RESCAN_BTN: React.CSSProperties = { padding: '8px 16px', fontSize: 12 };
const SEARCH_FORM: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };
const INPUT_WRAP: React.CSSProperties = { position: 'relative', flex: 1, minWidth: 220 };
const INPUT_ICON: React.CSSProperties = {
  position: 'absolute',
  left: 14,
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--muted)',
  pointerEvents: 'none',
};
const INPUT_STYLE: React.CSSProperties = { paddingLeft: 40, width: '100%' };
const GRID_GAP_12: React.CSSProperties = { display: 'grid', gap: 12 };
const GRID_GAP_16: React.CSSProperties = { display: 'grid', gap: 16 };
const SKELETON: React.CSSProperties = { height: 72, borderRadius: 18 };
const STAT_GRID: React.CSSProperties = {
  display: 'grid',
  gap: 10,
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
};
const TABLE_WRAP: React.CSSProperties = { overflowX: 'auto' };
const TABLE: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', minWidth: 680 };
const EMPTY_CELL: React.CSSProperties = { padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 14 };
const EMPTY_HINT: React.CSSProperties = { color: 'var(--muted)', fontSize: 14 };
