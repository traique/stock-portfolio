'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_WATCHLIST = ['BID', 'FPT', 'HPG', 'VCB'];

export const normalizeSymbol = (s: string) =>
  s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

export const sortSymbols = (s: string[]) =>
  [...s].sort((a, b) => a.localeCompare(b));

const getWatchlistKey = (userId?: string) =>
  `lcta_watchlist_${userId ?? 'guest'}`;

// ── Types ────────────────────────────────────────────────────────────────────

export type UseWatchlistOptions = {
  sessionChecked: boolean;
  isLoggedIn:     boolean;
  userId:         string;
};

export type UseWatchlistReturn = {
  watchlist:      string[];
  watchlistReady: boolean;
  watchInput:     string;
  watchError:     string;
  setWatchInput:  (v: string) => void;
  addSymbol:      () => void;
  removeSymbol:   (symbol: string) => void;
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useWatchlist({
  sessionChecked,
  isLoggedIn,
  userId,
}: UseWatchlistOptions): UseWatchlistReturn {
  const [watchlist,      setWatchlist]      = useState<string[]>(DEFAULT_WATCHLIST);
  const [watchlistReady, setWatchlistReady] = useState(false);
  const [watchInput,     setWatchInput]     = useState('');
  const [watchError,     setWatchError]     = useState('');
  const lastSavedRef = useRef('');

  // Load — Supabase (logged in) → localStorage → default
  useEffect(() => {
    if (!sessionChecked) return;

    (async () => {
      setWatchlistReady(false);

      if (isLoggedIn && userId) {
        try {
          const { data, error } = await supabase
            .from('watchlists')
            .select('symbol')
            .order('symbol', { ascending: true });

          if (!error && Array.isArray(data) && data.length) {
            const symbols = sortSymbols(
              data.map(r => normalizeSymbol(String(r.symbol))).filter(Boolean),
            );
            setWatchlist(symbols);
            lastSavedRef.current = JSON.stringify(symbols);
            setWatchlistReady(true);
            return;
          }
        } catch {}
      }

      const saved = localStorage.getItem(getWatchlistKey(userId || undefined));
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length) {
            const symbols = sortSymbols(
              parsed.map((i: unknown) => normalizeSymbol(String(i))).filter(Boolean),
            );
            setWatchlist(symbols);
            lastSavedRef.current = JSON.stringify(symbols);
            setWatchlistReady(true);
            return;
          }
        } catch {}
      }

      const fallback = sortSymbols(DEFAULT_WATCHLIST);
      setWatchlist(fallback);
      lastSavedRef.current = JSON.stringify(fallback);
      setWatchlistReady(true);
    })();
  }, [sessionChecked, isLoggedIn, userId]);

  // Persist — localStorage + Supabase on change
  useEffect(() => {
    if (!sessionChecked || !watchlistReady) return;

    const sorted  = sortSymbols(watchlist);
    const payload = JSON.stringify(sorted);
    localStorage.setItem(getWatchlistKey(userId || undefined), payload);
    if (payload === lastSavedRef.current) return;

    (async () => {
      if (isLoggedIn && userId) {
        try {
          await supabase.from('watchlists').delete().eq('user_id', userId);
          if (sorted.length) {
            await supabase.from('watchlists').insert(
              sorted.map(symbol => ({ user_id: userId, symbol })),
            );
          }
        } catch {}
      }
      lastSavedRef.current = payload;
    })();
  }, [watchlist, userId, isLoggedIn, sessionChecked, watchlistReady]);

  const addSymbol = useCallback(() => {
    const symbol = normalizeSymbol(watchInput);
    if (!symbol) { setWatchError('Vui lòng nhập mã hợp lệ.'); return; }
    if (watchlist.includes(symbol)) {
      setWatchInput('');
      setWatchError(`Mã ${symbol} đã có trong danh sách.`);
      return;
    }
    setWatchlist(prev => sortSymbols([...prev, symbol]));
    setWatchInput('');
    setWatchError('');
  }, [watchInput, watchlist]);

  const removeSymbol = useCallback((symbol: string) => {
    setWatchlist(prev => prev.filter(s => s !== symbol));
  }, []);

  return {
    watchlist,
    watchlistReady,
    watchInput,
    watchError,
    setWatchInput,
    addSymbol,
    removeSymbol,
  };
}
