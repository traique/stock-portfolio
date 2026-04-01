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
  volume?: number;
  error?: string;
};

type PricesResponse = {
  prices?: Record<string, number>;
  debug?: QuoteItem[];
  updatedAt?: string;
  provider?: string;
  error?: string;
};

const DEFAULT_WATCHLIST = ['FPT', 'HPG', 'VCB', 'BID'];
const TOP_SYMBOLS = [
  'FPT',
  'HPG',
  'VCB',
  'BID',
  'CTG',
  'MWG',
  'TCB',
  'MBB',
  'SSI',
  'VND',
  'POW',
  'GAS',
  'HCM',
  'GEX',
  'KBC',
  'VIX',
  'SHS',
  'DIG',
  'NLG',
  'DXG',
];

function formatPrice(value?: number | null) {
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

function formatVolume(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('vi-VN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDateTime(value?: string) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function colorFor(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '#64748b';
  if (value > 0) return '#16a34a';
  if (value < 0) return '#dc2626';
  return '#64748b';
}

function normalizeSymbol(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z]/g, '');
}

export default function HomePage() {
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [watchInput, setWatchInput] = useState('');
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [topQuotes, setTopQuotes] = useState<QuoteItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [provider, setProvider] = useState('');
  const [loading, setLoading] = useState(true);
  const [topLoading, setTopLoading] = useState(true);
  const [error, setError] = useState('');
  const [watchError, setWatchError] = useState('');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('homepage_watchlist') : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) {
          setWatchlist(parsed.map((item) => normalizeSymbol(String(item))).filter(Boolean));
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('homepage_watchlist', JSON.stringify(watchlist));
    }
  }, [watchlist]);

  async function fetchQuotes(symbols: string[]) {
    if (!symbols.length) return { debug: [], updatedAt: '', provider: '' };

    const response = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols.join(','))}`, {
      cache: 'no-store',
    });

    const data: PricesResponse = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || 'Không lấy được dữ liệu');
    }

    return {
      debug: data.debug || [],
      updatedAt: data.updatedAt || '',
      provider: data.provider || '',
    };
  }

  async function loadWatchlistQuotes() {
    setLoading(true);
    setError('');

    try {
      const data = await fetchQuotes(watchlist);
      setQuotes(data.debug);
      setUpdatedAt(data.updatedAt);
      setProvider(data.provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu');
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTopQuotes() {
    setTopLoading(true);

    try {
      const data = await fetchQuotes(TOP_SYMBOLS);
      setTopQuotes(data.debug);
      if (!updatedAt && data.updatedAt) setUpdatedAt(data.updatedAt);
      if (!provider && data.provider) setProvider(data.provider);
    } catch {
      setTopQuotes([]);
    } finally {
      setTopLoading(false);
    }
  }

  useEffect(() => {
    loadWatchlistQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.join(',')]);

  useEffect(() => {
    loadTopQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watchQuotes = useMemo(() => {
    const bySymbol = new Map(quotes.map((item) => [item.symbol.toUpperCase(), item]));
    return watchlist.map(
      (symbol) =>
        bySymbol.get(symbol) || {
          symbol,
          price: 0,
          change: 0,
          pct: 0,
          volume: 0,
        }
    );
  }, [quotes, watchlist]);

  const marketBreadth = useMemo(() => {
    const valid = topQuotes.filter((item) => Number.isFinite(item.pct));
    const gainers = valid.filter((item) => item.pct > 0).length;
    const losers = valid.filter((item) => item.pct < 0).length;
    return { gainers, losers };
  }, [topQuotes]);

  const top10MomentumLiquidity = useMemo(() => {
    return [...topQuotes]
      .filter((item) => Number.isFinite(item.pct) && item.pct > 0)
      .sort((a, b) => {
        const pctDiff = (b.pct || 0) - (a.pct || 0);
        if (Math.abs(pctDiff) > 0.0001) return pctDiff;
        return (b.volume || 0) - (a.volume || 0);
      })
      .slice(0, 10);
  }, [topQuotes]);

  function addWatchSymbol(symbolRaw?: string) {
    const symbol = normalizeSymbol(symbolRaw ?? watchInput);

    if (!symbol) {
      setWatchError('Nhập mã hợp lệ');
      return;
    }

    if (watchlist.includes(symbol)) {
      setWatchError('Mã đã có trong watchlist');
      return;
    }

    setWatchlist((prev) => [...prev, symbol]);
    setWatchInput('');
    setWatchError('');
  }

  function removeWatchSymbol(symbol: string) {
    setWatchlist((prev) => prev.filter((item) => item !== symbol));
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <section style={styles.hero}>
          <div style={styles.eyebrow}>Bảng điều khiển thị trường</div>
          <h1 style={styles.title}>Theo dõi danh mục thông minh</h1>
          <div style={styles.heroMetaRow}>
            <div style={styles.metaPill}>{formatDateTime(updatedAt)}</div>
            <div style={styles.metaPill}>{provider || 'market data'}</div>
          </div>
          <div style={styles.heroActions}>
            <Link href="/auth/login" style={styles.primaryBtn}>
              Vào danh mục
            </Link>
            <button type="button" onClick={loadWatchlistQuotes} style={styles.secondaryBtn}>
              {loading ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>
        </section>

        <section style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Mã tăng</div>
            <div style={styles.summaryValue}>{topLoading ? '--' : marketBreadth.gainers}</div>
          </div>
          <div style={styles.summaryCard}>
            <div style={styles.summaryLabel}>Mã giảm</div>
            <div style={styles.summaryValue}>{topLoading ? '--' : marketBreadth.losers}</div>
          </div>
        </section>

        <section style={styles.block}>
          <div style={styles.blockHead}>
            <div style={styles.blockTitle}>Watchlist</div>
          </div>

          <div style={styles.addRow}>
            <input
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              placeholder="Nhập mã"
              style={styles.input}
            />
            <button type="button" onClick={() => addWatchSymbol()} style={styles.addBtn}>
              Thêm
            </button>
          </div>

          <div style={styles.quickRow}>
            {['FPT', 'HPG', 'VCB', 'BID', 'CTG', 'MWG'].map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => addWatchSymbol(symbol)}
                style={styles.quickChip}
              >
                + {symbol}
              </button>
            ))}
          </div>

          {watchError ? <div style={styles.errorText}>{watchError}</div> : null}
          {error ? <div style={styles.errorText}>{error}</div> : null}

          <div style={styles.watchGrid}>
            {watchQuotes.map((item) => (
              <article key={item.symbol} style={styles.watchCard}>
                <div style={styles.watchHead}>
                  <div>
                    <div style={styles.symbol}>{item.symbol}</div>
                    <div style={styles.ticker}>{item.ticker || `${item.symbol}.VN`}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeWatchSymbol(item.symbol)}
                    style={styles.deleteBtn}
                  >
                    Xóa
                  </button>
                </div>

                <div style={styles.price}>{formatPrice(item.price)}</div>

                <div style={styles.changeLine}>
                  <span style={{ ...styles.changeText, color: colorFor(item.change) }}>
                    {formatChange(item.change)}
                  </span>
                  <span style={{ ...styles.changeText, color: colorFor(item.pct) }}>
                    {formatPct(item.pct)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section style={styles.block}>
          <div style={styles.blockHead}>
            <div style={styles.blockTitle}>Top 10 tăng mạnh</div>
            <div style={styles.blockSub}>ưu tiên thanh khoản</div>
          </div>

          <div style={styles.topList}>
            {top10MomentumLiquidity.map((item, index) => (
              <div key={item.symbol} style={styles.topRow}>
                <div style={styles.rank}>{index + 1}</div>
                <div style={styles.topMain}>
                  <div style={styles.topSymbol}>{item.symbol}</div>
                  <div style={styles.topVolume}>KL: {formatVolume(item.volume)}</div>
                </div>
                <div style={styles.topRight}>
                  <div style={styles.topPrice}>{formatPrice(item.price)}</div>
                  <div style={{ ...styles.topPct, color: colorFor(item.pct) }}>
                    {formatPct(item.pct)}
                  </div>
                </div>
              </div>
            ))}

            {!topLoading && top10MomentumLiquidity.length === 0 ? (
              <div style={styles.empty}>Chưa có dữ liệu</div>
            ) : null}
          </div>
        </section>
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
    boxShadow: '0 14px 32px rgba(15, 23, 42, 0.18)',
  },
  eyebrow: {
    fontSize: 13,
    opacity: 0.8,
    fontWeight: 700,
  },
  title: {
    margin: '8px 0 0',
    fontSize: 34,
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
    display: 'flex',
    gap: 10,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    border: 'none',
    borderRadius: 16,
    padding: '12px 16px',
    background: '#fff',
    color: '#0f172a',
    fontWeight: 800,
    fontSize: 15,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  summaryLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: 700,
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 34,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '-0.04em',
  },
  block: {
    background: '#fff',
    borderRadius: 24,
    padding: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 8px 18px rgba(148,163,184,0.10)',
  },
  blockHead: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  blockTitle: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.03em',
  },
  blockSub: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 700,
  },
  addRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 10,
    marginTop: 14,
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
  addBtn: {
    border: 'none',
    borderRadius: 16,
    padding: '12px 16px',
    background: '#0f172a',
    color: '#fff',
    fontWeight: 800,
    fontSize: 15,
    cursor: 'pointer',
  },
  quickRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  quickChip: {
    border: '1px solid #dbe2ea',
    background: '#f8fafc',
    color: '#334155',
    borderRadius: 999,
    padding: '8px 10px',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  errorText: {
    marginTop: 10,
    color: '#be123c',
    fontSize: 13,
    fontWeight: 700,
  },
  watchGrid: {
    display: 'grid',
    gap: 10,
    marginTop: 12,
  },
  watchCard: {
    background: '#f8fafc',
    borderRadius: 20,
    padding: 14,
    border: '1px solid #e2e8f0',
  },
  watchHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
  },
  symbol: {
    fontSize: 30,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '-0.04em',
  },
  ticker: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748b',
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
  price: {
    marginTop: 14,
    fontSize: 40,
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '-0.04em',
  },
  changeLine: {
    marginTop: 10,
    display: 'flex',
    gap: 14,
    flexWrap: 'wrap',
  },
  changeText: {
    fontSize: 18,
    fontWeight: 800,
  },
  topList: {
    display: 'grid',
    gap: 10,
    marginTop: 14,
  },
  topRow: {
    display: 'grid',
    gridTemplateColumns: '36px 1fr auto',
    gap: 12,
    alignItems: 'center',
    background: '#f8fafc',
    borderRadius: 18,
    padding: '12px 12px',
    border: '1px solid #e2e8f0',
  },
  rank: {
    width: 36,
    height: 36,
    borderRadius: 999,
    background: '#e2e8f0',
    color: '#0f172a',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
  },
  topMain: {
    minWidth: 0,
  },
  topSymbol: {
    fontSize: 18,
    fontWeight: 800,
  },
  topVolume: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
    fontWeight: 700,
  },
  topRight: {
    textAlign: 'right',
  },
  topPrice: {
    fontSize: 18,
    fontWeight: 800,
  },
  topPct: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: 800,
  },
  empty: {
    color: '#64748b',
    fontSize: 14,
  },
};
