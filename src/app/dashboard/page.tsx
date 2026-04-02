'use client';

import { ArrowDownRight, ArrowUpRight, PieChart, TrendingUp, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';
import { calcHolding, calcSummary, formatCurrency, Holding, PriceMap } from '@/lib/calculations';

type QuoteDebugItem = {
  symbol: string;
  price: number;
  change: number;
  pct: number;
};

type PricesResponse = {
  prices?: PriceMap;
  debug?: QuoteDebugItem[];
  error?: string;
};

function formatCompactPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatChange(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return sign + new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return sign + value.toFixed(2) + '%';
}

function getChangeColor(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'var(--muted)';
  if (value > 0) return 'var(--green)';
  if (value < 0) return 'var(--red)';
  return 'var(--muted)';
}

function getQuoteMap(items: QuoteDebugItem[]) {
  const map = new Map<string, QuoteDebugItem>();
  items.forEach((item) => map.set(item.symbol.toUpperCase(), item));
  return map;
}

function statTone(value: number) {
  return value >= 0 ? 'up' : 'down';
}

function SummarySkeleton() {
  return <article className="ab-premium-card ab-stat-premium"><div className="ab-skeleton skeleton-line short" /><div className="ab-skeleton skeleton-price medium" /></article>;
}

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [quotes, setQuotes] = useState<QuoteDebugItem[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ symbol: '', buy_price: '', quantity: '', buy_date: '', note: '' });

  const loadHoldings = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      window.location.href = '/';
      return;
    }
    setEmail(authData.user.email || '');
    const { data, error } = await supabase.from('holdings').select('*').order('symbol', { ascending: true });
    if (error) {
      setHoldings([]);
      setMessage('Không tải được dữ liệu');
    } else {
      setHoldings((data || []) as Holding[]);
    }
    setLoading(false);
  }, []);

  const loadPrices = useCallback(async (items: Holding[]) => {
    const symbols = [...new Set(items.map((item) => item.symbol.toUpperCase()))];
    if (!symbols.length) {
      setPrices({});
      setQuotes([]);
      return;
    }
    setRefreshing(true);
    setMessage('');
    try {
      const response = await fetch('/api/prices?symbols=' + encodeURIComponent(symbols.join(',')), { cache: 'no-store' });
      const data: PricesResponse = await response.json();
      if (!response.ok) {
        setPrices({});
        setQuotes([]);
        setMessage(data?.error || 'Không lấy được giá');
      } else {
        setPrices(data.prices || {});
        setQuotes((data.debug || []).sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true })));
      }
    } catch {
      setPrices({});
      setQuotes([]);
      setMessage('Lỗi kết nối');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  useEffect(() => {
    if (holdings.length > 0) loadPrices(holdings);
    else {
      setPrices({});
      setQuotes([]);
    }
  }, [holdings, loadPrices]);

  const summary = useMemo(() => calcSummary(holdings, prices), [holdings, prices]);
  const summaryPct = summary.totalBuy > 0 ? (summary.totalPnl / summary.totalBuy) * 100 : 0;
  const quoteMap = useMemo(() => getQuoteMap(quotes), [quotes]);

  const dayPnl = useMemo(() => holdings.reduce((sum, holding) => {
    const quote = quoteMap.get(holding.symbol.toUpperCase());
    const change = Number(quote?.change || 0);
    return sum + change * Number(holding.quantity || 0);
  }, 0), [holdings, quoteMap]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      window.location.href = '/';
      return;
    }
    const symbol = form.symbol.trim().toUpperCase();
    const buyPrice = Number(form.buy_price);
    const quantity = Number(form.quantity);
    if (!symbol || !buyPrice || !quantity) {
      setMessage('Nhập đủ mã, giá mua, số lượng');
      return;
    }
    const { error } = await supabase.from('holdings').insert({ user_id: authData.user.id, symbol, buy_price: buyPrice, quantity, buy_date: form.buy_date || null, note: form.note.trim() || null });
    if (error) {
      setMessage(error.message);
      return;
    }
    setForm({ symbol: '', buy_price: '', quantity: '', buy_date: '', note: '' });
    await loadHoldings();
  }

  async function handleDelete(id: string, symbol: string) {
    if (!window.confirm('Xóa ' + symbol + '?')) return;
    const { error } = await supabase.from('holdings').delete().eq('id', id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadHoldings();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Danh mục cá nhân" isLoggedIn={true} email={email} currentTab="dashboard" onLogout={handleLogout} />

        <section className="ab-summary-grid premium-summary-grid compact-top-grid">
          {loading ? (
            <>
              <SummarySkeleton />
              <SummarySkeleton />
              <SummarySkeleton />
              <SummarySkeleton />
            </>
          ) : (
            <>
              <article className="ab-premium-card ab-stat-premium neutral">
                <div className="ab-stat-head"><Wallet size={16} /><span className="ab-soft-label">Tổng vốn</span></div>
                <div className="ab-big-number dark">{formatCurrency(summary.totalBuy)}</div>
              </article>
              <article className="ab-premium-card ab-stat-premium neutral">
                <div className="ab-stat-head"><PieChart size={16} /><span className="ab-soft-label">NAV</span></div>
                <div className="ab-big-number dark">{formatCurrency(summary.totalNow)}</div>
              </article>
              <article className={`ab-premium-card ab-stat-premium ${statTone(dayPnl)}`}>
                <div className="ab-stat-head">{dayPnl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}<span className="ab-soft-label">Lãi/lỗ ngày</span></div>
                <div className="ab-big-number" style={{ color: getChangeColor(dayPnl) }}>{formatCurrency(dayPnl)}</div>
              </article>
              <article className={`ab-premium-card ab-stat-premium ${statTone(summary.totalPnl)}`}>
                <div className="ab-stat-head"><TrendingUp size={16} /><span className="ab-soft-label">Lãi/lỗ danh mục</span></div>
                <div className="ab-big-number" style={{ color: getChangeColor(summary.totalPnl) }}>{formatCurrency(summary.totalPnl)}</div>
                <div className="ab-stat-sub" style={{ color: getChangeColor(summary.totalPnl) }}>{summaryPct >= 0 ? '+' : ''}{summaryPct.toFixed(2)}%</div>
              </article>
            </>
          )}
        </section>

        <section className="ab-premium-card ab-form-shell compact">
          <div className="ab-row-between align-center compact-form-head">
            <div><div className="ab-card-kicker">Thêm vị thế</div></div>
            <button type="button" className="ab-btn ab-btn-subtle" onClick={loadHoldings}>{refreshing ? 'Đang tải...' : 'Làm mới'}</button>
          </div>
          <form onSubmit={handleSubmit} className="ab-form-grid compact-form-grid">
            <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="Mã" required className="ab-input" />
            <input value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} type="number" placeholder="Giá mua" required className="ab-input" />
            <input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} type="number" placeholder="Số lượng" required className="ab-input" />
            <input value={form.buy_date} onChange={(e) => setForm({ ...form, buy_date: e.target.value })} type="date" className="ab-input" />
            <button type="submit" className="ab-btn ab-btn-primary">Thêm mã</button>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ghi chú" className="ab-input ab-full" />
          </form>
          {message ? <div className="ab-error">{message}</div> : null}
        </section>

        {loading ? (
          <section className="ab-position-grid">
            <article className="ab-premium-card ab-position-card ab-skeleton-card"><div className="ab-skeleton skeleton-title" /><div className="ab-skeleton skeleton-price" /><div className="ab-skeleton skeleton-line" /><div className="ab-skeleton skeleton-line short" /></article>
            <article className="ab-premium-card ab-position-card ab-skeleton-card"><div className="ab-skeleton skeleton-title" /><div className="ab-skeleton skeleton-price" /><div className="ab-skeleton skeleton-line" /><div className="ab-skeleton skeleton-line short" /></article>
          </section>
        ) : holdings.length === 0 ? (
          <section className="ab-premium-card">Chưa có mã nào</section>
        ) : (
          <section className="ab-position-grid">
            {holdings.map((holding) => {
              const row = calcHolding(holding, prices);
              const quote = quoteMap.get(holding.symbol.toUpperCase());
              const positive = row.pnl >= 0;
              return (
                <article key={holding.id} className="ab-premium-card ab-position-card">
                  <div className="ab-row-between align-start">
                    <div>
                      <div className="ab-symbol premium">{holding.symbol}</div>
                    </div>
                    <button type="button" className="ab-delete ghost" onClick={() => handleDelete(holding.id, holding.symbol)}>Xóa</button>
                  </div>
                  <div className="ab-price premium">{formatCompactPrice(quote?.price ?? row.currentPrice)}</div>
                  <div className="ab-soft-change under-price" style={{ color: getChangeColor(quote?.change) }}>{formatChange(quote?.change)} · {formatPct(quote?.pct)}</div>
                  <div className="ab-position-stats">
                    <div className="ab-stat-chip"><span>SL</span><strong>{holding.quantity}</strong></div>
                    <div className="ab-stat-chip"><span>Giá mua</span><strong>{formatCurrency(Number(holding.buy_price))}</strong></div>
                  </div>
                  <div className="ab-mini-grid premium">
                    <div className="ab-mini-card premium"><div className="ab-soft-label">Tổng mua</div><div className="ab-mini-value">{formatCurrency(row.totalBuy)}</div></div>
                    <div className="ab-mini-card premium"><div className="ab-soft-label">Hiện tại</div><div className="ab-mini-value">{formatCurrency(row.totalNow)}</div></div>
                  </div>
                  <div className={`ab-profit-pill ${positive ? 'up' : 'down'}`}><span>Lãi / Lỗ</span><strong>{formatCurrency(row.pnl)}</strong></div>
                  <div className="ab-performance premium" style={{ background: positive ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)', borderColor: positive ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)', color: positive ? 'var(--green)' : 'var(--red)' }}><span>Hiệu suất vị thế</span><strong>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%</strong></div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
