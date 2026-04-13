// src/app/backtest/page.tsx
'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { BarChart3, RefreshCw, Search, TrendingUp, AlertCircle } from 'lucide-react';
import AppShellHeader from '@/components/app-shell-header';
import { supabase } from '@/lib/supabase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';

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
  // Giả sử API trả thêm price history nếu có, hoặc ta dùng cumulative
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
  const [scanData, setScanData] = useState<any>(null); // để linh hoạt
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [rawChartData, setRawChartData] = useState<any[]>([]);

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
    setRawChartData([]);

    try {
      const res = await fetch(`/api/backtest?symbol=${normalized}&timeframe=1D&limit=2000&start=1712676508`, { cache: 'no-store' });
      const result = await res.json();

      if (result.success && result.data) {
        setScanData(result.data);
        setSymbolInput(normalized);

        // Chuẩn bị dữ liệu cho chart (giả sử có cumulative hoặc price)
        const chartPoints = (result.data || []).map((item: any, idx: number) => ({
          index: idx,
          date: item.date || item.timestamp,
          price: item.price || item.close,
          equity: item.cumulative || (item.profit ? (item.profit + 100) : 100), // fallback
          pnl: item.profit || item.pnl_pct,
        }));
        setRawChartData(chartPoints);
      } else {
        setScanData(null);
        setMessage(result.error || 'Không có dữ liệu');
      }
    } catch (err) {
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

        {/* Control */}
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
              <input value={symbolInput} onChange={(e) => setSymbolInput(e.target.value.toUpperCase())} placeholder="GVR, HPG, VIC..." className="ab-input" style={{ paddingLeft: 36 }} />
            </div>
            <button type="submit" className="ab-btn ab-btn-primary">Phân tích</button>
          </form>

          {message && <div className="ab-error">{message}</div>}
        </section>

        {/* Self-drawn Chart - Không bị block nữa */}
        <section className="ab-premium-card" style={{ display: 'grid', gap: 10 }}>
          <div className="ab-row-between align-center">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} />
              <strong>Biểu đồ Equity & Performance (Tự vẽ)</strong>
            </div>
            <span className="ab-soft-label">{symbolInput}</span>
          </div>

          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', background: '#0f172a', padding: 16 }}>
            {rawChartData.length > 0 ? (
              <div style={{ height: 520 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rawChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip contentStyle={{ background: '#1e2937', border: 'none' }} />
                    <Legend />
                    <Line type="natural" dataKey="equity" stroke="#22d3ee" strokeWidth={3} name="Equity Curve" dot={false} />
                    <Line type="step" dataKey="pnl" stroke="#f87171" strokeWidth={2} name="PnL" dot={true} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : scanLoading ? (
              <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full" />
                  <p>Đang tải dữ liệu và vẽ chart...</p>
                </div>
              </div>
            ) : (
              <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexDirection: 'column', gap: 12 }}>
                <AlertCircle size={48} />
                <p>Nhập mã → bấm Phân tích để xem biểu đồ tự vẽ</p>
              </div>
            )}
          </div>
        </section>

        {/* Kết quả backtest (giữ nguyên) */}
        {scanLoading ? (
          <section className="ab-premium-card"><div className="ab-soft-label">Đang tải...</div></section>
        ) : scanData ? (
          <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
            {/* Summary cards + Table giữ nguyên từ file cũ của bạn */}
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

            {/* Table trades */}
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
