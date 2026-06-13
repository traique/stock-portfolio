'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  calcCashSummary, calcPosition, derivePortfolio,
  CashTransaction, PortfolioSettings, PriceMap, Transaction,
} from '@/lib/calculations';
import {
  getAiPortfolioKey, getAccessToken,
  AllocationItem, AiPortfolioResponse,
  CashSummaryShape, PricesResponse, QuoteItem,
} from '@/lib/dashboard-types';

// ── Types ────────────────────────────────────────────────────────────────────

export type UsePortfolioReturn = {
  // auth
  userId:       string;
  email:        string;
  accessToken:  string;
  // data
  transactions:      Transaction[];
  cashTransactions:  CashTransaction[];
  portfolioSettings: PortfolioSettings | null;
  prices:            PriceMap;
  quotes:            QuoteItem[];
  vnIndex:           QuoteItem | null;
  // derived
  positions:         ReturnType<typeof derivePortfolio>['positions'];
  enrichedTxs:       ReturnType<typeof derivePortfolio>['enrichedTransactions'];
  realizedSummary:   ReturnType<typeof derivePortfolio>['realizedSummary'];
  openHoldings:      ReturnType<typeof derivePortfolio>['openLots'];
  cashSummary:       CashSummaryShape;
  allocations:       AllocationItem[];
  totalAssets:       number;
  totalPnl:          number;
  totalPnlPct:       number;
  actualNav:         number;
  marketValue:       number;
  unrealizedPnl:     number;
  dayPnl:            number;
  quoteMap:          Map<string, QuoteItem>;
  // AI
  aiResult:          AiPortfolioResponse | null;
  setAiResult:       (r: AiPortfolioResponse | null) => void;
  // status
  loading:           boolean;
  refreshing:        boolean;
  message:           string;
  setMessage:        (m: string) => void;
  // actions
  handleReload:        () => Promise<void>;
  handleRefreshPrices: () => Promise<void>;
  handleLogout:        () => Promise<void>;
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePortfolio(): UsePortfolioReturn {
  // Auth
  const [userId,      setUserId]      = useState('');
  const [email,       setEmail]       = useState('');
  const [accessToken, setAccessToken] = useState('');

  // Data
  const [transactions,      setTransactions]      = useState<Transaction[]>([]);
  const [cashTransactions,  setCashTransactions]  = useState<CashTransaction[]>([]);
  const [portfolioSettings, setPortfolioSettings] = useState<PortfolioSettings | null>(null);
  const [prices,            setPrices]            = useState<PriceMap>({});
  const [quotes,            setQuotes]            = useState<QuoteItem[]>([]);
  const [vnIndex,           setVnIndex]           = useState<QuoteItem | null>(null);

  // Status
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message,    setMessage]    = useState('');

  // AI cache
  const [aiResult, setAiResult] = useState<AiPortfolioResponse | null>(null);

  // ── Session ──────────────────────────────────────────────────────────────

  const bootstrapSession = useCallback(async () => {
    const [{ data: ud }, token] = await Promise.all([
      supabase.auth.getUser(),
      getAccessToken(),
    ]);
    if (!ud.user) { window.location.href = '/'; return null; }
    setUserId(ud.user.id);
    setEmail(ud.user.email ?? '');
    setAccessToken(token);
    return { userId: ud.user.id, email: ud.user.email ?? '', accessToken: token };
  }, []);

  // ── Load portfolio ────────────────────────────────────────────────────────

  const loadPortfolio = useCallback(async (uid?: string, em?: string) => {
    setLoading(true);
    setMessage('');
    let uid2 = uid ?? userId;
    let em2  = em  ?? email;

    if (!uid2) {
      const s = await bootstrapSession();
      if (!s) return;
      uid2 = s.userId; em2 = s.email;
    }
    setEmail(em2);

    const [txRes, cashRes, settingsRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', uid2)
        .order('trade_date',  { ascending: true, nullsFirst: false })
        .order('created_at',  { ascending: true }),
      supabase.from('cash_transactions').select('*').eq('user_id', uid2)
        .order('transaction_date', { ascending: true, nullsFirst: false })
        .order('created_at',       { ascending: true }),
      supabase.from('portfolio_settings').select('*')
        .eq('user_id', uid2).maybeSingle(),
    ]);

    if (txRes.error)
      { setTransactions([]);    setMessage(txRes.error.message); }
    else
      setTransactions((txRes.data ?? []) as Transaction[]);

    if (cashRes.error)
      { setCashTransactions([]); if (!txRes.error) setMessage(cashRes.error.message); }
    else
      setCashTransactions((cashRes.data ?? []) as CashTransaction[]);

    if (settingsRes.error) {
      setPortfolioSettings(null);
      if (!txRes.error && !cashRes.error) setMessage(settingsRes.error.message);
    } else {
      setPortfolioSettings((settingsRes.data ?? null) as PortfolioSettings | null);
    }

    setLoading(false);
  }, [bootstrapSession, email, userId]);

  // ── Load prices ───────────────────────────────────────────────────────────

  const loadPrices = useCallback(async (holdings: { symbol: string }[]) => {
    const symbols = [...new Set(holdings.map(h => h.symbol.toUpperCase()))];
    if (!symbols.length) { setPrices({}); setQuotes([]); return; }
    setRefreshing(true);
    try {
      const res  = await fetch(
        `/api/prices-cache?symbols=${encodeURIComponent(symbols.join(','))}`,
        { cache: 'no-store' },
      );
      const data: PricesResponse = await res.json();
      if (!res.ok) {
        setPrices({}); setQuotes([]);
        setMessage(data?.error ?? 'Không lấy được giá');
      } else {
        setPrices(data.prices ?? {});
        setQuotes([...(data.debug ?? [])].sort((a, b) => a.symbol.localeCompare(b.symbol)));
      }
    } catch { setPrices({}); setQuotes([]); setMessage('Lỗi kết nối'); }
    finally   { setRefreshing(false); }
  }, []);

  const loadVnIndex = useCallback(async () => {
    try {
      const res  = await fetch('/api/prices-cache?symbols=VNINDEX', { cache: 'no-store' });
      const data: PricesResponse = await res.json();
      const item = data?.debug?.[0];
      setVnIndex(item && Number(item.price) > 0 ? item : null);
    } catch { setVnIndex(null); }
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const s = await bootstrapSession();
      if (!s) return;
      await Promise.all([loadPortfolio(s.userId, s.email), loadVnIndex()]);
    })();
  }, [bootstrapSession, loadPortfolio, loadVnIndex]);

  // ── AI cache — persist/restore ────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return;
    const saved = localStorage.getItem(getAiPortfolioKey(userId));
    if (saved) { try { setAiResult(JSON.parse(saved)); } catch {} }
  }, [userId]);

  useEffect(() => {
    if (!userId || !aiResult) return;
    localStorage.setItem(getAiPortfolioKey(userId), JSON.stringify(aiResult));
  }, [aiResult, userId]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const portfolio       = useMemo(() => derivePortfolio(transactions), [transactions]);
  const openHoldings    = portfolio.openLots;
  const enrichedTxs     = portfolio.enrichedTransactions;
  const positions       = portfolio.positions;
  const realizedSummary = portfolio.realizedSummary;

  const summary = useMemo(() => ({
    totalBuy: positions.reduce((s, p) => s + p.totalBuy, 0),
    totalNow: openHoldings.reduce((s, h) => s + (prices[h.symbol] ?? 0) * h.quantity, 0),
    get totalPnl() { return this.totalNow - this.totalBuy; },
  }), [positions, openHoldings, prices]);

  useEffect(() => {
    if (openHoldings.length) loadPrices(openHoldings);
    else { setPrices({}); setQuotes([]); }
  }, [openHoldings, loadPrices]);

  const cashSummary = useMemo(
    () => calcCashSummary(cashTransactions, enrichedTxs, portfolioSettings),
    [cashTransactions, enrichedTxs, portfolioSettings],
  ) as CashSummaryShape;

  const quoteMap = useMemo(() => {
    const m = new Map<string, QuoteItem>();
    quotes.forEach(q => m.set(q.symbol.toUpperCase(), q));
    return m;
  }, [quotes]);

  const totalCapital  = cashSummary.netCapital;
  const actualNav     = cashSummary.actualCash;
  const marketValue   = summary.totalNow;
  const totalAssets   = actualNav + marketValue;
  const totalPnl      = totalAssets - totalCapital;
  const unrealizedPnl = summary.totalPnl;
  const totalPnlPct   = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;

  const dayPnl = useMemo(
    () => positions.reduce((sum, pos) => {
      const q = quoteMap.get(pos.symbol.toUpperCase());
      return sum + Number(q?.change ?? 0) * Number(pos.quantity ?? 0);
    }, 0),
    [positions, quoteMap],
  );

  const allocations = useMemo<AllocationItem[]>(() => {
  const allocations = useMemo<AllocationItem[]>(() => {
  const total = marketValue || 0;
  return positions
    .map(pos => {
      const row = calcPosition(pos, prices);
      return {
        symbol:   pos.symbol,
        totalNow: row.value,
        percent:  total > 0 ? (row.value / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.totalNow - a.totalNow);
}, [positions, prices, marketValue]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleReload = useCallback(
    () => loadPortfolio(userId, email),
    [loadPortfolio, userId, email],
  );

  const handleRefreshPrices = useCallback(
    () => loadPrices(openHoldings),
    [loadPrices, openHoldings],
  );

  const handleLogout = useCallback(async () => {
    localStorage.removeItem(getAiPortfolioKey(userId));
    await supabase.auth.signOut();
    window.location.href = '/';
  }, [userId]);

  return {
    userId, email, accessToken,
    transactions, cashTransactions, portfolioSettings,
    prices, quotes, vnIndex,
    positions, enrichedTxs, realizedSummary, openHoldings,
    cashSummary, allocations,
    totalAssets, totalPnl, totalPnlPct,
    actualNav, marketValue, unrealizedPnl, dayPnl,
    quoteMap,
    aiResult, setAiResult,
    loading, refreshing, message, setMessage,
    handleReload, handleRefreshPrices, handleLogout,
  };
    }
