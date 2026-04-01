'use client';

import { useEffect, useMemo, useState } from 'react';

type QuoteItem = {
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
  prices?: Record<string, number>;
  debug?: QuoteItem[];
  updatedAt?: string;
  provider?: string;
  error?: string;
};

const WATCHLIST = ['FPT', 'HPG', 'VCB', 'BID', 'CTG', 'MWG'];

function formatPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatChange(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return `${sign}${value.toFixed(1)}`;
}

function formatDateTime(value?: string) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function getChangeColor(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '#64748b';
  if (value > 0) return '#16a34a';
  if (value < 0) return '#dc2626';
  return '#64748b';
}

function getQuotesMap(data?: QuoteItem[]) {
  const map = new Map<string, QuoteItem>();
  (data || []).forEach((item) => {
    map.set(item.symbol.toUpperCase(), item);
  });
  return map;
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState('');
  const [provider, setProvider] = useState('');
  const [error, setError] = useState('');
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);

  async function loadPrices() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/prices?symbols=${WATCHLIST.join(',')}`, {
        cache: 'no-store',
      });

      const data: PricesResponse = await response.json();

      if (!response.ok) {
        setError(data?.error || 'Không lấy được dữ liệu giá.');
        setQuotes([]);
        return;
      }

      setUpdatedAt(data.updatedAt || '');
      setProvider(data.provider || '');
      setQuotes(data.debug || []);
    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối khi tải dữ liệu.');
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPrices();
  }, []);

  const quoteMap = useMemo(() => getQuotesMap(quotes), [quotes]);

  const topMovers = useMemo(() => {
    return [...quotes]
      .filter((item) => Number.isFinite(item.pct))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, 3);
  }, [quotes]);

  const gainers = useMemo(() => {
    return [...quotes]
      .filter((item) => item.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [quotes]);

  const losers = useMemo(() => {
    return [...quotes]
      .filter((item) => item.pct < 0)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);
  }, [quotes]);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f4f7fb',
        color: '#0f172a',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '20px 16px 32px',
        }}
      >
        <section
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: '1.5fr 1fr',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #0f172a, #1e293b)',
              color: '#fff',
              borderRadius: 28,
              padding: 24,
              boxShadow: '0 12px 30px rgba(15,23,42,0.15)',
            }}
          >
            <div style={{ fontSize: 14, opacity: 0.8 }}>Bảng theo dõi thị trường</div>
            <h1
              style={{
                margin: '10px 0 8px',
                fontSize: 38,
                lineHeight: 1.1,
                fontWeight: 800,
                letterSpacing: '-0.03em',
              }}
            >
              Tổng quan cổ phiếu
            </h1>
            <p
              style={{
                margin: 0,
                color: 'rgba(255,255,255,0.8)',
                fontSize: 16,
                lineHeight: 1.6,
              }}
            >
              Bố cục bento mới, ưu tiên mã quan trọng, dễ quét nhanh giá hiện tại, thay đổi và phần trăm thay đổi.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                marginTop: 18,
              }}
            >
              <div
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 16,
                  padding: '10px 14px',
                  fontSize: 14,
                }}
              >
                Cập nhật: {formatDateTime(updatedAt)}
              </div>
              <div
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 16,
                  padding: '10px 14px',
                  fontSize: 14,
                }}
              >
                Nguồn: {provider || '--'}
              </div>
              <button
                onClick={loadPrices}
                style={{
                  border: 'none',
                  borderRadius: 16,
                  padding: '10px 14px',
                  fontSize: 14,
                  fontWeight: 700,
                  background: '#fff',
                  color: '#0f172a',
                  cursor: 'pointer',
                }}
              >
                {loading ? 'Đang tải...' : 'Làm mới'}
              </button>
            </div>
          </div>

          <div
            style={{
              background: '#fff',
              borderRadius: 28,
              padding: 20,
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 24px rgba(148,163,184,0.12)',
            }}
          >
            <div style={{ fontSize: 14, color: '#64748b', fontWeight: 700 }}>Biến động mạnh</div>
            <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
              {topMovers.length === 0 ? (
                <div style={{ color: '#64748b' }}>Chưa có dữ liệu.</div>
              ) : (
                topMovers.map((item) => (
                  <div
                    key={item.symbol}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fafc',
                      borderRadius: 18,
                      padding: '14px 16px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{item.symbol}</div>
                      <div style={{ color: '#64748b', marginTop: 4 }}>
                        {formatPrice(item.price)}
                      </div>
                    </div>
                    <div
                      style={{
                        textAlign: 'right',
                        color: getChangeColor(item.pct),
                        fontWeight: 800,
                      }}
                    >
                      <div>{formatChange(item.change)}</div>
                      <div style={{ marginTop: 4 }}>{formatPct(item.pct)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {error ? (
          <section
            style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              color: '#be123c',
              borderRadius: 20,
              padding: 16,
              marginBottom: 16,
            }}
          >
            {error}
          </section>
        ) : null}

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
              background: '#fff',
              borderRadius: 28,
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 24px rgba(148,163,184,0.12)',
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 700 }}>
                  Watchlist chính
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>
                  Các mã quan trọng
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 14,
              }}
            >
              {WATCHLIST.map((symbol) => {
                const item = quoteMap.get(symbol);

                return (
                  <div
                    key={symbol}
                    style={{
                      background: '#f8fafc',
                      borderRadius: 22,
                      padding: 18,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div
                          style={{
                            fontSize: 22,
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {symbol}
                        </div>
                        <div style={{ color: '#64748b', marginTop: 6 }}>Mã cổ phiếu</div>
                      </div>

                      <div
                        style={{
                          alignSelf: 'flex-start',
                          borderRadius: 999,
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          padding: '6px 10px',
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#64748b',
                        }}
                      >
                        {item?.ticker || `${symbol}.VN`}
                      </div>
                    </div>

                    <div style={{ marginTop: 18 }}>
                      <div style={{ color: '#64748b', fontSize: 14, fontWeight: 700 }}>
                        Giá hiện tại
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 38,
                          fontWeight: 800,
                          letterSpacing: '-0.03em',
                        }}
                      >
                        {item ? formatPrice(item.price) : 'N/A'}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          background: '#fff',
                          borderRadius: 18,
                          padding: 12,
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>
                          Thay đổi
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 24,
                            fontWeight: 800,
                            color: getChangeColor(item?.change),
                          }}
                        >
                          {formatChange(item?.change)}
                        </div>
                      </div>

                      <div
                        style={{
                          background: '#fff',
                          borderRadius: 18,
                          padding: 12,
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>
                          % thay đổi
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 24,
                            fontWeight: 800,
                            color: getChangeColor(item?.pct),
                          }}
                        >
                          {formatPct(item?.pct)}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, color: '#64748b', fontSize: 13 }}>
                      Prev close: {item ? formatPrice(item.previousClose) : 'N/A'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              gridColumn: 'span 4',
              display: 'grid',
              gap: 16,
            }}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 28,
                border: '1px solid #e2e8f0',
                boxShadow: '0 10px 24px rgba(148,163,184,0.12)',
                padding: 20,
              }}
            >
              <div style={{ fontSize: 14, color: '#64748b', fontWeight: 700 }}>Tăng mạnh</div>
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                {gainers.length === 0 ? (
                  <div style={{ color: '#64748b' }}>Chưa có dữ liệu.</div>
                ) : (
                  gainers.map((item) => (
                    <div
                      key={item.symbol}
                      style={{
                        background: '#f8fafc',
                        borderRadius: 18,
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{item.symbol}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                          {formatPrice(item.price)}
                        </div>
                      </div>
                      <div style={{ color: '#16a34a', fontWeight: 800, textAlign: 'right' }}>
                        <div>{formatChange(item.change)}</div>
                        <div>{formatPct(item.pct)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: 28,
                border: '1px solid #e2e8f0',
                boxShadow: '0 10px 24px rgba(148,163,184,0.12)',
                padding: 20,
              }}
            >
              <div style={{ fontSize: 14, color: '#64748b', fontWeight: 700 }}>Giảm mạnh</div>
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                {losers.length === 0 ? (
                  <div style={{ color: '#64748b' }}>Chưa có dữ liệu.</div>
                ) : (
                  losers.map((item) => (
                    <div
                      key={item.symbol}
                      style={{
                        background: '#f8fafc',
                        borderRadius: 18,
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800 }}>{item.symbol}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                          {formatPrice(item.price)}
                        </div>
                      </div>
                      <div style={{ color: '#dc2626', fontWeight: 800, textAlign: 'right' }}>
                        <div>{formatChange(item.change)}</div>
                        <div>{formatPct(item.pct)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 1024px) {
          section[style*='grid-template-columns: 1.5fr 1fr'] {
            grid-template-columns: 1fr !important;
          }

          section[style*='grid-template-columns: repeat(12, 1fr)'] > div:first-child,
          section[style*='grid-template-columns: repeat(12, 1fr)'] > div:last-child {
            grid-column: span 12 !important;
          }
        }

        @media (max-width: 768px) {
          div[style*='grid-template-columns: repeat(2, minmax(0, 1fr))'] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
