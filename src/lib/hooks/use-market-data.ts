'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
  /** Timestamp ms của lần giá cập nhật thành công gần nhất (dùng cho price flash) */
  updatedAt:   number;
};

const REFRESH_MS = 60_000;

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetches market quotes — 1 request duy nhất cho watchlist + VN-INDEX
 * (trước đây là 2 request nối tiếp), tự làm mới mỗi 60s khi tab đang visible.
 */
export function useMarketData(symbols: string[], ready: boolean): UseMarketDataReturn {
  const [quotes,      setQuotes]      = useState<QuoteItem[]>([]);
  const [vnIndex,     setVnIndex]     = useState<QuoteItem | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [marketError, setMarketError] = useState('');
  const [updatedAt,   setUpdatedAt]   = useState(0);

  // Giữ symbols mới nhất để interval refresh dùng mà không restart interval
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const fetchAll = async (signal?: AbortSignal) => {
    const list = symbolsRef.current;
    const all  = list.length ? [...list, 'VNINDEX'] : ['VNINDEX'];
    // prices-cache: có cache 2 lớp (memory 60s + Supabase L2) — trước đây trang
    // chủ dùng /api/prices (no cache) nên mỗi lần load đều fetch realtime từ đầu.
    const res  = await fetch(
      `/api/prices-cache?symbols=${encodeURIComponent(all.join(','))}`,
      { cache: 'no-store', signal },
    );
    const data: PricesResponse = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Không thể tải giá thị trường');
    return data.debug ?? [];
  };

  // Fetch ban đầu + khi danh sách đổi
  useEffect(() => {
    if (!ready) return;
    if (!symbols.length) { setQuotes([]); setLoading(false); }

    const controller = new AbortController();
    if (symbols.length) setLoading(true);
    setMarketError('');

    (async () => {
      try {
        const all = await fetchAll(controller.signal);
        setQuotes(all.filter(i => i.symbol !== 'VNINDEX' && Number(i.price) > 0)
          .sort((a, b) => a.symbol.localeCompare(b.symbol)));
        const idx = all.find(i => i.symbol === 'VNINDEX');
        setVnIndex(idx && Number(idx.price) > 0 ? idx : null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setMarketError((e as Error).message || 'Không thể kết nối với server');
        }
      } finally {
        if (symbols.length) setLoading(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, ready]);

  // Auto-refresh 60s — chỉ khi tab visible (tiết kiệm request trên free tier)
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      (async () => {
        try {
          const all = await fetchAll();
          setQuotes(all.filter(i => i.symbol !== 'VNINDEX' && Number(i.price) > 0)
            .sort((a, b) => a.symbol.localeCompare(b.symbol)));
          const idx = all.find(i => i.symbol === 'VNINDEX');
          setVnIndex(idx && Number(idx.price) > 0 ? idx : null);
          setUpdatedAt(Date.now());
        } catch { /* refresh âm thầm — giữ giá cũ, đừng làm user mất trạng thái */ }
      })();
    }, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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

  return { quotes, vnIndex, loading, marketError, breadth, topPositive, updatedAt };
}
