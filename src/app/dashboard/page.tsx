'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShellHeader from '@/components/app-shell-header';
import {
  calcCashSummary, calcPosition, calcRealizedSummary, calcSummary,
  CashTransaction, deriveOpenHoldings, enrichTransactions, formatCurrency,
  groupHoldingsBySymbol, PortfolioSettings, PriceMap, Transaction,
} from '@/lib/calculations';
import { supabase } from '@/lib/supabase';
import {
  AI_CACHE_KEY, AllocationItem, AiPortfolioResponse, CashSummaryShape,
  getAccessToken, PricesResponse, QuoteItem,
} from '@/lib/dashboard-types';
import { PortfolioView }    from '@/components/dashboard/portfolio-view';
import { DashboardActions } from '@/components/dashboard/dashboard-actions';

export default function DashboardPage() {

  // --- auth ---
  const [userId,      setUserId]      = useState('');
  const [email,       setEmail]       = useState('');
  const [accessToken, setAccessToken] = useState('');

  // --- data ---
  const [transactions,      setTransactions]      = useState<Transaction[]>([]);
  const [cashTransactions,  setCashTransactions]  = useState<CashTransaction[]>([]);
  const [portfolioSettings, setPortfolioSettings] = useState<PortfolioSettings | null>(null);
  const [prices,  setPrices]  = useState<PriceMap>({});
  const [quotes,  setQuotes]  = useState<QuoteItem[]>([]);
  const [vnIndex, setVnIndex] = useState<QuoteItem | null>(null);

  // --- status ---
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message,    setMessage]    = useState('');

  // --- AI cache ---
  const [aiResult, setAiResult] = useState<AiPortfolioResponse | null>(null);

  // =========================================================
  // BOOTSTRAP
  // =========================================================

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

  // =========================================================
  // LOAD PORTFOLIO
  // =========================================================

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

  // =========================================================
  // LOAD PRICES
  // =========================================================

  const loadPrices = useCallback(async (holdings: ReturnType<typeof deriveOpenHoldings>) => {
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

  // =========================================================
  // INIT
  // =========================================================

  useEffect(() => {
    (async () => {
      const s = await bootstrapSession();
      if (!s) return;
      await Promise.all([
        loadPortfolio(s.userId, s.email),
        loadVnIndex(),
      ]);
    })();
  }, [bootstrapSession, loadPortfolio, loadVnIndex]);

  const openHoldings = useMemo(() => deriveOpenHoldings(transactions), [transactions]);

  useEffect(() => {
    if (openHoldings.length) loadPrices(openHoldings);
    else { setPrices({}); setQuotes([]); }
  }, [openHoldings, loadPrices]);

  // Persist AI cache
  useEffect(() => {
    const saved = localStorage.getItem(AI_CACHE_KEY);
    if (saved) { try { setAiResult(JSON.parse(saved)); } catch {} }
  }, []);
  useEffect(() => {
    if (aiResult) localStorage.setItem(AI_CACHE_KEY, JSON.stringify(aiResult));
  }, [aiResult]);

  // =========================================================
  // DERIVED
  // =========================================================

  const enrichedTxs     = useMemo(() => enrichTransactions(transactions),        [transactions]);
  const positions       = useMemo(() => groupHoldingsBySymbol(openHoldings),      [openHoldings]);
  const summary         = useMemo(() => calcSummary(openHoldings, prices),        [openHoldings, prices]);
  const realizedSummary = useMemo(() => calcRealizedSummary(enrichedTxs),         [enrichedTxs]);
  const cashSummary     = useMemo(
    () => calcCashSummary(cashTransactions, enrichedTxs, portfolioSettings),
    [cashTransactions, enrichedTxs, portfolioSettings],
  );

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
    const total = marketValue || 0;
    return positions
      .map(pos => {
        const row = calcPosition(pos, prices);
        return {
          symbol:   pos.symbol,
          totalNow: row.totalNow,
          percent:  total > 0 ? (row.totalNow / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalNow - a.totalNow);
  }, [positions, prices, marketValue]);

  // =========================================================
  // HANDLERS
  // =========================================================

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  }, []);

  const handleReload = useCallback(
    () => loadPortfolio(userId, email),
    [loadPortfolio, userId, email],
  );

  const handleRefreshPrices = useCallback(
    () => loadPrices(openHoldings),
    [loadPrices, openHoldings],
  );

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <main className="ab-page">
      <div className="ab-shell" style={{ gap: 12 }}>

        <AppShellHeader
          isLoggedIn={true}
          email={email}
          currentTab="dashboard"
          onLogout={handleLogout}
        />

        {message && (
          <div className="ab-error" style={{ borderRadius: 16, padding: '12px 16px' }}>
            {message}
          </div>
        )}

        <PortfolioView
          loading={loading}
          refreshing={refreshing}
          positions={positions}
          prices={prices}
          quoteMap={quoteMap}
          vnIndex={vnIndex}
          allocations={allocations}
          totalAssets={totalAssets}
          totalPnl={totalPnl}
          totalPnlPct={totalPnlPct}
          actualNav={actualNav}
          marketValue={marketValue}
          unrealizedPnl={unrealizedPnl}
          realizedPnl={realizedSummary.totalRealizedPnl}
          totalSellOrders={realizedSummary.totalSellOrders}
          dayPnl={dayPnl}
          cashSummary={cashSummary as CashSummaryShape}
          aiNewsContext={aiResult?.newsContext}
          onRefreshPrices={handleRefreshPrices}
        />

        <DashboardActions
          userId={userId}
          email={email}
          accessToken={accessToken}
          transactions={transactions}
          cashTransactions={cashTransactions}
          enrichedTxs={enrichedTxs}
          portfolioSettings={portfolioSettings}
          positions={positions}
          cashSummary={cashSummary as CashSummaryShape}
          aiResult={aiResult}
          onAiResult={setAiResult}
          onReload={handleReload}
          onMessage={setMessage}
        />

      </div>
    </main>
  );
}
