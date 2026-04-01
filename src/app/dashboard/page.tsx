'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  calcHolding,
  calcSummary,
  formatCurrency,
  formatDateTime,
  Holding,
  PriceMap,
} from '@/lib/calculations';

type QuoteDebugItem = {
  symbol: string;
  ticker?: string;
  price: number;
  change: number;
  pct: number;
  previousClose?: number;
  marketTime?: number | null;
  currency?: string;
  error?: string;
};

type PricesResponse = {
  prices?: PriceMap;
  updatedAt?: string;
  provider?: string;
  debug?: QuoteDebugItem[];
  error?: string;
};

function formatPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatChange(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return `${sign}${value.toFixed(1)}`;
}

function formatPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function getChangeColor(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '#64748b';
  if (value > 0) return '#16a34a';
  if (value < 0) return '#dc2626';
  return '#64748b';
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
  const [updatedAt, setUpdatedAt] = useState('');
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
      window.location.href = '/auth/login';
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
      setUpdatedAt('');
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
        setUpdatedAt(data.updatedAt || '');
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
      setUpdatedAt('');
    }
  }, [holdings, loadPrices]);

  const summary = useMemo(() => calcSummary(holdings, prices), [holdings, prices]);
  const summaryPct = summary.totalBuy > 0 ? (summary.totalPnl / summary.totalBuy) * 100 : 0;
  const quoteMap = useMemo(() => getQuoteMap(quotes), [quotes]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      window.location.href = '/auth/login';
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
    window.location.href = '/auth/login';
  }

  async function handleRefresh() {
    await loadHoldings();
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <section style={styles.topCard}>
          <div>
            <div style={styles.topEmail}>{email}</div>
            <h1 style={styles.topTitle}>Danh mục</h1>
            <div style={styles.topTime}>{formatDateTime(updatedAt)}</div>
          </div>

          <div style={styles.topActions}>
            <button style={styles.primaryButton} onClick={handleRefresh}>
              {refreshing || loading ? 'Đang tải...' : 'Làm mới'}
            </button>
            <button style={styles.ghostButton} onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </section>

        <section style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.label}>Tổng vốn</div>
            <div style={styles.summaryValue}>{formatCurrency(summary.totalBuy)}</div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.label}>Hiện tại</div>
            <div style={styles.summaryValue}>{formatCurrency(summary.totalNow)}</div>
          </div>

          <div style={styles.summaryCardWide}>
            <div style={styles.label}>Lời / Lỗ</div>
            <div
              style={{
                ...styles.summaryValue,
                color: summary.totalPnl >= 0 ? '#16a34a' : '#dc2626',
              }}
            >
              {formatCurrency(summary.totalPnl)}
            </div>
            <div
              style={{
                marginTop: 6,
                fontWeight: 800,
                fontSize: 16,
                color: summary.totalPnl >= 0 ? '#16a34a' : '#dc2626',
              }}
            >
              {summaryPct >= 0 ? '+' : ''}
              {summaryPct.toFixed(2)}%
            </div>
          </div>
        </section>

        <section style={styles.formCard}>
          <form onSubmit={handleSubmit} style={styles.formGrid}>
            <input
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              placeholder="Mã"
              required
              style={styles.input}
            />
            <input
              value={form.buy_price}
              onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
              type="number"
              placeholder="Giá mua"
              required
              style={styles.input}
            />
            <input
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              type="number"
              placeholder="Số lượng"
              required
              style={styles.input}
            />
            <input
              value={form.buy_date}
              onChange={(e) => setForm({ ...form, buy_date: e.target.value })}
              type="date"
              style={styles.input}
            />
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Ghi chú"
              style={styles.inputFull}
            />
            <button type="submit" style={styles.submitButton}>
              Thêm mã
            </button>
          </form>

          {message ? <div style={styles.errorBox}>{message}</div> : null}
        </section>

        {loading ? (
          <section style={styles.infoCard}>Đang tải...</section>
        ) : holdings.length === 0 ? (
          <section style={styles.infoCard}>Chưa có mã nào</section>
        ) : (
          <section style={styles.cardsGrid}>
            {holdings.map((holding) => {
              const row = calcHolding(holding, prices);
              const quote = quoteMap.get(holding.symbol.toUpperCase());
              const positive = row.pnl >= 0;

              return (
                <article key={holding.id} style={styles.stockCard}>
                  <div style={styles.stockHead}>
                    <div>
                      <div style={styles.stockSymbol}>{holding.symbol}</div>
                      <div style={styles.stockMeta}>SL: {holding.quantity}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(holding.id, holding.symbol)}
                      style={styles.deleteButton}
                    >
                      Xóa
                    </button>
                  </div>

                  <div style={styles.priceMain}>
                    <div style={styles.label}>Giá hiện tại</div>
                    <div style={styles.priceValue}>
                      {formatPrice(quote?.price ?? row.currentPrice)}
                    </div>
                  </div>

                  <div style={styles.changeRow}>
                    <div style={styles.changeBox}>
                      <div style={styles.label}>Thay đổi</div>
                      <div
                        style={{
                          ...styles.changeValue,
                          color: getChangeColor(quote?.change),
                        }}
                      >
                        {formatChange(quote?.change)}
                      </div>
                    </div>

                    <div style={styles.changeBox}>
                      <div style={styles.label}>% thay đổi</div>
                      <div
                        style={{
                          ...styles.changeValue,
                          color: getChangeColor(quote?.pct),
                        }}
                      >
                        {formatPct(quote?.pct)}
                      </div>
                    </div>
                  </div>

                  <div style={styles.miniGrid}>
                    <div style={styles.miniCard}>
                      <div style={styles.label}>Giá mua</div>
                      <div style={styles.miniValue}>{formatCurrency(Number(holding.buy_price))}</div>
                    </div>
                    <div style={styles.miniCard}>
                      <div style={styles.label}>Tổng mua</div>
                      <div style={styles.miniValue}>{formatCurrency(row.totalBuy)}</div>
                    </div>
                    <div style={styles.miniCard}>
                      <div style={styles.label}>Hiện tại</div>
                      <div style={styles.miniValue}>{formatCurrency(row.totalNow)}</div>
                    </div>
                    <div style={styles.miniCard}>
                      <div style={styles.label}>Lời / Lỗ</div>
                      <div
                        style={{
                          ...styles.miniValue,
                          color: positive ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {formatCurrency(row.pnl)}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      ...styles.performanceBox,
                      background: positive ? '#ecfdf5' : '#fef2f2',
                      borderColor: positive ? '#bbf7d0' : '#fecaca',
                      color: positive ? '#16a34a' : '#dc2626',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>Hiệu suất</span>
                    <span style={{ fontWeight: 800, fontSize: 26 }}>
                      {row.pnlPct >= 0 ? '+' : ''}
                      {row.pnlPct.toFixed(2)}%
                    </span>
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f3f6fb',
    color: '#0f172a',
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif',
  },
  container: {
    maxWidth: 760,
    margin: '0 auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  topCard: {
    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
    color: '#fff',
    borderRadius: 24,
    padding: 16,
    display: 'grid',
    gap: 14,
  },
  topEmail: {
    fontSize: 12,
    opacity: 0.8,
  },
  topTitle: {
    margin: '4px 0 0',
    fontSize: 28,
    lineHeight: 1.05,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  topTime: {
    marginTop: 10,
    display: 'inline-block',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    padding: '8px 10px',
    fontSize: 13,
    color: '#e2e8f0',
  },
  topActions: {
    display: 'grid',
    gap: 10,
  },
  primaryButton: {
    border: 'none',
    borderRadius: 16,
    padding: '12px 14px',
    background: '#fff',
    color: '#0f172a',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  ghostButton: {
    borderRadius: 16,
    padding: '12px 14px',
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
  summaryGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: '1fr 1fr',
  },
  summaryCard: {
    background: '#fff',
    borderRadius: 22,
    padding: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 20px rgba(148,163,184,0.10)',
  },
  summaryCardWide: {
    gridColumn: 'span 2',
    background: '#fff',
    borderRadius: 22,
    padding: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 20px rgba(148,163,184,0.10)',
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 700,
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  formCard: {
    background: '#fff',
    borderRadius: 22,
    padding: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 20px rgba(148,163,184,0.10)',
  },
  formGrid: {
    display: 'grid',
    gap: 10,
    gridTemplateColumns: '1fr 1fr',
  },
  input: {
    width: '100%',
    border: '1px solid #dbe2ea',
    borderRadius: 14,
    padding: '12px 12px',
    background: '#fff',
    fontSize: 14,
    outline: 'none',
  },
  inputFull: {
    width: '100%',
    gridColumn: 'span 2',
    border: '1px solid #dbe2ea',
    borderRadius: 14,
    padding: '12px 12px',
    background: '#fff',
    fontSize: 14,
    outline: 'none',
  },
  submitButton: {
    gridColumn: 'span 2',
    border: 'none',
    borderRadius: 16,
    padding: '13px 14px',
    background: '#0f172a',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  errorBox: {
    marginTop: 10,
    background: '#fff1f2',
    border: '1px solid #fecdd3',
    color: '#be123c',
    borderRadius: 14,
    padding: 10,
    fontSize: 13,
  },
  infoCard: {
    background: '#fff',
    borderRadius: 22,
    padding: 16,
    border: '1px solid #e2e8f0',
    color: '#64748b',
    boxShadow: '0 8px 20px rgba(148,163,184,0.10)',
  },
  cardsGrid: {
    display: 'grid',
    gap: 12,
  },
  stockCard: {
    background: '#fff',
    borderRadius: 22,
    padding: 14,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 20px rgba(148,163,184,0.10)',
  },
  stockHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
  },
  stockSymbol: {
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: '-0.04em',
    lineHeight: 1,
  },
  stockMeta: {
    marginTop: 6,
    color: '#64748b',
    fontSize: 13,
  },
  deleteButton: {
    border: '1px solid #fecaca',
    background: '#fff',
    color: '#dc2626',
    borderRadius: 14,
    padding: '8px 10px',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  priceMain: {
    marginTop: 14,
    background: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    border: '1px solid #e2e8f0',
  },
  priceValue: {
    marginTop: 6,
    fontSize: 42,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '-0.04em',
  },
  changeRow: {
    marginTop: 10,
    display: 'grid',
    gap: 10,
    gridTemplateColumns: '1fr 1fr',
  },
  changeBox: {
    background: '#f8fafc',
    borderRadius: 16,
    padding: 12,
    border: '1px solid #e2e8f0',
  },
  changeValue: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  miniGrid: {
    marginTop: 10,
    display: 'grid',
    gap: 10,
    gridTemplateColumns: '1fr 1fr',
  },
  miniCard: {
    background: '#f8fafc',
    borderRadius: 16,
    padding: 12,
    border: '1px solid #e2e8f0',
    minWidth: 0,
  },
  miniValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    wordBreak: 'break-word',
  },
  performanceBox: {
    marginTop: 10,
    borderRadius: 16,
    border: '1px solid',
    padding: '12px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
};
