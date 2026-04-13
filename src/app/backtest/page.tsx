// src/app/backtest/page.tsx
'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { BarChart3, RefreshCw, Search, TrendingUp, AlertCircle } from 'lucide-react';
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
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN').format(value);
}

function fmtPct(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `\( {sign} \){value.toFixed(2)}%`;
}

function fmtTradeDate(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return '—';
  const d = new Date(ts * 1000);
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(d);
}

export default function BacktestPage() {
  const [email, setEmail] = useState('');
  const [symbolInput, setSymbolInput] = useState('GVR');
  const [scanData, setScanData] = useState<any>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/';
      else setEmail(data.user.email || '');
    });
  }, []);

  const loadScan = useCallback(async (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    setScanLoading(true);
    setMessage('');
    setChartData([]);

    try {
      const res = await fetch(`/api/backtest?symbol=${normalized}&timeframe=1D&limit=2000&start=1712676508`, { 
        cache: 'no-store' 
      });
      const result = await res.json();

      if (result.success && result.data) {
        setScanData(result.data);
        setSymbolInput(normalized);

        // Tạo dữ liệu giả cho chart (Equity Curve)
        const points = Array.from({ length: Math.min(50, result.data.length || 20) }, (_, i) => ({
          date: `T${i + 1}`,
          equity: 100 + Math.sin(i / 5) * 30 + (i * 2),
          pnl: Math.random() * 10 - 3,
        }));
        setChartData(points);
      } else {
        setScanData(null);
        setMessage(result.error || 'Không có dữ liệu');
      }
    } catch {
      setScanData(null);
      setMessage('Kết nối thất bại. Thử lại sau.');
    } finally {
      setScanLoading(false);
    }
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const latestTrade = scanData?.trades?.[0] || scanData?.[0];

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Backtest" isLoggedIn={Boolean(email)} email={email} currentTab="backtest" onLogout={handleLogout} />

        {/* Control Panel */}
        <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
          <div className="ab-row-between align-center" style={{ gap: 8 }}>
            <div className="ab-row-between align-center" style={{ gap: 8 }}>
              <BarChart3 size={16} />
              <strong>DATA.SCAN theo mã</strong>
            </div>
            <button type="button" className="ab-btn ab-btn-ghost" onClick={() => loadScan(symbolInput)} disabled={scanLoading}>
              <RefreshCw size={15} /> Quét lại
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); loadScan(symbolInput); }} style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
              <input 
                value={symbolInput} 
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())} 
                placeholder="GVR, HPG, VIC..." 
                className="ab-input" 
                style={{ paddingLeft: 36 }} 
              />
            </div>
            <button type="submit" className="ab-btn ab-btn-primary">Phân tích</button>
          </form>

          {message && <div className="ab-error">{message}</div>}
        </section>

        {/* Simple Canvas Chart */}
        <section className="ab-premium-card" style={{ display: 'grid', gap: 10 }}>
          <div className="ab-row-between align-center">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} />
              <strong>Biểu đồ Equity Curve (Tự vẽ)</strong>
            </div>
            <span className="ab-soft-label">{symbolInput}</span>
          </div>

          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', background: '#0f172a', padding: 16, height: 520 }}>
            {chartData.length > 0 ? (
              <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                <svg viewBox="0 0 1000 400" style={{ width: '100%', height: '100%' }}>
                  <polyline 
                    points={chartData.map((p, i) => `${i * (1000 / (chartData.length - 1))} ${400 - (p.equity - 70) * 3}`).join(' ')}
                    fill="none" 
                    stroke="#22d3ee" 
                    strokeWidth="4" 
                    strokeLinejoin="round"
                  />
                  {chartData.map((p, i) => (
                    <circle 
                      key={i}
                      cx={i * (1000 / (chartData.length - 1))} 
                      cy={400 - (p.equity - 70) * 3} 
                      r="4" 
                      fill="#22d3ee" 
                    />
                  ))}
                </svg>
                <div style={{ position: 'absolute', bottom: 10, left: 20, color: '#64748b' }}>
                  Equity Curve (giả lập - sẽ thay bằng dữ liệu thật sau)
                </div>
              </div>
            ) : scanLoading ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full" />
                  <p>Đang tải dữ liệu...</p>
                </div>
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexDirection: 'column', gap: 12 }}>
                <AlertCircle size={48} />
                <p>Nhập mã và bấm "Phân tích" để xem biểu đồ</p>
              </div>
            )}
          </div>
        </section>

        {/* Backtest Results */}
        {scanLoading ? (
          <section className="ab-premium-card"><div className="ab-soft-label">Đang tải...</div></section>
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
                <div style={{ fontSize: 20, fontWeight: 800 }}>{latestTrade?.side || '—'} · {fmtPct(latestTrade?.pnl_pct)}</div>
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
                  {(scanData.trades || scanData).slice(0, 20).map((trade: any, idx: number) => (
                    <tr key={idx} style={{ borderTop: '1px solid var(--soft-2)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 700 }}>{trade.side || '—'}</td>
                      <td style={{ padding: '10px 8px' }}>{fmtTradeDate(trade.entry_ts)}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPrice(trade.entry_price)}</td>
                      <td style={{ padding: '10px 8px' }}>{fmtTradeDate(trade.exit_ts)}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPrice(trade.exit_price)}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: (trade.pnl_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
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
            <div className="ab-soft-label">Nhập mã và bấm "Phân tích" để xem backtest.</div>
          </section>
        )}
      </div>
    </main>
  );
}
