'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShellHeader from '@/components/app-shell-header';
import { PortfolioView } from '@/components/dashboard/portfolio-view';
import { DashboardActions } from '@/components/dashboard/dashboard-actions';
import { supabase } from '@/lib/supabase';
import {
  calcCashSummary,
  calcPosition,
  calcRealizedSummary,
  calcSummary,
  CashTransaction,
  deriveOpenHoldings,
  enrichTransactions,
  groupHoldingsBySymbol,
  PortfolioSettings,
  PriceMap,
  Transaction,
} from '@/lib/calculations';
import { 
  AiPortfolioResponse, AI_CACHE_KEY, getAccessToken, QuoteItem, PricesResponse 
} from '@/lib/dashboard-types';

export default function DashboardPage() {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [accessToken, setAccessToken] = useState('');
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [portfolioSettings, setPortfolioSettings] = useState<PortfolioSettings | null>(null);
  
  const [prices, setPrices] = useState<PriceMap>({});
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [vnIndex, setVnIndex] = useState<QuoteItem | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [aiResult, setAiResult] = useState<AiPortfolioResponse | null>(null);

  const loadVnIndex = useCallback(async () => {
    try {
      const response = await fetch('/api/prices-cache?symbols=VNINDEX', { cache: 'no-store' });
      const data: PricesResponse = await response.json();
      const item = data?.debug?.[0];
      setVnIndex(item && Number(item.price) > 0 ? item : null);
    } catch { setVnIndex(null); }
  }, []);

  const loadPortfolio = useCallback(async (resUserId?: string) => {
    setLoading(true);
    const currId = resUserId || userId;
    const [txRes, cashRes, setRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', currId).order('trade_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
      supabase.from('cash_transactions').select('*').eq('user_id', currId).order('transaction_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
      supabase.from('portfolio_settings').select('*').eq('user_id', currId).maybeSingle(),
    ]);
    
    if (txRes.error) setMessage(txRes.error.message);
    setTransactions((txRes.data || []) as Transaction[]);
    setCashTransactions((cashRes.data || []) as CashTransaction[]);
    setPortfolioSettings((setRes.data || null) as PortfolioSettings | null);
    setLoading(false);
  }, [userId]);

  const loadPrices = useCallback(async (symbols: string[]) => {
    if (!symbols.length) { setPrices({}); setQuotes([]); return; }
    setRefreshing(true);
    try {
      const res = await fetch('/api/prices-cache?symbols=' + encodeURIComponent(symbols.join(',')), { cache: 'no-store' });
      const data: PricesResponse = await res.json();
      if (res.ok) {
        setPrices(data.prices || {});
        setQuotes((data.debug || []).sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true })));
      } else {
        setMessage(data?.error || 'Không lấy được giá');
      }
    } catch { 
      setMessage('Lỗi kết nối'); 
    } finally { 
      setRefreshing(false); 
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        setEmail(data.user.email || '');
        getAccessToken().then(setAccessToken);
        loadPortfolio(data.user.id);
        loadVnIndex();
      } else {
        window.location.href = '/';
      }
    });

    const saved = localStorage.getItem(AI_CACHE_KEY);
    if (saved) try { setAiResult(JSON.parse(saved)); } catch {}
  }, [loadPortfolio, loadVnIndex]);

  const openHoldings = useMemo(() => deriveOpenHoldings(transactions), [transactions]);
  
  useEffect(() => {
    const syms = [...new Set(openHoldings.map(h => h.symbol.toUpperCase()))];
    if (syms.length > 0) loadPrices(syms);
    else { setPrices({}); setQuotes([]); }
  }, [openHoldings, loadPrices]);

  // DERIVED DATA
  const enrichedTxs = useMemo(() => enrichTransactions(transactions), [transactions]);
  const positions = useMemo(() => groupHoldingsBySymbol(openHoldings), [openHoldings]);
  const summary = useMemo(() => calcSummary(openHoldings, prices), [openHoldings, prices]);
  const realizedSummary = useMemo(() => calcRealizedSummary(enrichedTxs), [enrichedTxs]);
  const cashSummary = useMemo(() => calcCashSummary(cashTransactions, enrichedTxs, portfolioSettings), [cashTransactions, enrichedTxs, portfolioSettings]);
  const quoteMap = useMemo(() => new Map(quotes.map(q => [q.symbol.toUpperCase(), q])), [quotes]);

  const totalAssets = (cashSummary.actualCash || 0) + (summary.totalNow || 0);
  const totalPnl = totalAssets - cashSummary.netCapital;
  const totalPnlPct = cashSummary.netCapital > 0 ? (totalPnl / cashSummary.netCapital) * 100 : 0;
  
  const dayPnl = useMemo(() => positions.reduce((sum, position) => {
    const quote = quoteMap.get(position.symbol.toUpperCase());
    return sum + Number(quote?.change || 0) * Number(position.quantity || 0);
  }, 0), [positions, quoteMap]);

  const allocations = useMemo(() => {
    const totalNow = summary.totalNow || 0;
    return positions.map((position) => {
      const row = calcPosition(position, prices);
      const percent = totalNow > 0 ? (row.totalNow / totalNow) * 100 : 0;
      return { symbol: position.symbol, totalNow: row.totalNow, percent };
    }).sort((a, b) => b.totalNow - a.totalNow);
  }, [positions, prices, summary.totalNow]);

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap" style={{ gap: 12 }}>
        <AppShellHeader isLoggedIn={true} email={email} currentTab="dashboard" onLogout={() => supabase.auth.signOut().then(() => window.location.href = '/')} />
        
        {message && <div className="ab-error" style={{ padding: 12, background: 'var(--card)', borderRadius: 12, border: '1px solid var(--red)' }}>{message}</div>}

        <PortfolioView 
          loading={loading} 
          refreshing={refreshing} 
          positions={positions} 
          prices={prices}
          quoteMap={quoteMap} 
          vnIndex={vnIndex} 
          totalAssets={totalAssets}
          totalPnl={totalPnl}
          totalPnlPct={totalPnlPct}
          actualNav={cashSummary.actualCash} 
          marketValue={summary.totalNow}
          unrealizedPnl={summary.totalPnl} 
          realizedPnl={realizedSummary.totalRealizedPnl}
          totalSellOrders={realizedSummary.totalSellOrders}
          dayPnl={dayPnl}
          cashSummary={cashSummary} 
          allocations={allocations}
          onRefreshPrices={() => loadPrices([...new Set(openHoldings.map(h => h.symbol.toUpperCase()))])}
          aiNewsContext={aiResult?.newsContext}
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
          cashSummary={cashSummary}
          aiResult={aiResult} 
          onAiResult={(r) => { setAiResult(r); localStorage.setItem(AI_CACHE_KEY, JSON.stringify(r)); }}
          onReload={() => loadPortfolio()} 
          onMessage={setMessage}
        />
      </div>
    </main>
  );
}
