'use client';

import { useEffect, useMemo, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type QuoteItem = {
  symbol:  string;
  price:   number;
  change:  number;
  pct:     number;
  volume?: number;
};

type PricesResponse = {
  debug?: QuoteItem[];
  error?: string;
};

export type UseMarketDataReturn = {
  quotes:      QuoteItem[];
  vnIndex:     QuoteItem | null;
  loading:     boolean;
  marketError: string;
  breadth: {
    gainers: number;
    losers:  number;
    avgPct:  number;
  };
  topPositive: QuoteItem[];
};

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches market quotes for the given symbols and VN-Index.
 * Re-fetches whenever `symbols` reference changes or `ready` flips to true.
 */
export function useMarketData(symbols: string[], ready: boolean): UseMarketDataReturn {
  const [quotes,      setQuotes]      = useState<QuoteItem[]>([]);
  const [vnIndex,     setVnIndex]     = useState<QuoteItem | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [marketError, setMarketError] = useState('');

  // Fetch watchlist quotes
  useEffect(() => {
    if (!ready) return;
    if (!symbols.length) { setQuotes([]); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setMarketError('');

    (async () => {
      try {
        const res  = await fetch(
          `/api/prices?symbols=${encodeURIComponent(symbols.join(','))}`,
          { cache: 'no-store' },
        );
        const data: PricesResponse = await res.json();
        if (!cancelled) {
          if (res.ok) {
            setQuotes([...(data.debug ?? [])].sort((a, b) => a.symbol.localeCompare(b.symbol)));
          } else {
            setMarketError(data.error ?? 'Không thể tải giá thị trường');
          }
        }
      } catch {
        if (!cancelled) setMarketError('Không thể kết nối với server');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [symbols, ready]);

  // Fetch VN-Index separately
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch('/api/prices?symbols=VNINDEX', { cache: 'no-store' });
        const data: PricesResponse = await res.json();
        const item = data?.debug?.[0];
        if (!cancelled) setVnIndex(item && Number(item.price) > 0 ? item : null);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const breadth = useMemo(() => {
    const valid = quotes.filter(i => Number.isFinite(i.pct));
    return {
      gainers: valid.filter(i => i.pct > 0).length,
      losers:  valid.filter(i => i.pct < 0).length,
      avgPct:  valid.length
        ? valid.reduce((s, i) => s + i.pct, 0) / valid.length
        : 0,
    };
  }, [quotes]);

  const topPositive = useMemo(
    () => [...quotes].filter(i => i.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3),
    [quotes],
  );

  return { quotes, vnIndex, loading, marketError, breadth, topPositive };
}
