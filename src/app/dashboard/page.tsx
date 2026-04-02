'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';
import {
  calcHolding,
  calcSummary,
  formatCurrency,
  Holding,
  PriceMap,
} from '@/lib/calculations';

type QuoteDebugItem = {
  symbol: string;
  price: number;
  change: number;
  pct: number;
};

type PricesResponse = {
  prices?: PriceMap;
  updatedAt?: string;
  debug?: QuoteDebugItem[];
  error?: string;
};

function formatCompactPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatChange(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return `${sign}${new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function formatPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return `${sign}${value.toFixed(2)}%`;
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

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [quotes, setQuotes] = useState<QuoteDebugItem[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    symbol: '',
    buy_price: '',
    quantity: '',
    buy_date: '',
    note: '',
  });

  const loadHoldings = useCallback(async () => {
    setLoading(true);
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      window.location.href = '/';
      return;
    }

    setEmail(authData.user.email || '');

    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .order('created_at', { ascending: false });

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
      const response = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols.join(','))}`, {
        cache: 'no-store',
      });

      const data: PricesResponse = await response.json();

      if (!response.ok) {
        setPrices({});
        setQuotes([]);
        setMessage(data?.error || 'Không lấy được giá');
      } else {
        setPrices(data.prices || {});
        setQuotes(data.debug || []);
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
    if (holdings.length > 0) {
      loadPrices(holdings);
    } else {
      setPrices({});
      setQuotes([]);
    }
  }, [holdings, loadPrices]);

  const summary = useMemo(() => calcSummary(holdings, prices), [holdings, prices]);
  const summaryPct = summary.totalBuy > 0 ? (summary.totalPnl / summary.totalBuy) * 100 : 0;
  const quoteMap = useMemo(() => getQuoteMap(quotes), [quotes]);

  const dayPnl = useMemo(() => {
    return holdings.reduce((sum, holding) => {
      const quote = quoteMap.get(holding.symbol.toUpperCase());
      const change = Number(quote?.change || 0);
      return sum + change * Number(holding.quantity || 0);
    }, 0);
  }, [holdings, quoteMap]);

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

    const { error } = await supabase.from('holdings').insert({
      user_id: authData.user.id,
      symbol,
      buy_price: buyPrice,
      quantity,
      buy_date: form.buy_date || null,
      note: form.note.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setForm({
      symbol: '',
      buy_price: '',
      quantity: '',
      buy_date: '',
      note: '',
    });

    await loadHoldings();
  }

  async function handleDelete(id: string, symbol: string) {
    if (!window.confirm(`Xóa ${symbol}?`)) return;

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

  async function handleRefresh() {
    await loadHoldings();
  }

  return (
    <main className="ab-page">
      <div className="ab-shell">
        <AppShellHeader
          title="Danh mục đầu tư"
          isLoggedIn={true}
          email={email}
          currentTab="dashboard"
          onLogout={handleLogout}
        />

        <section className="ab-summary-grid ab-summary-grid-4">
          <div className="ab-summary-card">
            <div className="ab-label">Tổng vốn</div>
            <div className="ab-summary-value">{formatCurrency(summary.totalBuy)}</div>
          </div>

          <div className="ab-summary-card">
            <div className="ab-label">NAV</div>
            <div className="ab-summary-value">{formatCurrency(summary.totalNow)}</div>
          </div>

          <div className="ab-summary-card">
            <div className="ab-label">Lãi/lỗ ngày</div>
            <div className="ab-summary-value" style={{ color: dayPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {formatCurrency(dayPnl)}
            </div>
          </div>

          <div className="ab-summary-card">
            <div className="ab-label">Lãi/lỗ danh mục</div>
            <div className="ab-summary-value" style={{ color: summary.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {formatCurrency(summary.totalPnl)}
            </div>
            <div style={{ marginTop: 4, fontSize: 14, fontWeight: 800, color: summary.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {summaryPct >= 0 ? '+' : ''}{summaryPct.toFixed(2)}%
            </div>
          </div>
        </section>

        <section className="ab-card">
          <div className="ab-section-title">Thêm cổ phiếu</div>

          <form onSubmit={handleSubmit} className="ab-form-grid">
            <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="Mã" required className="ab-input" />
            <input value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} type="number" placeholder="Giá mua" required className="ab-input" />
            <input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} type="number" placeholder="Số lượng" required className="ab-input" />
            <input value={form.buy_date} onChange={(e) => setForm({ ...form, buy_date: e.target.value })} type="date" className="ab-input" />
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ghi chú" className="ab-input ab-full" />
            <button type="submit" className="ab-btn ab-btn-primary ab-full" onClick={handleRefresh}>
              {refreshing || loading ? 'Đang tải...' : 'Thêm mã'}
            </button>
          </form>

          {message ? <div className="ab-error">{message}</div> : null}
        </section>

        {loading ? (
          <section className="ab-card">Đang tải...</section>
        ) : holdings.length === 0 ? (
          <section className="ab-card">Chưa có mã nào</section>
        ) : (
          <section className="ab-list">
            {holdings.map((holding) => {
              const row = calcHolding(holding, prices);
              const quote = quoteMap.get(holding.symbol.toUpperCase());
              const positive = row.pnl >= 0;

              return (
                <article key={holding.id} className="ab-stock-card">
                  <div className="ab-row-between">
                    <div>
                      <div className="ab-symbol">{holding.symbol}</div>
                      <div className="ab-muted">SL: {holding.quantity}</div>
                    </div>

                    <button type="button" className="ab-delete" onClick={() => handleDelete(holding.id, holding.symbol)}>
                      Xóa
                    </button>
                  </div>

                  <div className="ab-price-card">
                    <div className="ab-label">Giá hiện tại</div>
                    <div className="ab-price">{formatCompactPrice(quote?.price ?? row.currentPrice)}</div>

                    <div className="ab-change-row">
                      <span style={{ color: getChangeColor(quote?.change) }}>{formatChange(quote?.change)}</span>
                      <span style={{ color: getChangeColor(quote?.pct) }}>{formatPct(quote?.pct)}</span>
                    </div>
                  </div>

                  <div className="ab-mini-grid">
                    <div className="ab-mini-card">
                      <div className="ab-label">Giá mua</div>
                      <div className="ab-mini-value">{formatCurrency(Number(holding.buy_price))}</div>
                    </div>
                    <div className="ab-mini-card">
                      <div className="ab-label">Tổng mua</div>
                      <div className="ab-mini-value">{formatCurrency(row.totalBuy)}</div>
                    </div>
                    <div className="ab-mini-card">
                      <div className="ab-label">Hiện tại</div>
                      <div className="ab-mini-value">{formatCurrency(row.totalNow)}</div>
                    </div>
                    <div className="ab-mini-card">
                      <div className="ab-label">Lời / Lỗ</div>
                      <div className="ab-mini-value" style={{ color: positive ? 'var(--green)' : 'var(--red)' }}>
                        {formatCurrency(row.pnl)}
                      </div>
                    </div>
                  </div>

                  <div className="ab-performance" style={{ background: positive ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', borderColor: positive ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)', color: positive ? 'var(--green)' : 'var(--red)' }}>
                    <span>Hiệu suất</span>
                    <strong>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%</strong>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
