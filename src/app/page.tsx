'use client';

import Link from 'next/link';
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

const WATCHLIST = ['FPT', 'HPG', 'VCB', 'BID'];

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

      setQuotes(data.debug || []);
      setUpdatedAt(data.updatedAt || '');
      setProvider(data.provider || '');
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

  const top4 = useMemo(() => {
    return WATCHLIST.map((symbol) => {
      return (
        quotes.find((item) => item.symbol?.toUpperCase() === symbol.toUpperCase()) || {
          symbol,
          price: 0,
          change: 0,
          pct: 0,
        }
      );
    });
  }, [quotes]);

  const topSummary = useMemo(() => {
    const valid = quotes.filter((item) => Number.isFinite(item.pct));
    const gainers = valid.filter((item) => item.pct > 0).length;
    const losers = valid.filter((item) => item.pct < 0).length;
    const avgMove =
      valid.length > 0 ? valid.reduce((sum, item) => sum + item.pct, 0) / valid.length : 0;

    return { gainers, losers, avgMove };
  }, [quotes]);

  return (
    <main className="container">
      <section
        className="hero"
        style={{
          padding: 20,
          borderRadius: 28,
        }}
      >
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: '1.35fr 1fr',
          }}
        >
          <div>
            <div style={{ opacity: 0.8, fontSize: 14, fontWeight: 700 }}>Supabase + Vercel</div>
            <h1
              style={{
                fontSize: 40,
                lineHeight: 1.1,
                margin: '12px 0 0',
                fontWeight: 800,
                letterSpacing: '-0.03em',
              }}
            >
              Theo dõi lời lỗ cổ phiếu
              <br />
              gọn, rõ, dễ quét
            </h1>

            <p
              style={{
                marginTop: 16,
                color: '#cbd5e1',
                lineHeight: 1.7,
                fontSize: 16,
              }}
            >
              Nhập mã cổ phiếu, giá mua, số lượng. Hệ thống lấy giá hiện tại và hiển thị thêm mức
              thay đổi cùng phần trăm thay đổi cho từng mã quan trọng.
            </p>

            <div
              style={{
                marginTop: 18,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <Link href="/auth/login" className="btn btn-light">
                Bắt đầu ngay
              </Link>
              <button
                type="button"
                className="btn btn-outline"
                onClick={loadPrices}
                style={{ borderColor: 'rgba(255,255,255,0.22)' }}
              >
                {loading ? 'Đang tải...' : 'Làm mới giá'}
              </button>
            </div>

            <div
              style={{
                marginTop: 18,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
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
            className="card"
            style={{
              padding: 18,
              color: '#0f172a',
              borderRadius: 24,
            }}
          >
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <div className="card" style={{ padding: 16, background: '#f8fafc' }}>
                <div className="summary-label">Mã tăng</div>
                <div className="summary-value">{topSummary.gainers}</div>
              </div>

              <div className="card" style={{ padding: 16, background: '#f8fafc' }}>
                <div className="summary-label">Mã giảm</div>
                <div className="summary-value">{topSummary.losers}</div>
              </div>
            </div>

            <div
              className="card"
              style={{
                padding: 16,
                background: topSummary.avgMove >= 0 ? '#ecfdf5' : '#fef2f2',
                marginTop: 12,
              }}
            >
              <div
                className="summary-label"
                style={{ color: topSummary.avgMove >= 0 ? '#047857' : '#b91c1c' }}
              >
                Biến động trung bình
              </div>
              <div
                className="summary-value"
                style={{ color: topSummary.avgMove >= 0 ? '#16a34a' : '#dc2626' }}
              >
                {formatPct(topSummary.avgMove)}
              </div>
            </div>

            {error ? (
              <div
                style={{
                  marginTop: 12,
                  color: '#b91c1c',
                  background: '#fff1f2',
                  border: '1px solid #fecdd3',
                  borderRadius: 16,
                  padding: 12,
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section
        style={{
          marginTop: 16,
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        }}
      >
        {top4.map((item) => (
          <article
            key={item.symbol}
            className="card"
            style={{
              padding: 18,
              borderRadius: 24,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: '#0f172a',
                  }}
                >
                  {item.symbol}
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {item.ticker || `${item.symbol}.VN`}
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  height: 'fit-content',
                }}
              >
                Theo dõi
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="summary-label">Giá hiện tại</div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 42,
                  lineHeight: 1,
                  fontWeight: 800,
                  letterSpacing: '-0.04em',
                }}
              >
                {formatPrice(item.price)}
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                display: 'grid',
                gap: 12,
                gridTemplateColumns: '1fr 1fr',
              }}
            >
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: 18,
                  padding: 12,
                }}
              >
                <div className="summary-label">Thay đổi</div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 24,
                    fontWeight: 800,
                    color: getChangeColor(item.change),
                  }}
                >
                  {formatChange(item.change)}
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: 18,
                  padding: 12,
                }}
              >
                <div className="summary-label">% thay đổi</div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 24,
                    fontWeight: 800,
                    color: getChangeColor(item.pct),
                  }}
                >
                  {formatPct(item.pct)}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      <style jsx>{`
        @media (max-width: 1024px) {
          .hero > div {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 900px) {
          section[style*='repeat(4, minmax(0, 1fr))'] {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 640px) {
          section[style*='repeat(4, minmax(0, 1fr))'] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
