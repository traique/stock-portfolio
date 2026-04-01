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
  items.forEach((item) => {
    map.set(item.symbol.toUpperCase(), item);
  });
  return map;
}

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [quotes, setQuotes] = useState<QuoteDebugItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [provider, setProvider] = useState('');
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
      console.error(error);
      setHoldings([]);
      setMessage('Không tải được danh mục.');
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
        setMessage(data?.error || 'Không lấy được giá hiện tại.');
      } else {
        setPrices(data.prices || {});
        setQuotes(data.debug || []);
        setUpdatedAt(data.updatedAt || '');
        setProvider(data.provider || '');
      }
    } catch (error) {
      console.error(error);
      setPrices({});
      setQuotes([]);
      setMessage('Lỗi kết nối khi lấy giá.');
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

  const topGainers = useMemo(() => {
    return [...quotes]
      .filter((item) => Number.isFinite(item.pct) && item.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [quotes]);

  const topLosers = useMemo(() => {
    return [...quotes]
      .filter((item) => Number.isFinite(item.pct) && item.pct < 0)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);
  }, [quotes]);

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
      setMessage('Vui lòng nhập đầy đủ mã, giá mua và số lượng.');
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

  async function handleRefreshAll() {
    await loadHoldings();
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f4f7fb',
        color: '#0f172a',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <section
          style={{
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            color: '#fff',
            borderRadius: 28,
            padding: 22,
            boxShadow: '0 16px 40px rgba(15,23,42,0.16)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gap: 16,
              gridTemplateColumns: '1.5fr 1fr',
            }}
          >
            <div>
              <div style={{ fontSize: 14, opacity: 0.8 }}>Xin chào{email ? `, ${email}` : ''}</div>
              <h1
                style={{
                  margin: '10px 0 0',
                  fontSize: 36,
                  lineHeight: 1.08,
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                }}
              >
                Danh mục cổ phiếu
              </h1>
              <p
                style={{
                  marginTop: 10,
                  color: '#cbd5e1',
                  lineHeight: 1.7,
                  fontSize: 16,
                }}
              >
                Theo dõi tổng vốn, giá trị hiện tại, lời lỗ và biến động giá từng mã theo bố cục bento
                gọn, dễ quét.
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 18,
                }}
              >
                <div
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 16,
                    padding: '10px 12px',
                    fontSize: 14,
                    color: '#e2e8f0',
                  }}
                >
                  Cập nhật: {formatDateTime(updatedAt)}
                </div>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 16,
                    padding: '10px 12px',
                    fontSize: 14,
                    color: '#e2e8f0',
                  }}
                >
                  Nguồn: {provider || '--'}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                alignItems: 'stretch',
                justifyContent: 'flex-start',
              }}
            >
              <button
                type="button"
                onClick={handleRefreshAll}
                style={{
                  border: 'none',
                  borderRadius: 18,
                  padding: '12px 16px',
                  fontWeight: 700,
                  background: '#fff',
                  color: '#0f172a',
                  cursor: 'pointer',
                }}
              >
                {refreshing || loading ? 'Đang tải...' : 'Làm mới'}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  borderRadius: 18,
                  padding: '12px 16px',
                  fontWeight: 700,
                  background: 'transparent',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.22)',
                  cursor: 'pointer',
                }}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(12, 1fr)',
          }}
        >
          <div
            style={{
              gridColumn: 'span 8',
              display: 'grid',
              gap: 16,
            }}
          >
            <section
              style={{
                background: '#fff',
                borderRadius: 26,
                border: '1px solid #e2e8f0',
                boxShadow: '0 10px 24px rgba(148,163,184,0.12)',
                padding: 20,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 24,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                  }}
                >
                  Thêm cổ phiếu
                </h2>
                <p
                  style={{
                    marginTop: 8,
                    color: '#64748b',
                    lineHeight: 1.7,
                  }}
                >
                  Nhập mã, giá mua, số lượng và ngày mua để hệ thống tự tính lời lỗ.
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                style={{
                  marginTop: 16,
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                }}
              >
                <input
                  value={form.symbol}
                  onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                  placeholder="Mã cổ phiếu"
                  required
                  style={inputStyle}
                />
                <input
                  value={form.buy_price}
                  onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
                  type="number"
                  placeholder="Giá mua"
                  required
                  style={inputStyle}
                />
                <input
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  type="number"
                  placeholder="Số lượng"
                  required
                  style={inputStyle}
                />
                <input
                  value={form.buy_date}
                  onChange={(e) => setForm({ ...form, buy_date: e.target.value })}
                  type="date"
                  style={inputStyle}
                />
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Ghi chú"
                  style={{ ...inputStyle, gridColumn: 'span 2' }}
                />

                <button
                  type="submit"
                  style={{
                    gridColumn: 'span 2',
                    border: 'none',
                    borderRadius: 18,
                    padding: '14px 16px',
                    background: '#0f172a',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Thêm mã
                </button>
              </form>

              {message ? (
                <div
                  style={{
                    marginTop: 12,
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    color: '#be123c',
                    borderRadius: 16,
                    padding: 12,
                    fontSize: 14,
                  }}
                >
                  {message}
                </div>
              ) : null}
            </section>

            <section
              style={{
                display: 'grid',
                gap: 16,
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              }}
            >
              {holdings.map((holding) => {
                const row = calcHolding(holding, prices);
                const quote = quoteMap.get(holding.symbol.toUpperCase());
                const positive = row.pnl >= 0;

                return (
                  <article
                    key={holding.id}
                    style={{
                      background: '#fff',
                      borderRadius: 24,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 24px rgba(148,163,184,0.12)',
                      padding: 18,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 28,
                            fontWeight: 800,
                            letterSpacing: '-0.03em',
                          }}
                        >
                          {holding.symbol}
                        </div>
                        <div style={{ color: '#64748b', marginTop: 6 }}>
                          SL: {holding.quantity}
                          {holding.buy_date ? ` • ${holding.buy_date}` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(holding.id, holding.symbol)}
                        style={{
                          border: '1px solid #fecaca',
                          background: '#fff',
                          color: '#dc2626',
                          borderRadius: 14,
                          padding: '10px 12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Xóa
                      </button>
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        display: 'grid',
                        gap: 12,
                        gridTemplateColumns: '1.25fr 1fr 1fr',
                      }}
                    >
                      <div
                        style={{
                          background: '#f8fafc',
                          borderRadius: 18,
                          padding: 14,
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={labelStyle}>Giá hiện tại</div>
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 34,
                            fontWeight: 800,
                            letterSpacing: '-0.03em',
                          }}
                        >
                          {formatPrice(quote?.price ?? row.currentPrice)}
                        </div>
                      </div>

                      <div
                        style={{
                          background: '#f8fafc',
                          borderRadius: 18,
                          padding: 14,
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={labelStyle}>Thay đổi</div>
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 24,
                            fontWeight: 800,
                            color: getChangeColor(quote?.change),
                          }}
                        >
                          {formatChange(quote?.change)}
                        </div>
                      </div>

                      <div
                        style={{
                          background: '#f8fafc',
                          borderRadius: 18,
                          padding: 14,
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={labelStyle}>% thay đổi</div>
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 24,
                            fontWeight: 800,
                            color: getChangeColor(quote?.pct),
                          }}
                        >
                          {formatPct(quote?.pct)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        display: 'grid',
                        gap: 12,
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      }}
                    >
                      <div style={miniCardStyle}>
                        <div style={labelStyle}>Giá mua</div>
                        <div style={valueStyle}>{formatCurrency(Number(holding.buy_price))}</div>
                      </div>
                      <div style={miniCardStyle}>
                        <div style={labelStyle}>Tổng mua</div>
                        <div style={valueStyle}>{formatCurrency(row.totalBuy)}</div>
                      </div>
                      <div style={miniCardStyle}>
                        <div style={labelStyle}>Tổng hiện tại</div>
                        <div style={valueStyle}>{formatCurrency(row.totalNow)}</div>
                      </div>
                      <div style={miniCardStyle}>
                        <div style={labelStyle}>Lời / Lỗ</div>
                        <div
                          style={{
                            ...valueStyle,
                            color: positive ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {formatCurrency(row.pnl)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        padding: 14,
                        borderRadius: 18,
                        background: positive ? '#ecfdf5' : '#fef2f2',
                        border: positive ? '1px solid #bbf7d0' : '1px solid #fecaca',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: positive ? '#166534' : '#991b1b' }}>
                        Hiệu suất vị thế
                      </div>
                      <div
                        style={{
                          fontSize: 26,
                          fontWeight: 800,
                          color: positive ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {row.pnlPct >= 0 ? '+' : ''}
                        {row.pnlPct.toFixed(2)}%
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            {!loading && holdings.length === 0 ? (
              <section
                style={{
                  background: '#fff',
                  borderRadius: 24,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 10px 24px rgba(148,163,184,0.12)',
                  padding: 20,
                  color: '#64748b',
                }}
              >
                Chưa có mã nào. Hãy thêm mã đầu tiên của bạn.
              </section>
            ) : null}
          </div>

          <div
            style={{
              gridColumn: 'span 4',
              display: 'grid',
              gap: 16,
              alignContent: 'start',
            }}
          >
            <section style={summaryCardStyle}>
              <div style={labelStyle}>Tổng vốn</div>
              <div style={{ ...bigValueStyle }}>{formatCurrency(summary.totalBuy)}</div>
            </section>

            <section style={summaryCardStyle}>
              <div style={labelStyle}>Giá trị hiện tại</div>
              <div style={{ ...bigValueStyle }}>{formatCurrency(summary.totalNow)}</div>
            </section>

            <section style={summaryCardStyle}>
              <div style={labelStyle}>Lời / Lỗ toàn danh mục</div>
              <div
                style={{
                  ...bigValueStyle,
                  color: summary.totalPnl >= 0 ? '#16a34a' : '#dc2626',
                }}
              >
                {formatCurrency(summary.totalPnl)}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontWeight: 800,
                  color: summary.totalPnl >= 0 ? '#16a34a' : '#dc2626',
                }}
              >
                {summaryPct >= 0 ? '+' : ''}
                {summaryPct.toFixed(2)}%
              </div>
            </section>

            <section style={summaryCardStyle}>
              <div style={labelStyle}>Mã tăng mạnh</div>
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                {topGainers.length === 0 ? (
                  <div style={{ color: '#64748b' }}>Chưa có dữ liệu.</div>
                ) : (
                  topGainers.map((item) => (
                    <div key={item.symbol} style={listItemStyle}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{item.symbol}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                          {formatPrice(item.price)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', color: '#16a34a', fontWeight: 800 }}>
                        <div>{formatChange(item.change)}</div>
                        <div>{formatPct(item.pct)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section style={summaryCardStyle}>
              <div style={labelStyle}>Mã giảm mạnh</div>
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                {topLosers.length === 0 ? (
                  <div style={{ color: '#64748b' }}>Chưa có dữ liệu.</div>
                ) : (
                  topLosers.map((item) => (
                    <div key={item.symbol} style={listItemStyle}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{item.symbol}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                          {formatPrice(item.price)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', color: '#dc2626', fontWeight: 800 }}>
                        <div>{formatChange(item.change)}</div>
                        <div>{formatPct(item.pct)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 1180px) {
          section[style*='grid-template-columns: repeat(12, 1fr)'] > div:first-child,
          section[style*='grid-template-columns: repeat(12, 1fr)'] > div:last-child {
            grid-column: span 12 !important;
          }
        }

        @media (max-width: 1024px) {
          section[style*='grid-template-columns: 1.5fr 1fr'] {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 900px) {
          section[style*='grid-template-columns: repeat(2, minmax(0, 1fr))'] {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 720px) {
          form[style*='grid-template-columns: repeat(2, minmax(0, 1fr))'] {
            grid-template-columns: 1fr !important;
          }

          form[style*='grid-template-columns: repeat(2, minmax(0, 1fr))'] input,
          form[style*='grid-template-columns: repeat(2, minmax(0, 1fr))'] button {
            grid-column: span 1 !important;
          }

          div[style*='grid-template-columns: 1.25fr 1fr 1fr'] {
            grid-template-columns: 1fr !important;
          }

          div[style*='grid-template-columns: repeat(2, minmax(0, 1fr))'] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #dbe2ea',
  borderRadius: 16,
  padding: '12px 14px',
  background: '#fff',
  fontSize: 15,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#64748b',
  fontWeight: 700,
};

const valueStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: '-0.02em',
};

const bigValueStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 34,
  fontWeight: 800,
  letterSpacing: '-0.03em',
};

const miniCardStyle: React.CSSProperties = {
  background: '#f8fafc',
  borderRadius: 18,
  padding: 14,
  border: '1px solid #e2e8f0',
};

const summaryCardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 24,
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 24px rgba(148,163,184,0.12)',
  padding: 18,
};

const listItemStyle: React.CSSProperties = {
  background: '#f8fafc',
  borderRadius: 18,
  padding: '12px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};
