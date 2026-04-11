'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, RefreshCw } from 'lucide-react';
import AppShellHeader from '@/components/app-shell-header';
import { supabase } from '@/lib/supabase';

type SignalType = 'BUY' | 'SELL';

type LiveSignal = {
  symbol?: string;
  signal_type?: string;
  price?: number | null;
  trading_value?: number | null;
  timestamp?: string | null;
  created_at?: string | null;
  ts?: number | null;
};

type LiveResponse = {
  signals?: LiveSignal[];
  error?: string;
  updatedAt?: string;
  provider?: string;
  count?: number;
};

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
  data?: ScanData;
  error?: string;
};

function fmtPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 20 }).format(value);
}

function fmtMoney(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function fmtPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function fmtDate(signal: LiveSignal) {
  if (signal.timestamp) {
    const d = new Date(signal.timestamp);
    if (Number.isFinite(d.getTime())) return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(d);
  }
  if (signal.created_at) {
    const d = new Date(signal.created_at);
    if (Number.isFinite(d.getTime())) return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(d);
  }
  if (signal.ts && Number.isFinite(signal.ts)) {
    const d = new Date(Number(signal.ts) * 1000);
    if (Number.isFinite(d.getTime())) return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(d);
  }
  return '—';
}

function fmtTradeDate(ts?: number) {
  if (!ts || !Number.isFinite(ts)) return '—';
  const d = new Date(ts * 1000);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(d);
}

export default function SystemLivePage() {
  const [email, setEmail] = useState('');
  const [type, setType] = useState<SignalType>('BUY');
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [scanSymbol, setScanSymbol] = useState('');
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanMessage, setScanMessage] = useState('');

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

  const loadSignals = useCallback(async (nextType: SignalType) => {
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(`/api/system-live?type=${nextType}&timeframe=1D&limit=200`, { cache: 'no-store' });
      const data: LiveResponse = await response.json();

      if (!response.ok) {
        setSignals([]);
        setMessage(data.error || 'Không tải được dữ liệu system live');
        return;
      }

      setSignals(data.signals || []);
      setUpdatedAt(data.updatedAt || null);
    } catch {
      setSignals([]);
      setMessage('Lỗi kết nối dữ liệu system live');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScan = useCallback(async (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    setScanSymbol(normalized);
    setScanLoading(true);
    setScanMessage('');

    try {
      const response = await fetch(`/api/system-live/scan?symbol=${normalized}&timeframe=1D`, { cache: 'no-store' });
      const data: ScanResponse = await response.json();
      if (!response.ok) {
        setScanData(null);
        setScanMessage(data.error || 'Không tải được DATA.SCAN');
        return;
      }
      setScanData(data.data || null);
    } catch {
      setScanData(null);
      setScanMessage('Lỗi kết nối DATA.SCAN');
    } finally {
      setScanLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSignals(type);
  }, [type, loadSignals]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const updatedLabel = useMemo(() => {
    if (!updatedAt) return '—';
    const date = new Date(updatedAt);
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }, [updatedAt]);

  const latestTrade = scanData?.trades?.[0];

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader
          title="Hệ thống Live"
          isLoggedIn={Boolean(email)}
          email={email}
          currentTab="system-live"
          onLogout={handleLogout}
        />

        <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
          <div className="ab-row-between align-center">
            <div className="ab-row-between align-center" style={{ gap: 8 }}>
              <Activity size={16} />
              <strong>Bộ lọc tín hiệu</strong>
            </div>
            <button type="button" className="ab-btn ab-btn-ghost" onClick={() => void loadSignals(type)}>
              <RefreshCw size={15} /> Làm mới
            </button>
          </div>

          <div className="ab-row-between align-center" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', gap: 8 }}>
              <button
                type="button"
                className={`ab-btn ${type === 'BUY' ? 'ab-btn-primary' : 'ab-btn-ghost'}`}
                onClick={() => setType('BUY')}
              >
                BUY
              </button>
              <button
                type="button"
                className={`ab-btn ${type === 'SELL' ? 'ab-btn-primary' : 'ab-btn-ghost'}`}
                onClick={() => setType('SELL')}
              >
                SELL
              </button>
            </div>
            <div className="ab-soft-label">Cập nhật: {updatedLabel}</div>
          </div>
        </section>

        {message ? (
          <section className="ab-premium-card">
            <div className="ab-error">{message}</div>
          </section>
        ) : null}

        <section className="ab-premium-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 10px' }}>Mã</th>
                <th style={{ textAlign: 'left', padding: '12px 10px' }}>Loại</th>
                <th style={{ textAlign: 'right', padding: '12px 10px' }}>Giá</th>
                <th style={{ textAlign: 'right', padding: '12px 10px' }}>GTGD</th>
                <th style={{ textAlign: 'right', padding: '12px 10px' }}>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '12px 10px' }} className="ab-soft-label">Đang tải...</td>
                    <td style={{ padding: '12px 10px' }} className="ab-soft-label">—</td>
                    <td style={{ padding: '12px 10px' }} className="ab-soft-label">—</td>
                    <td style={{ padding: '12px 10px' }} className="ab-soft-label">—</td>
                    <td style={{ padding: '12px 10px' }} className="ab-soft-label">—</td>
                  </tr>
                ))
              ) : signals.length ? (
                signals.map((signal, index) => {
                  const side = (signal.signal_type || type).toUpperCase();
                  const sideColor = side === 'BUY' ? 'var(--green)' : 'var(--red)';
                  const symbol = (signal.symbol || '—').toUpperCase();
                  return (
                    <tr key={`${signal.symbol || 'N/A'}-${index}`} style={{ borderTop: '1px solid var(--soft-2)' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 700 }}>
                        <button
                          type="button"
                          onClick={() => void loadScan(symbol)}
                          className="ab-btn ab-btn-ghost"
                          style={{ padding: '4px 10px', minHeight: 'auto' }}
                        >
                          {symbol}
                        </button>
                      </td>
                      <td style={{ padding: '12px 10px', color: sideColor, fontWeight: 700 }}>{side}</td>
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>{fmtPrice(signal.price)}</td>
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>{fmtMoney(signal.trading_value)}</td>
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>{fmtDate(signal)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: '16px 10px' }} className="ab-soft-label">Chưa có tín hiệu.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
          <div className="ab-row-between align-center" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="ab-row-between align-center" style={{ gap: 8 }}>
              <BarChart3 size={16} />
              <strong>DATA.SCAN {scanSymbol ? `· ${scanSymbol}` : ''}</strong>
            </div>
            {scanSymbol ? (
              <button type="button" className="ab-btn ab-btn-ghost" onClick={() => void loadScan(scanSymbol)}>
                <RefreshCw size={15} /> Quét lại
              </button>
            ) : null}
          </div>

          {scanMessage ? <div className="ab-error">{scanMessage}</div> : null}

          {scanLoading ? (
            <div className="ab-soft-label">Đang tải DATA.SCAN...</div>
          ) : scanData ? (
            <>
              <div className="ab-summary-grid premium-summary-grid compact-top-grid" style={{ gap: 10 }}>
                <article className="ab-premium-card" style={{ padding: 12 }}>
                  <div className="ab-soft-label">Win rate</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{fmtPct(scanData.win_rate)}</div>
                </article>
                <article className="ab-premium-card" style={{ padding: 12 }}>
                  <div className="ab-soft-label">Tổng PnL</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{fmtPct(scanData.total_pnl_pct)}</div>
                </article>
                <article className="ab-premium-card" style={{ padding: 12 }}>
                  <div className="ab-soft-label">Tổng lệnh</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{scanData.total_trades ?? scanData.trades?.length ?? 0}</div>
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
                    {(scanData.trades || []).slice(0, 12).map((trade, idx) => (
                      <tr key={`${trade.entry_ts || idx}-${idx}`} style={{ borderTop: '1px solid var(--soft-2)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>{trade.side || '—'}</td>
                        <td style={{ padding: '10px 8px' }}>{fmtTradeDate(trade.entry_ts)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPrice(trade.entry_price ?? null)}</td>
                        <td style={{ padding: '10px 8px' }}>{fmtTradeDate(trade.exit_ts)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>{fmtPrice(trade.exit_price ?? null)}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: (trade.pnl_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {fmtPct(trade.pnl_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="ab-soft-label">Chạm vào một mã ở bảng trên để mở DATA.SCAN.</div>
          )}
        </section>
      </div>
    </main>
  );
}
