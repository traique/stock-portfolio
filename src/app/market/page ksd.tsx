'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowRight, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import AppShellHeader from '@/components/app-shell-header';
import { supabase } from '@/lib/supabase';

type QuoteItem = { symbol: string; price: number; change: number; pct: number; volume?: number };
type PricesResponse = { debug?: QuoteItem[]; error?: string };
type LiveSignal = {
  symbol?: string;
  signal_type?: string;
  price?: number | null;
  trading_value?: number | null;
  timestamp?: string | null;
  created_at?: string | null;
  ts?: number | null;
};
type LiveResponse = { signals?: LiveSignal[]; error?: string; updatedAt?: string; count?: number };

const formatPrice = (v?: number | null) => (v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v));
const formatPct = (v?: number | null) => (v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : v < 0 ? '' : ''}${v.toFixed(2)}%`);
const formatIndexChange = (v?: number | null) => (v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : `${v > 0 ? '+' : v < 0 ? '' : ''}${v.toFixed(2)}`);
const formatValue = (v?: number | null) => (v === null || v === undefined || !Number.isFinite(v) ? 'N/A' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(v));
const colorFor = (v?: number | null) => !Number.isFinite(v as number) ? 'var(--muted)' : (v as number) > 0 ? 'var(--green)' : (v as number) < 0 ? 'var(--red)' : 'var(--muted)';

export default function MarketPage() {
  const [email, setEmail] = useState('');
  const [vnIndex, setVnIndex] = useState<QuoteItem | null>(null);
  const [buySignals, setBuySignals] = useState<LiveSignal[]>([]);
  const [sellSignals, setSellSignals] = useState<LiveSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
  }, []);

  const loadMarket = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [indexRes, buyRes, sellRes] = await Promise.all([
        fetch('/api/prices-cache?symbols=VNINDEX', { cache: 'no-store' }),
        fetch('/api/system-live?type=BUY&limit=6', { cache: 'no-store' }),
        fetch('/api/system-live?type=SELL&limit=6', { cache: 'no-store' }),
      ]);

      const indexData: PricesResponse = await indexRes.json();
      const buyData: LiveResponse = await buyRes.json();
      const sellData: LiveResponse = await sellRes.json();

      setVnIndex(indexData?.debug?.[0] || null);
      setBuySignals(Array.isArray(buyData.signals) ? buyData.signals : []);
      setSellSignals(Array.isArray(sellData.signals) ? sellData.signals : []);

      if (!indexRes.ok && !buyRes.ok && !sellRes.ok) {
        setMessage('Không tải được dữ liệu thị trường.');
      }
    } catch {
      setMessage('Lỗi kết nối dữ liệu thị trường.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Market" isLoggedIn={Boolean(email)} email={email} currentTab="market" onLogout={handleLogout} />

        <section className="ab-premium-card" style={{ display: 'grid', gap: 12 }}>
          <div className="ab-row-between align-center" style={{ flexWrap: 'wrap' }}>
            <div>
              <div className="ab-card-kicker">Pulse trong ngày</div>
              <div className="ab-card-headline small">Tập trung đúng thứ cần xem</div>
            </div>
            <button type="button" className="ab-btn ab-btn-ghost" onClick={() => void loadMarket()}>
              <RefreshCw size={15} /> Làm mới
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <article className="ab-premium-card" style={{ padding: 14 }}>
              <div className="ab-soft-label">VN-Index</div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6 }}>{vnIndex ? formatPrice(vnIndex.price) : '--'}</div>
              <div style={{ marginTop: 8, color: colorFor(vnIndex?.pct), fontWeight: 800 }}>
                {vnIndex ? `${formatIndexChange(vnIndex.change)} · ${formatPct(vnIndex.pct)}` : 'Đang tải'}
              </div>
            </article>

            <article className="ab-premium-card" style={{ padding: 14 }}>
              <div className="ab-soft-label">Top Buy</div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6 }}>{buySignals[0]?.symbol || '--'}</div>
              <div style={{ marginTop: 8, color: 'var(--green)', fontWeight: 800 }}>{formatPrice(buySignals[0]?.price ?? null)}</div>
            </article>

            <article className="ab-premium-card" style={{ padding: 14 }}>
              <div className="ab-soft-label">Top Sell</div>
              <div style={{ fontSize: 32, fontWeight: 900, marginTop: 6 }}>{sellSignals[0]?.symbol || '--'}</div>
              <div style={{ marginTop: 8, color: 'var(--red)', fontWeight: 800 }}>{formatPrice(sellSignals[0]?.price ?? null)}</div>
            </article>
          </div>
        </section>

        {message ? <section className="ab-premium-card"><div className="ab-error">{message}</div></section> : null}

        <section className="ab-home-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <section className="ab-premium-card" style={{ padding: 14, display: 'grid', gap: 12 }}>
            <div className="ab-row-between align-center">
              <div>
                <div className="ab-card-kicker">Dòng tiền vào</div>
                <div className="ab-card-headline small">Top Buy</div>
              </div>
              <TrendingUp size={18} color="var(--green)" />
            </div>

            {loading && !buySignals.length ? <div className="ab-note">Đang tải dữ liệu...</div> : buySignals.map((item, idx) => (
              <div key={`${item.symbol || 'buy'}-${idx}`} className="ab-mini-row">
                <div>
                  <div className="ab-mini-symbol">{item.symbol || '--'}</div>
                  <div className="ab-mini-price">{formatPrice(item.price ?? null)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: 'var(--green)' }}>BUY</div>
                  <div className="ab-soft-label">GTGD: {formatValue(item.trading_value ?? null)}</div>
                </div>
              </div>
            ))}
          </section>

          <section className="ab-premium-card" style={{ padding: 14, display: 'grid', gap: 12 }}>
            <div className="ab-row-between align-center">
              <div>
                <div className="ab-card-kicker">Áp lực bán</div>
                <div className="ab-card-headline small">Top Sell</div>
              </div>
              <TrendingDown size={18} color="var(--red)" />
            </div>

            {loading && !sellSignals.length ? <div className="ab-note">Đang tải dữ liệu...</div> : sellSignals.map((item, idx) => (
              <div key={`${item.symbol || 'sell'}-${idx}`} className="ab-mini-row">
                <div>
                  <div className="ab-mini-symbol">{item.symbol || '--'}</div>
                  <div className="ab-mini-price">{formatPrice(item.price ?? null)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, color: 'var(--red)' }}>SELL</div>
                  <div className="ab-soft-label">GTGD: {formatValue(item.trading_value ?? null)}</div>
                </div>
              </div>
            ))}
          </section>
        </section>

        <Link href="/system-live" className="ab-premium-card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="ab-card-kicker">Trang chuyên sâu</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>Mở Top Buy/Sell đầy đủ</div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
            <Activity size={16} />
            <span>Mở ngay</span>
            <ArrowRight size={16} />
          </div>
        </Link>
      </div>
    </main>
  );
}
