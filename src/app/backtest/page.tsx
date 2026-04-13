// src/app/backtest/page.tsx
'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { BarChart3, RefreshCw, Search, TrendingUp } from 'lucide-react';
import AppShellHeader from '@/components/app-shell-header';
import { supabase } from '@/lib/supabase';

type ScanTrade = {
  side?: string;
  entry_price?: number;
  exit_price?: number;
  pnl_pct?: number;
  entry_ts?: number;
  exit_ts?: number;
};

type ScanData = {
  symbol?: string;
  win_rate?: number;
  total_pnl_pct?: number;
  total_trades?: number;
  trades?: ScanTrade[];
};

type ScanResponse = {
  success?: boolean;
  data?: ScanData;
  error?: string;
};

function fmtPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 20 }).format(value);
}

function fmtPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `\( {sign} \){value.toFixed(2)}%`;
}

function fmtTradeDate(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return '—';
  const d = new Date(ts * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { 
    day: '2-digit', 
    month: '2-digit', 
    year: '2-digit' 
  }).format(d);
}

export default function BacktestPage() {
  const [email, setEmail] = useState('');
  const [symbolInput, setSymbolInput] = useState('GVR');
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) {
        window.location.href = '/';
        return;
      }
      setEmail(user.email || '');
    });
  }, []);

  const loadScan = useCallback(async (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    setScanLoading(true);
    setMessage('');

    try {
      const endpoints = [
        `/api/backtest?symbol=${normalized}&timeframe=1D&limit=5000&start=1712676508`,
        `/api/sieutinhieu/performance?symbol=${normalized}`,
      ];

      let finalError = 'Không tìm thấy dữ liệu backtest cho mã này.';

      for (const endpoint of endpoints) {
        const response = await fetch(endpoint, { cache: 'no-store' });
        const raw = await response.text();
        let data: ScanResponse = {};
        try {
          data = raw ? (JSON.parse(raw) as ScanResponse) : {};
        } catch {
          data = {};
        }

        if (response.ok && data.success && data.data) {
          setScanData(data.data);
          setSymbolInput(normalized);
          return;
        }

        if (data.error) finalError = data.error;
        else if (!response.ok) finalError = `API backtest lỗi (${response.status}).`;
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

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const latestTrade = useMemo(() => scanData?.trades?.[0], [scanData]);

  // TradingView Chart URL (rất ổn định)
  const tvChartUrl = useMemo(() => {
    const symbol = symbolInput.trim().toUpperCase() || 'HPG';
    return `https://www.tradingview.com/widgetembed/?symbol=HOSE:${symbol}&interval=D&theme=dark&style=1&locale=vi&toolbarbg=f1f3f6&enablepublishing=false&hideideas=1&studies_overrides=%7B%7D&hide_top_toolbar=0`;
  }, [symbolInput]);

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader
          title="Backtest"
          isLoggedIn={Boolean(email)}
          email={email}
          currentTab="backtest"
          onLogout={handleLogout}
        />

        {/* Control */}
        <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
          <div className="ab-row-between align-center" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="ab-row-between align-center" style={{ gap: 8 }}>
              <BarChart3 size={16} />
              <strong>DATA.SCAN theo mã</strong>
            </div>
            <button 
              type="button" 
              className="ab-btn ab-btn-ghost" 
              onClick={() => void loadScan(symbolInput)}
              disabled={scanLoading}
            >
              <RefreshCw size={15} /> Quét lại
            </button>
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); void loadScan(symbolInput); }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
              <input
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                placeholder="Nhập mã (VD: GVR, SSI, HPG...)"
                className="ab-input"
                style={{ paddingLeft: 36 }}
                disabled={scanLoading}
              />
            </div>
            <button 
              type="submit" 
              className="ab-btn ab-btn-primary"
              disabled={scanLoading}
            >
              Phân tích
            </button>
          </form>

          {message && <div className="ab-error">{message}</div>}
        </section>

        {/* TradingView Chart - Không còn "Connecting..." nữa */}
        <section className="ab-premium-card" style={{ display: 'grid', gap: 10 }}>
          <div className="ab-row-between align-center">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} />
              <strong>Biểu đồ kỹ thuật (TradingView)</strong>
            </div>
            <span className="ab-soft-label">{symbolInput.trim().toUpperCase() || 'HPG'}</span>
          </div>
          
          <div style={{ 
            borderRadius: 16, 
            overflow: 'hidden', 
            border: '1px solid var(--border)',
            background: '#0f172a'
          }}>
            {symbolInput.trim() ? (
              <iframe
                src={tvChartUrl}
                title="TradingView Chart"
                style={{ 
                  width: '100%', 
                  height: 520, 
                  border: 0, 
                  display: 'block' 
                }}
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Nhập mã và bấm "Phân tích" để xem biểu đồ
              </div>
            )}
          </div>
        </section>

        {/* Backtest Results */}
        {scanLoading ? (
          <section className="ab-premium-card">
            <div className="ab-soft-label">Đang tải dữ liệu backtest...</div>
          </section>
        ) : scanData ? (
          <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
            <div className="ab-summary-grid premium-summary-grid compact-top-grid" style={{ gap: 10 }}>
              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Mã</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{scanData.symbol || symbolInput}</div>
              </article>
              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Win rate</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{fmtPct(scanData.win_rate)}</div>
              </article>
              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Tổng PnL</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{fmtPct(scanData.total_pnl_pct)}</div>
              </article>
              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Lệnh gần nhất</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {latestTrade?.side || '—'} · {fmtPct(latestTrade?.pnl_pct)}
                </div>
              </article>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>Loại</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>Ngày vào</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>Giá vào</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>Ngày ra</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>Giá ra</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>Kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {(scanData.trades || []).slice(0, 20).map((trade, idx) => (
                    <tr 
                      key={`\( {trade.entry_ts || idx}- \){idx}`} 
                      style={{ borderTop: '1px solid var(--soft-2)' }}
                    >
                      <td style={{ padding: '10px 8px', fontWeight: 700 }}>{trade.side || '—'}</td>
                      <td style={{ padding: '10px 8px' }}>{fmtTradeDate(trade.entry_ts)}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPrice(trade.entry_price)}</td>
                      <td style={{ padding: '10px 8px' }}>{fmtTradeDate(trade.exit_ts)}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPrice(trade.exit_price)}</td>
                      <td style={{ 
                        padding: '10px 8px', 
                        textAlign: 'right', 
                        fontWeight: 700, 
                        color: (trade.pnl_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)' 
                      }}>
                        {fmtPct(trade.pnl_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="ab-premium-card">
            <div className="ab-soft-label">
              Nhập mã cổ phiếu và bấm "Phân tích" để xem backtest.
            </div>
          </section>
        )}
      </div>
    </main>
  );
            }
