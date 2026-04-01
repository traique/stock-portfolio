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
  volume?: number;
  error?: string;
};

type PricesResponse = {
  prices?: PriceMap;
  updatedAt?: string;
  provider?: string;
  debug?: QuoteDebugItem[];
  error?: string;
};

function formatCompactPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const hasDecimal = Math.abs(value % 1) > 0.000001;
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: hasDecimal ? 1 : 0,
  }).format(value);
}

function formatChange(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  const hasDecimal = Math.abs(value % 1) > 0.000001;
  return `${sign}${new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: hasDecimal ? 1 : 0,
  }).format(value)}`;
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
    <main style={styles.page}>
      <div style={styles.container}>
        <section style={styles.hero}>
          <div style={styles.heroBadge}>AlphaBoard</div>
          <div style={styles.heroTop}>
            <div>
              <div style={styles.heroEmail}>{email}</div>
              <h1 style={styles.heroTitle}>Danh mục đầu tư</h1>
              <div style={styles.heroMetaRow}>
                <div style={styles.metaPill}>{formatDateTime(updatedAt)}</div>
                <div style={styles.metaPill}>Dữ liệu thị trường</div>
              </div>
            </div>

            <div style={styles.heroActions}>
              <button style={styles.primaryBtn} onClick={handleRefresh}>
                {refreshing || loading ? 'Đang tải...' : 'Làm mới'}
              </button>
              <button style={styles.secondaryBtn} onClick={handleLogout}>
                Đăng xuất
              </button>
            </div>
          </div>
        </section>

        <section style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.label}>Tổng vốn</div>
            <div style={styles.summaryValue}>{formatCurrency(summary.totalBuy)}</div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.label}>NAV</div>
            <div style={styles.summaryValue}>{formatCurrency(summary.totalNow)}</div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.label}>Lãi/lỗ ngày</div>
            <div
              style={{
                ...styles.summaryValue,
                color: dayPnl >= 0 ? '#16a34a' : '#dc2626',
              }}
            >
              {formatCurrency(dayPnl)}
            </div>
          </div>

          <div style={styles.summaryCard}>
            <div style={styles.label}>Lãi/lỗ danh mục</div>
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
                marginTop: 4,
                fontSize: 14,
                fontWeight: 800,
                color: summary.totalPnl >= 0 ? '#16a34a' : '#dc2626',
              }}
            >
              {summaryPct >= 0 ? '+' : ''}
              {summaryPct.toFixed(2)}%
            </div>
          </div>
        </section>

        <section style={styles.formCard}>
          <div style={styles.blockTitle}>Thêm cổ phiếu</div>

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
            <button type="submit" style={styles.primaryWideBtn}>
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
                      style={styles.deleteBtn}
                    >
                      Xóa
                    </button>
                  </div>

                  <div style={styles.priceCard}>
                    <div style={styles.label}>Giá hiện tại</div>
                    <div style={styles.priceValue}>
                      {formatCompactPrice(quote?.price ?? row.currentPrice)}
                    </div>

                    <div style={styles.inlineChangeRow}>
                      <span
                        style={{
                          ...styles.inlineChangeText,
                          color: getChangeColor(quote?.change),
                        }}
                      >
                        {formatChange(quote?.change)}
                      </span>
                      <span
                        style={{
                          ...styles.inlineChangeText,
                          color: getChangeColor(quote?.pct),
                        }}
                      >
                        {formatPct(quote?.pct)}
                      </span>
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
                    <span style={{ fontWeight: 800, fontSize: 22 }}>
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
    background: '#f4f7fb',
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
  hero: {
    background: 'linear-gradient(135deg, #0b1530, #12224a)',
    color: '#fff',
    borderRadius: 28,
    padding: 18,
    boxShadow: '0 14px 32px rgba(15,23,42,0.18)',
  },
  heroBadge: {
    display: 'inline-flex',
    width: 'fit-content',
    padding: '7px 12px',
    borderRadius: 999,
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.12)',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.02em',
  },
  heroTop: {
    display: 'grid',
    gap: 14,
    marginTop: 14,
  },
  heroEmail: {
    fontSize: 12,
    color: '#cbd5e1',
    wordBreak: 'break-word',
  },
  heroTitle: {
    margin: '8px 0 0',
    fontSize: 32,
    lineHeight: 1.02,
    letterSpacing: '-0.04em',
    fontWeight: 800,
  },
  heroMetaRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 14,
  },
  metaPill: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 13,
    color: '#e2e8f0',
  },
  heroActions: {
    display: 'grid',
    gap: 10,
  },
  primaryBtn: {
    border: 'none',
    borderRadius: 16,
    padding: '12px 16px',
    background: '#fff',
    color: '#0f172a',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  secondaryBtn: {
    borderRadius: 16,
    padding: '12px 16px',
    background: 'transparent',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  summaryCard: {
    background: '#fff',
    borderRadius: 22,
    padding: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 18px rgba(148,163,184,0.10)',
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 700,
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 24,
    lineHeight: 1.05,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  formCard: {
    background: '#fff',
    borderRadius: 24,
    padding: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 18px rgba(148,163,184,0.10)',
  },
  blockTitle: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  formGrid: {
    display: 'grid',
    gap: 10,
    marginTop: 14,
    gridTemplateColumns: '1fr 1fr',
  },
  input: {
    width: '100%',
    border: '1px solid #dbe2ea',
    borderRadius: 16,
    padding: '12px 14px',
    background: '#fff',
    fontSize: 15,
    outline: 'none',
  },
  inputFull: {
    width: '100%',
    gridColumn: 'span 2',
    border: '1px solid #dbe2ea',
    borderRadius: 16,
    padding: '12px 14px',
    background: '#fff',
    fontSize: 15,
    outline: 'none',
  },
  primaryWideBtn: {
    gridColumn: 'span 2',
    border: 'none',
    borderRadius: 16,
    padding: '13px 16px',
    background: '#0f172a',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  errorBox: {
    marginTop: 10,
    color: '#be123c',
    fontSize: 13,
    fontWeight: 700,
  },
  infoCard: {
    background: '#fff',
    borderRadius: 24,
    padding: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 18px rgba(148,163,184,0.10)',
    color: '#64748b',
  },
  cardsGrid: {
    display: 'grid',
    gap: 12,
  },
  stockCard: {
    background: '#fff',
    borderRadius: 24,
    padding: 14,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 18px rgba(148,163,184,0.10)',
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
    lineHeight: 1,
    letterSpacing: '-0.04em',
  },
  stockMeta: {
    marginTop: 6,
    color: '#64748b',
    fontSize: 13,
  },
  deleteBtn: {
    border: '1px solid #fecaca',
    background: '#fff',
    color: '#dc2626',
    borderRadius: 14,
    padding: '8px 10px',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  priceCard: {
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
  inlineChangeRow: {
    marginTop: 10,
    display: 'flex',
    gap: 14,
    flexWrap: 'wrap',
  },
  inlineChangeText: {
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1.1,
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
