'use client';

import Link from 'next/link';
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

type ThemeMode = 'light' | 'dark';

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
  const [updatedAt, setUpdatedAt] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [form, setForm] = useState({
    symbol: '',
    buy_price: '',
    quantity: '',
    buy_date: '',
    note: '',
  });

  useEffect(() => {
    const savedTheme = localStorage.getItem('alphaboard_theme') as ThemeMode | null;
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
      document.documentElement.dataset.theme = savedTheme;
    } else {
      document.documentElement.dataset.theme = 'light';
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('alphaboard_theme', theme);
  }, [theme]);

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
    <main className="ab-page">
      <div className="ab-shell">
        <section className="ab-hero">
          <div className="ab-hero-top">
            <div className="ab-badge">AlphaBoard</div>

            <div className="ab-top-actions">
              <Link href="/" className="ab-icon-link" aria-label="Trang chủ">
                🏠
              </Link>
              <button
                type="button"
                className="ab-icon-btn"
                onClick={() => setSettingsOpen((prev) => !prev)}
                aria-label="Tùy chỉnh"
              >
                ⚙️
              </button>
            </div>
          </div>

          <h1 className="ab-title">Danh mục đầu tư</h1>

          <div className="ab-meta-row">
            <div className="ab-pill">{formatDateTime(updatedAt)}</div>
          </div>

          <div className="ab-user">{email}</div>

          <div className="ab-action-row">
            <button className="ab-btn ab-btn-primary" onClick={handleRefresh}>
              {refreshing || loading ? 'Đang tải...' : 'Làm mới'}
            </button>
            <button className="ab-btn ab-btn-secondary" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>

          {settingsOpen ? (
            <div className="ab-settings">
              <button
                type="button"
                className={`ab-chip ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
              >
                Sáng
              </button>
              <button
                type="button"
                className={`ab-chip ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                Tối
              </button>
            </div>
          ) : null}
        </section>

        <section className="ab-summary-grid">
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
            <div
              className="ab-summary-value"
              style={{ color: dayPnl >= 0 ? 'var(--green)' : 'var(--red)' }}
            >
              {formatCurrency(dayPnl)}
            </div>
          </div>

          <div className="ab-summary-card">
            <div className="ab-label">Lãi/lỗ danh mục</div>
            <div
              className="ab-summary-value"
              style={{ color: summary.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}
            >
              {formatCurrency(summary.totalPnl)}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 14,
                fontWeight: 800,
                color: summary.totalPnl >= 0 ? 'var(--green)' : 'var(--red)',
              }}
            >
              {summaryPct >= 0 ? '+' : ''}
              {summaryPct.toFixed(2)}%
            </div>
          </div>
        </section>

        <section className="ab-card">
          <div className="ab-section-title">Thêm cổ phiếu</div>

          <form onSubmit={handleSubmit} className="ab-form-grid">
            <input
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              placeholder="Mã"
              required
              className="ab-input"
            />
            <input
              value={form.buy_price}
              onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
              type="number"
              placeholder="Giá mua"
              required
              className="ab-input"
            />
            <input
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              type="number"
              placeholder="Số lượng"
              required
              className="ab-input"
            />
            <input
              value={form.buy_date}
              onChange={(e) => setForm({ ...form, buy_date: e.target.value })}
              type="date"
              className="ab-input"
            />
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Ghi chú"
              className="ab-input ab-full"
            />
            <button type="submit" className="ab-btn ab-btn-primary ab-full">
              Thêm mã
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

                    <button
                      type="button"
                      className="ab-delete"
                      onClick={() => handleDelete(holding.id, holding.symbol)}
                    >
                      Xóa
                    </button>
                  </div>

                  <div className="ab-price-card">
                    <div className="ab-label">Giá hiện tại</div>
                    <div className="ab-price">{formatCompactPrice(quote?.price ?? row.currentPrice)}</div>

                    <div className="ab-change-row">
                      <span style={{ color: getChangeColor(quote?.change) }}>
                        {formatChange(quote?.change)}
                      </span>
                      <span style={{ color: getChangeColor(quote?.pct) }}>
                        {formatPct(quote?.pct)}
                      </span>
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
                      <div
                        className="ab-mini-value"
                        style={{ color: positive ? 'var(--green)' : 'var(--red)' }}
                      >
                        {formatCurrency(row.pnl)}
                      </div>
                    </div>
                  </div>

                  <div
                    className="ab-performance"
                    style={{
                      background: positive ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                      borderColor: positive ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                      color: positive ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    <span>Hiệu suất</span>
                    <strong>
                      {row.pnlPct >= 0 ? '+' : ''}
                      {row.pnlPct.toFixed(2)}%
                    </strong>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      <style jsx>{`
        .ab-page {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          font-family:
            Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial,
            'Noto Sans', sans-serif;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .ab-shell {
          max-width: 1100px;
          margin: 0 auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .ab-hero,
        .ab-card,
        .ab-summary-card,
        .ab-stock-card {
          transition:
            background 0.2s ease,
            border-color 0.2s ease,
            color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .ab-hero {
          background: linear-gradient(135deg, #0b1530, #12224a);
          color: #fff;
          border-radius: 28px;
          padding: 18px;
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.18);
        }

        .ab-hero-top,
        .ab-row-between {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .ab-top-actions {
          display: flex;
          gap: 8px;
        }

        .ab-badge {
          display: inline-flex;
          width: fit-content;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.12);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .ab-icon-btn,
        .ab-icon-link {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          cursor: pointer;
        }

        .ab-title {
          margin: 14px 0 0;
          font-size: 34px;
          line-height: 1.02;
          letter-spacing: -0.04em;
          font-weight: 800;
        }

        .ab-meta-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .ab-pill {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 13px;
          color: #e2e8f0;
        }

        .ab-user {
          margin-top: 12px;
          color: #cbd5e1;
          font-size: 13px;
          word-break: break-word;
        }

        .ab-action-row {
          display: grid;
          gap: 10px;
          margin-top: 14px;
        }

        .ab-settings {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .ab-chip {
          border: 1px solid var(--border);
          background: var(--soft);
          color: var(--text);
          border-radius: 999px;
          padding: 8px 10px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }

        .ab-chip.active {
          background: var(--text);
          color: var(--card);
          border-color: var(--text);
        }

        .ab-btn {
          border-radius: 16px;
          padding: 12px 16px;
          font-weight: 800;
          font-size: 15px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          text-decoration: none;
        }

        .ab-btn-primary {
          border: none;
          background: var(--primary);
          color: #fff;
        }

        .ab-btn-secondary {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          color: #fff;
        }

        .ab-card {
          background: var(--card);
          border-radius: 24px;
          padding: 16px;
          border: 1px solid var(--border);
          box-shadow: 0 8px 18px rgba(148, 163, 184, 0.1);
        }

        .ab-section-title {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .ab-form-grid {
          display: grid;
          gap: 10px;
          margin-top: 14px;
          grid-template-columns: 1fr 1fr;
        }

        .ab-input {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 12px 14px;
          background: var(--card);
          color: var(--text);
          font-size: 15px;
          outline: none;
        }

        .ab-full {
          grid-column: span 2;
        }

        .ab-error {
          margin-top: 10px;
          color: var(--red);
          font-size: 13px;
          font-weight: 700;
        }

        .ab-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .ab-summary-card {
          background: var(--card);
          border-radius: 22px;
          padding: 16px;
          border: 1px solid var(--border);
          box-shadow: 0 8px 18px rgba(148, 163, 184, 0.1);
        }

        .ab-label {
          font-size: 12px;
          color: var(--muted);
          font-weight: 700;
        }

        .ab-summary-value {
          margin-top: 8px;
          font-size: 24px;
          line-height: 1.05;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .ab-list {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .ab-stock-card {
          background: var(--card);
          border-radius: 24px;
          padding: 14px;
          border: 1px solid var(--border);
          box-shadow: 0 8px 18px rgba(148, 163, 184, 0.1);
        }

        .ab-symbol {
          font-size: 30px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -0.04em;
        }

        .ab-muted {
          margin-top: 6px;
          color: var(--muted);
          font-size: 13px;
        }

        .ab-delete {
          border: 1px solid #fecaca;
          background: var(--card);
          color: var(--red);
          border-radius: 14px;
          padding: 8px 10px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
        }

        .ab-price-card {
          margin-top: 14px;
          background: var(--soft);
          border-radius: 18px;
          padding: 14px;
          border: 1px solid var(--border);
        }

        .ab-price {
          margin-top: 6px;
          font-size: 42px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
        }

        .ab-change-row {
          margin-top: 10px;
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          font-size: 16px;
          font-weight: 800;
        }

        .ab-mini-grid {
          margin-top: 10px;
          display: grid;
          gap: 10px;
          grid-template-columns: 1fr 1fr;
        }

        .ab-mini-card {
          background: var(--soft);
          border-radius: 16px;
          padding: 12px;
          border: 1px solid var(--border);
          min-width: 0;
        }

        .ab-mini-value {
          margin-top: 8px;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.02em;
          word-break: break-word;
        }

        .ab-performance {
          margin-top: 10px;
          border-radius: 16px;
          border: 1px solid;
          padding: 12px 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        :global(:root) {
          --bg: #f4f7fb;
          --card: #ffffff;
          --soft: #f8fafc;
          --text: #0f172a;
          --muted: #64748b;
          --border: #dbe2ea;
          --primary: #0f172a;
          --green: #16a34a;
          --red: #dc2626;
        }

        :global(:root[data-theme='dark']) {
          --bg: #0b1220;
          --card: #111827;
          --soft: #172033;
          --text: #f8fafc;
          --muted: #94a3b8;
          --border: #243041;
          --primary: #2563eb;
          --green: #22c55e;
          --red: #f87171;
        }

        @media (max-width: 1024px) {
          .ab-summary-grid {
            grid-template-columns: 1fr 1fr;
          }

          .ab-list {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .ab-form-grid {
            grid-template-columns: 1fr;
          }

          .ab-full {
            grid-column: span 1;
          }

          .ab-hero-top,
          .ab-row-between {
            flex-direction: row;
          }
        }
      `}</style>
    </main>
  );
}
