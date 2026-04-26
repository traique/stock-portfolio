'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import AppShellHeader from '@/components/app-shell-header';
import { supabase } from '@/lib/supabase';

// ================= TYPES =================

type SignalType = 'BUY' | 'SELL';

type LiveSignal = {
  symbol?:        string;
  signal_type?:   string;
  price?:         number | null;
  trading_value?: number | null;
  timestamp?:     string | null;
  created_at?:    string | null;
  ts?:            number | null;
};

type LiveResponse = {
  signals?:   LiveSignal[];
  error?:     string;
  updatedAt?: string;
  provider?:  string;
  count?:     number;
};

// ================= FORMATTERS =================

const priceFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const moneyFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const dateFormatter  = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
});
const fullDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
});

const fmtPrice = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? '—' : priceFormatter.format(v);

const fmtMoney = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? '—' : moneyFormatter.format(v);

function fmtDate(signal: LiveSignal): string {
  let d: Date | null = null;
  if (signal.timestamp)                              d = new Date(signal.timestamp);
  else if (signal.created_at)                        d = new Date(signal.created_at);
  else if (signal.ts && Number.isFinite(signal.ts)) d = new Date(Number(signal.ts) * 1000);
  return d && Number.isFinite(d.getTime()) ? dateFormatter.format(d) : '—';
}

// ================= STATIC STYLES =================

const TH: React.CSSProperties = {
  padding:       '12px 10px',
  fontSize:      11,
  fontWeight:    800,
  color:         'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom:  '1px solid var(--border)',
  whiteSpace:    'nowrap',
};

const TD: React.CSSProperties = {
  padding:    '12px 10px',
  fontSize:   14,
  fontWeight: 600,
  borderTop:  '1px solid var(--border)',
};

// ================= COMPONENT =================

export default function SystemLivePage() {
  const [email,     setEmail]     = useState('');
  const [type,      setType]      = useState<SignalType>('BUY');
  const [signals,   setSignals]   = useState<LiveSignal[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [message,   setMessage]   = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

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

  const loadSignals = useCallback(async (nextType: SignalType) => {
    setLoading(true);
    setMessage('');
    try {
      const res  = await fetch(
        `/api/system-live?type=${nextType}&timeframe=1D&limit=200`,
        { cache: 'no-store' },
      );
      const data: LiveResponse = await res.json();

      if (!res.ok) {
        setSignals([]);
        setMessage(data.error ?? 'Không tải được dữ liệu system live');
        return;
      }

      setSignals(data.signals ?? []);
      setUpdatedAt(data.updatedAt ?? null);
    } catch {
      setSignals([]);
      setMessage('Lỗi kết nối tới máy chủ.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSignals(type); }, [type, loadSignals]);

  const updatedLabel = useMemo(() => {
    if (!updatedAt) return '—';
    const d = new Date(updatedAt);
    return Number.isFinite(d.getTime()) ? fullDateFormatter.format(d) : '—';
  }, [updatedAt]);

  return (
    <main className="ab-page">
      <div className="ab-shell">

        {/* title & premium-gap removed */}
        <AppShellHeader
          isLoggedIn={Boolean(email)}
          email={email}
          currentTab="system-live"
          onLogout={handleLogout}
        />

        {/* --- FILTER BAR --- */}
        <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
          <div className="ab-row-between align-center">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
              <Activity size={16} />
              Bộ lọc tín hiệu
            </div>
            <button
              type="button"
              className="ab-btn ab-btn-primary"
              style={{ padding: '8px 16px', fontSize: 12 }}
              onClick={() => void loadSignals(type)}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'spin-animation' : ''} />
              Làm mới
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', gap: 8 }}>
              {(['BUY', 'SELL'] as SignalType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`ab-btn ${type === t ? 'ab-btn-primary' : 'ab-btn-subtle'}`}
                  onClick={() => setType(t)}
                  disabled={loading}
                  style={{ minWidth: 72 }}
                >
                  {t}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
              Cập nhật: {updatedLabel}
            </span>
          </div>
        </section>

        {message && (
          <div className="ab-error" style={{ borderRadius: 16, padding: '12px 16px' }}>
            {message}
          </div>
        )}

        {/* --- TABLE --- */}
        <section className="ab-premium-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ ...TH, textAlign: 'left'  }}>Mã</th>
                <th style={{ ...TH, textAlign: 'left'  }}>Loại</th>
                <th style={{ ...TH, textAlign: 'right' }}>Giá</th>
                <th style={{ ...TH, textAlign: 'right' }}>GTGD</th>
                <th style={{ ...TH, textAlign: 'right' }}>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} style={TD}>
                        <div className="ab-skeleton" style={{ height: 16, width: j === 0 ? 48 : 64, borderRadius: 8 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : signals.length > 0 ? (
                signals.map((signal, i) => {
                  const side  = (signal.signal_type ?? type).toUpperCase();
                  const color = side === 'BUY' ? 'var(--green)' : 'var(--red)';
                  return (
                    <tr key={`${signal.symbol ?? 'N/A'}-${i}`}>
                      <td style={{ ...TD, fontWeight: 800 }}>{signal.symbol ?? '—'}</td>
                      <td style={{ ...TD, color, fontWeight: 800 }}>{side}</td>
                      <td style={{ ...TD, textAlign: 'right' }} className="num-premium">{fmtPrice(signal.price)}</td>
                      <td style={{ ...TD, textAlign: 'right' }} className="num-premium">{fmtMoney(signal.trading_value)}</td>
                      <td style={{ ...TD, textAlign: 'right' }} className="num-premium">{fmtDate(signal)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                    Chưa có tín hiệu nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

      </div>
    </main>
  );
}
