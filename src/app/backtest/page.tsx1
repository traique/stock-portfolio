'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { BarChart3, RefreshCw, Search } from 'lucide-react';
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
  // Bổ sung các trường giá để render lên UI
  current_price?: number;
  price_change?: number;
  price_change_pct?: number;
  trades?: ScanTrade[];
};

type ScanResponse = {
  success?: boolean;
  data?: ScanData;
  error?: string;
};

// TỐI ƯU: Đưa các hàm Formatter ra ngoài để tránh re-render tốn bộ nhớ
const priceFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });

function fmtPrice(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return priceFormatter.format(value);
}

function fmtPct(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function fmtTradeDate(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return '—';
  const d = new Date(ts * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return dateFormatter.format(d);
}

export default function BacktestPage() {
  const [email, setEmail] = useState('');
  const [symbolInput, setSymbolInput] = useState('GVR');
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = '/';
        return;
      }
      setEmail(data.user.email || '');
    });
  }, []);

  const loadScan = useCallback(async (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    setScanLoading(true);
    setMessage('');

    try {
      // Đã bỏ cứng start=... để dùng default từ backend
      const endpoints = [
        `/api/backtest?symbol=${normalized}&timeframe=1D&limit=5000`,
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
          return; // Thành công thì thoát vòng lặp ngay
        }

        if (data.error) finalError = data.error;
        else if (!response.ok) finalError = `API lỗi (${response.status}).`;
      }

      setScanData(null);
      setMessage(finalError);
    } catch {
      setScanData(null);
      setMessage('Kết nối API thất bại (network/CORS). Vui lòng thử lại sau.');
    } finally {
      setScanLoading(false);
    }
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const latestTrade = useMemo(() => scanData?.trades?.[0], [scanData]);

  // Logic màu sắc cho % thay đổi giá
  const getChangeColor = (val?: number) => {
    if (!val) return 'inherit';
    return val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--yellow)';
  };

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

        <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
          <div className="ab-row-between align-center" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="ab-row-between align-center" style={{ gap: 8 }}>
              <BarChart3 size={16} />
              <strong>DATA.SCAN theo mã</strong>
            </div>
            <button type="button" className="ab-btn ab-btn-ghost" onClick={() => void loadScan(symbolInput)} disabled={scanLoading}>
              <RefreshCw size={15} className={scanLoading ? 'spin-animation' : ''} /> Quét lại
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadScan(symbolInput);
            }}
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
              />
            </div>
            <button type="submit" className="ab-btn ab-btn-primary" disabled={scanLoading}>
              Phân tích
            </button>
          </form>

          {message ? <div className="ab-error">{message}</div> : null}
        </section>

        {scanLoading ? (
          <section className="ab-premium-card">
            <div className="ab-soft-label">Đang tải dữ liệu backtest...</div>
          </section>
        ) : scanData ? (
          <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
            {/* TỐI ƯU UI: Bổ sung thẻ hiển thị Giá và Biến động */}
            <div className="ab-summary-grid premium-summary-grid compact-top-grid" style={{ gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Mã</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{scanData.symbol || symbolInput}</div>
              </article>
              
              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Giá hiện tại</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtPrice(scanData.current_price)}</div>
              </article>

              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Biến động</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: getChangeColor(scanData.price_change) }}>
                  {fmtPrice(scanData.price_change)} ({fmtPct(scanData.price_change_pct)})
                </div>
              </article>

              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Win rate</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtPct(scanData.win_rate)}</div>
              </article>

              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Tổng PnL</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: (scanData.total_pnl_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {fmtPct(scanData.total_pnl_pct)}
                </div>
              </article>

              <article className="ab-premium-card" style={{ padding: 12 }}>
                <div className="ab-soft-label">Lệnh gần nhất</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  {latestTrade?.side || '—'} <span style={{ color: (latestTrade?.pnl_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>({fmtPct(latestTrade?.pnl_pct)})</span>
                </div>
              </article>
            </div>

            <div style={{ overflowX: 'auto', marginTop: 8 }}>
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
                  {(scanData.trades || []).slice(0, 20).map((trade, idx) => {
                    const isWin = (trade.pnl_pct || 0) >= 0;
                    return (
                      <tr key={`${trade.entry_ts || idx}-${idx}`} style={{ borderTop: '1px solid var(--soft-2)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 700, color: trade.side === 'BUY' ? 'var(--green)' : trade.side === 'SELL' ? 'var(--red)' : 'inherit' }}>
                          {trade.side || '—'}
                        </td>
                        <td style={{ padding: '10px 8px' }}>{fmtTradeDate(trade.entry_ts)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPrice(trade.entry_price)}</td>
                        <td style={{ padding: '10px 8px' }}>{fmtTradeDate(trade.exit_ts)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPrice(trade.exit_price)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: isWin ? 'var(--green)' : 'var(--red)' }}>
                          {fmtPct(trade.pnl_pct)}
                        </td>
                      </tr>
                    );
                  })}
                  {!(scanData.trades?.length) && (
                    <tr>
                      <td colSpan={6} style={{ padding: '16px', textAlign: 'center' }} className="ab-soft-label">
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
            <div className="ab-soft-label">Nhập mã cổ phiếu và bấm "Phân tích" để xem backtest.</div>
          </section>
        )}
      </div>
    </main>
  );
}
