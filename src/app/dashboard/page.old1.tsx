'use client';

import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  PieChart,
  Send,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShellHeader from '@/components/app-shell-header';
import {
  CollapsibleSectionV2,
  PositionCardV2,
  premiumButtonStyleV2,
  premiumCardStyleV2,
  premiumInputStyleV2,
  SummarySkeletonV2,
  SummaryStatCardV2,
} from '@/components/dashboard/premium-dashboard-ui-v2';
import {
  calcCashSummary,
  calcPosition,
  calcRealizedSummary,
  calcSummary,
  CashTransaction,
  deriveOpenHoldings,
  enrichTransactions,
  formatCurrency,
  groupHoldingsBySymbol,
  PortfolioSettings,
  PriceMap,
  Transaction,
} from '@/lib/calculations';
import { supabase } from '@/lib/supabase';

type QuoteDebugItem = { symbol: string; price: number; change: number; pct: number };
type PricesResponse = { prices?: PriceMap; debug?: QuoteDebugItem[]; error?: string; cached?: boolean };
type TelegramSettings = { chat_id: string; is_enabled: boolean; notify_daily: boolean; daily_hour_vn: number };
type TxTypeFilter = 'ALL' | 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
type CashMode = 'CASH' | 'ADJUSTMENT';
type TradeMode = 'BUY' | 'SELL';
type HistoryRow = { kind: 'trade'; item: Transaction; sortDate: string } | { kind: 'cash'; item: CashTransaction; sortDate: string };

const DEFAULT_TELEGRAM: TelegramSettings = { chat_id: '', is_enabled: false, notify_daily: true, daily_hour_vn: 15 };
const DEFAULT_TRADE_FORM = { symbol: '', price: '', quantity: '', trade_date: '', note: '' };
const DEFAULT_CASH_FORM = { transaction_type: 'DEPOSIT' as 'DEPOSIT' | 'WITHDRAW', amount: '', transaction_date: '', note: '' };

function formatCompactPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}
function formatChange(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return sign + new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}
function formatPct(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return sign + value.toFixed(2) + '%';
}
function getChangeColor(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'var(--muted)';
  if (value > 0) return '#16a34a';
  if (value < 0) return '#dc2626';
  return 'var(--muted)';
}
function getQuoteMap(items: QuoteDebugItem[]) {
  const map = new Map<string, QuoteDebugItem>();
  items.forEach((item) => map.set(item.symbol.toUpperCase(), item));
  return map;
}
function statTone(value: number) { return value >= 0 ? 'up' : 'down'; }
async function getAccessToken() { const { data } = await supabase.auth.getSession(); return data.session?.access_token || ''; }
function clampHour(value: number) { if (!Number.isFinite(value)) return 15; return Math.min(23, Math.max(0, Math.floor(value))); }
function vnHourToUtc(vnHour: number) { return (clampHour(vnHour) - 7 + 24) % 24; }
function utcHourToVn(utcHour: number) { return (clampHour(utcHour) + 7) % 24; }
function formatTradeDate(value?: string | null) { if (!value) return 'Không ngày'; return new Intl.DateTimeFormat('vi-VN').format(new Date(value)); }
function getTransactionLabel(type: TxTypeFilter | Transaction['transaction_type'] | CashTransaction['transaction_type']) {
  switch (type) {
    case 'BUY': return 'Mua';
    case 'SELL': return 'Bán';
    case 'DEPOSIT': return 'Nạp tiền';
    case 'WITHDRAW': return 'Rút tiền';
    default: return 'Tất cả';
  }
}

export default function DashboardPage() {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [portfolioSettings, setPortfolioSettings] = useState<PortfolioSettings | null>(null);
  const [prices, setPrices] = useState<PriceMap>({});
  const [quotes, setQuotes] = useState<QuoteDebugItem[]>([]);
  const [vnIndex, setVnIndex] = useState<QuoteDebugItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeMode, setTradeMode] = useState<TradeMode>('BUY');
  const [cashOpen, setCashOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [editingCashId, setEditingCashId] = useState<string | null>(null);

  const [tradeForm, setTradeForm] = useState(DEFAULT_TRADE_FORM);
  const [cashForm, setCashForm] = useState(DEFAULT_CASH_FORM);
  const [cashMode, setCashMode] = useState<CashMode>('CASH');
  const [adjustmentSign, setAdjustmentSign] = useState<1 | -1>(1);
  const [adjustmentAmountInput, setAdjustmentAmountInput] = useState('0');
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const [telegram, setTelegram] = useState<TelegramSettings>(DEFAULT_TELEGRAM);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState('');
  const [historyFilter, setHistoryFilter] = useState<TxTypeFilter>('ALL');
  const [historySymbol, setHistorySymbol] = useState('');

  const bootstrapSession = useCallback(async () => {
    const [{ data: userData }, token] = await Promise.all([supabase.auth.getUser(), getAccessToken()]);
    if (!userData.user) { window.location.href = '/'; return null; }
    setUserId(userData.user.id);
    setEmail(userData.user.email || '');
    setAccessToken(token);
    return { userId: userData.user.id, email: userData.user.email || '', accessToken: token };
  }, []);

  const loadTelegramSettings = useCallback(async (token?: string) => {
    setTelegramLoading(true); setTelegramMessage('');
    try {
      const resolvedToken = token || accessToken || (await getAccessToken());
      if (!resolvedToken) return;
      const response = await fetch('/api/telegram/settings', { headers: { Authorization: `Bearer ${resolvedToken}` } });
      const payload = await response.json();
      if (response.ok && payload?.settings) {
        setTelegram({ chat_id: payload.settings.chat_id || '', is_enabled: Boolean(payload.settings.is_enabled), notify_daily: payload.settings.notify_daily !== false, daily_hour_vn: utcHourToVn(Number(payload.settings.daily_hour_utc ?? 8)) });
      } else setTelegram(DEFAULT_TELEGRAM);
    } catch { setTelegramMessage('Không tải được cấu hình Telegram'); }
    finally { setTelegramLoading(false); }
  }, [accessToken]);

  const loadPortfolio = useCallback(async (resolvedUserId?: string, resolvedEmail?: string) => {
    setLoading(true); setMessage('');
    let currentUserId = resolvedUserId || userId; let currentEmail = resolvedEmail || email;
    if (!currentUserId) {
      const session = await bootstrapSession();
      if (!session) return;
      currentUserId = session.userId; currentEmail = session.email;
    }
    setEmail(currentEmail);
    const [transactionsRes, cashRes, settingsRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', currentUserId).order('trade_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
      supabase.from('cash_transactions').select('*').eq('user_id', currentUserId).order('transaction_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
      supabase.from('portfolio_settings').select('*').eq('user_id', currentUserId).maybeSingle(),
    ]);
    if (transactionsRes.error) { setTransactions([]); setMessage(transactionsRes.error.message); } else setTransactions((transactionsRes.data || []) as Transaction[]);
    if (cashRes.error) { setCashTransactions([]); if (!transactionsRes.error) setMessage(cashRes.error.message); } else setCashTransactions((cashRes.data || []) as CashTransaction[]);
    if (settingsRes.error) { setPortfolioSettings(null); if (!transactionsRes.error && !cashRes.error) setMessage(settingsRes.error.message); }
    else {
      const settings = (settingsRes.data || null) as PortfolioSettings | null;
      const adjustment = Number(settings?.cash_adjustment || 0);
      setPortfolioSettings(settings); setAdjustmentSign(adjustment >= 0 ? 1 : -1); setAdjustmentAmountInput(String(Math.abs(adjustment)));
    }
    setLoading(false);
  }, [bootstrapSession, email, userId]);

  const openHoldings = useMemo(() => deriveOpenHoldings(transactions), [transactions]);
  const enrichedTransactions = useMemo(() => enrichTransactions(transactions), [transactions]);

  const loadPrices = useCallback(async (items: typeof openHoldings) => {
    const symbols = [...new Set(items.map((item) => item.symbol.toUpperCase()))];
    if (!symbols.length) { setPrices({}); setQuotes([]); return; }
    setRefreshing(true); setMessage('');
    try {
      const response = await fetch('/api/prices-cache?symbols=' + encodeURIComponent(symbols.join(',')), { cache: 'no-store' });
      const data: PricesResponse = await response.json();
      if (!response.ok) { setPrices({}); setQuotes([]); setMessage(data?.error || 'Không lấy được giá'); }
      else { setPrices(data.prices || {}); setQuotes((data.debug || []).sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true }))); }
    } catch { setPrices({}); setQuotes([]); setMessage('Lỗi kết nối'); }
    finally { setRefreshing(false); }
  }, []);

  const loadVnIndex = useCallback(async () => {
    try {
      const response = await fetch('/api/prices-cache?symbols=VNINDEX', { cache: 'no-store' });
      const data: PricesResponse = await response.json();
      const item = data?.debug?.[0];
      setVnIndex(item && Number(item.price) > 0 ? item : null);
    } catch { setVnIndex(null); }
  }, []);

  useEffect(() => { (async () => { const session = await bootstrapSession(); if (!session) return; await Promise.all([loadPortfolio(session.userId, session.email), loadTelegramSettings(session.accessToken), loadVnIndex()]); })(); }, [bootstrapSession, loadPortfolio, loadTelegramSettings, loadVnIndex]);
  useEffect(() => { if (openHoldings.length > 0) loadPrices(openHoldings); else { setPrices({}); setQuotes([]); } }, [openHoldings, loadPrices]);

  const positions = useMemo(() => groupHoldingsBySymbol(openHoldings), [openHoldings]);
  const summary = useMemo(() => calcSummary(openHoldings, prices), [openHoldings, prices]);
  const realizedSummary = useMemo(() => calcRealizedSummary(enrichedTransactions), [enrichedTransactions]);
  const cashSummary = useMemo(() => calcCashSummary(cashTransactions, enrichedTransactions, portfolioSettings), [cashTransactions, enrichedTransactions, portfolioSettings]);
  const quoteMap = useMemo(() => getQuoteMap(quotes), [quotes]);

  const totalCapital = cashSummary.netCapital;
  const actualNav = cashSummary.actualCash;
  const marketValue = summary.totalNow;
  const totalAssets = actualNav + marketValue;
  const totalPnl = totalAssets - totalCapital;
  const unrealizedPnl = summary.totalPnl;
  const totalPnlPct = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;
  const dayPnl = useMemo(() => positions.reduce((sum, position) => { const quote = quoteMap.get(position.symbol.toUpperCase()); return sum + Number(quote?.change || 0) * Number(position.quantity || 0); }, 0), [positions, quoteMap]);

  const allocations = useMemo(() => {
    const totalNow = marketValue || 0;
    return positions.map((position) => { const row = calcPosition(position, prices); const percent = totalNow > 0 ? (row.totalNow / totalNow) * 100 : 0; return { symbol: position.symbol, totalNow: row.totalNow, percent }; }).sort((a, b) => b.totalNow - a.totalNow);
  }, [positions, prices, marketValue]);

  const historyRows = useMemo(() => {
    const tradeRows: HistoryRow[] = enrichedTransactions.map((item) => ({ kind: 'trade', item, sortDate: item.trade_date || item.created_at }));
    const cashRows: HistoryRow[] = cashTransactions.map((item) => ({ kind: 'cash', item, sortDate: item.transaction_date || item.created_at }));
    return [...tradeRows, ...cashRows]
      .filter((row) => historyFilter === 'ALL' ? true : row.kind === 'trade' ? row.item.transaction_type === historyFilter : row.item.transaction_type === historyFilter)
      .filter((row) => !historySymbol.trim() ? true : row.kind === 'cash' ? true : row.item.symbol.toUpperCase().includes(historySymbol.trim().toUpperCase()))
      .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  }, [cashTransactions, enrichedTransactions, historyFilter, historySymbol]);

  async function handleTradeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!userId) { setMessage('Phiên đăng nhập không hợp lệ'); return; }
    const symbol = tradeForm.symbol.trim().toUpperCase();
    const price = Number(tradeForm.price);
    const quantity = Number(tradeForm.quantity);
    if (!symbol || !price || !quantity) { setMessage(`Nhập đủ mã, giá ${tradeMode === 'BUY' ? 'mua' : 'bán'}, số lượng`); return; }
    if (editingTradeId) {
      const { error } = await supabase.from('transactions').update({ symbol, transaction_type: tradeMode, price, quantity, trade_date: tradeForm.trade_date || null, note: tradeForm.note.trim() || null, avg_cost: null, realized_pnl: null }).eq('id', editingTradeId).eq('user_id', userId);
      if (error) { setMessage(error.message); return; }
    } else {
      const { error } = await supabase.from('transactions').insert({ user_id: userId, symbol, transaction_type: tradeMode, price, quantity, trade_date: tradeForm.trade_date || null, note: tradeForm.note.trim() || null, avg_cost: null, realized_pnl: null });
      if (error) { setMessage(error.message); return; }
    }
    setTradeForm(DEFAULT_TRADE_FORM); setEditingTradeId(null); setTradeOpen(false); await loadPortfolio(userId, email);
  }

  async function handleCashSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!userId) { setMessage('Phiên đăng nhập không hợp lệ'); return; }
    const amount = Number(cashForm.amount);
    if (!amount) { setMessage('Nhập số tiền hợp lệ'); return; }
    if (editingCashId) {
      const { error } = await supabase.from('cash_transactions').update({ transaction_type: cashForm.transaction_type, amount, transaction_date: cashForm.transaction_date || null, note: cashForm.note.trim() || null }).eq('id', editingCashId).eq('user_id', userId);
      if (error) { setMessage(error.message); return; }
    } else {
      const { error } = await supabase.from('cash_transactions').insert({ user_id: userId, transaction_type: cashForm.transaction_type, amount, transaction_date: cashForm.transaction_date || null, note: cashForm.note.trim() || null });
      if (error) { setMessage(error.message); return; }
    }
    setCashForm(DEFAULT_CASH_FORM); setEditingCashId(null); await loadPortfolio(userId, email);
  }

  async function handleSaveCashAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setSavingAdjustment(true);
    if (!userId) { setSavingAdjustment(false); setMessage('Phiên đăng nhập không hợp lệ'); return; }
    const normalized = adjustmentAmountInput.replace(/\s/g, '').replace(/,/g, '');
    const baseAmount = Number(normalized || 0);
    if (!Number.isFinite(baseAmount)) { setSavingAdjustment(false); setMessage('Điều chỉnh tiền mặt không hợp lệ'); return; }
    const cashAdjustment = adjustmentSign * Math.abs(baseAmount);
    const { error } = await supabase.from('portfolio_settings').upsert({ user_id: userId, cash_adjustment: cashAdjustment }, { onConflict: 'user_id' });
    setSavingAdjustment(false);
    if (error) { setMessage(error.message); return; }
    await loadPortfolio(userId, email);
  }

  function editTrade(item: Transaction) {
    setTradeMode(item.transaction_type === 'SELL' ? 'SELL' : 'BUY');
    setTradeForm({ symbol: item.symbol, price: String(item.price), quantity: String(item.quantity), trade_date: item.trade_date || '', note: item.note || '' });
    setEditingTradeId(item.id); setTradeOpen(true); setCashOpen(false);
  }
  function editCash(item: CashTransaction) {
    setCashMode('CASH');
    setCashForm({ transaction_type: item.transaction_type, amount: String(item.amount), transaction_date: item.transaction_date || '', note: item.note || '' });
    setEditingCashId(item.id); setCashOpen(true); setTradeOpen(false);
  }
  async function deleteTrade(item: Transaction) { if (!window.confirm(`Xóa giao dịch ${getTransactionLabel(item.transaction_type)} ${item.symbol}?`)) return; const { error } = await supabase.from('transactions').delete().eq('id', item.id).eq('user_id', userId); if (error) { setMessage(error.message); return; } await loadPortfolio(userId, email); }
  async function deleteCash(item: CashTransaction) { if (!window.confirm(`Xóa giao dịch ${getTransactionLabel(item.transaction_type)}?`)) return; const { error } = await supabase.from('cash_transactions').delete().eq('id', item.id).eq('user_id', userId); if (error) { setMessage(error.message); return; } await loadPortfolio(userId, email); }

  async function handleSaveTelegram(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTelegramSaving(true); setTelegramMessage('');
    try {
      const token = accessToken || (await getAccessToken());
      const response = await fetch('/api/telegram/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ chat_id: telegram.chat_id.trim(), is_enabled: telegram.is_enabled, notify_daily: telegram.notify_daily, daily_hour_utc: vnHourToUtc(telegram.daily_hour_vn) }) });
      const payload = await response.json();
      if (!response.ok) setTelegramMessage(payload?.error || 'Không lưu được cấu hình'); else { setTelegramMessage('Đã lưu cấu hình Telegram'); setTelegramOpen(false); }
    } catch { setTelegramMessage('Không lưu được cấu hình'); }
    finally { setTelegramSaving(false); }
  }
  async function handleTelegramTest() {
    setTelegramTesting(true); setTelegramMessage('');
    try {
      const token = accessToken || (await getAccessToken());
      const response = await fetch('/api/telegram/test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) setTelegramMessage(payload?.error || 'Không gửi được báo cáo'); else setTelegramMessage('Đã gửi báo cáo tới Telegram');
    } catch { setTelegramMessage('Không gửi được báo cáo'); }
    finally { setTelegramTesting(false); }
  }
  async function handleLogout() { await supabase.auth.signOut(); window.location.href = '/'; }

  const positionViews = useMemo(() => positions.map((position) => {
    const row = calcPosition(position, prices); const quote = quoteMap.get(position.symbol.toUpperCase()); const positive = row.pnl >= 0; const isExpanded = !!expandedSymbols[position.symbol];
    return { symbol: position.symbol, lotsText: `${position.holdings.length} lệnh mua mở · SL ${position.quantity}`, priceText: formatCompactPrice(quote?.price ?? row.currentPrice), changeText: `${formatChange(quote?.change)} · ${formatPct(quote?.pct)}`, changeColor: getChangeColor(quote?.change), quantityText: String(position.quantity), avgPriceText: formatCurrency(position.avgBuyPrice), totalBuyText: formatCurrency(row.totalBuy), totalNowText: formatCurrency(row.totalNow), pnlText: formatCurrency(row.pnl), pnlPctText: `${row.pnlPct >= 0 ? '+' : ''}${row.pnlPct.toFixed(2)}%`, positive, isExpanded, onToggle: () => setExpandedSymbols((prev) => ({ ...prev, [position.symbol]: !prev[position.symbol] })), lots: position.holdings.map((holding) => <div key={holding.id} className="ab-mini-row"><div><div className="ab-mini-symbol">{formatTradeDate(holding.buy_date)} · SL {holding.quantity}</div><div className="ab-mini-price">Giá mua {formatCurrency(Number(holding.buy_price))}</div></div></div>) };
  }), [positions, prices, quoteMap, expandedSymbols]);

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap">
        <AppShellHeader title="Danh mục cá nhân" isLoggedIn={true} email={email} currentTab="dashboard" onLogout={handleLogout} />

        <section className="ab-summary-grid premium-summary-grid compact-top-grid">
          {loading ? <><SummarySkeletonV2 /><SummarySkeletonV2 /><SummarySkeletonV2 /><SummarySkeletonV2 /></> : <>
            <SummaryStatCardV2 label="Tổng vốn" value={formatCurrency(totalCapital)} icon={<Landmark size={16} />} />
            <SummaryStatCardV2 label="NAV thực tế" value={formatCurrency(actualNav)} icon={<Wallet size={16} />} />
            <SummaryStatCardV2 label="Giá trị thị trường" value={formatCurrency(marketValue)} icon={<PieChart size={16} />} />
            <SummaryStatCardV2 label="Tổng tài sản" value={formatCurrency(totalAssets)} icon={<TrendingUp size={16} />} />
          </>}
        </section>

        {!loading ? <section className="ab-summary-grid premium-summary-grid compact-top-grid">
          <SummaryStatCardV2 label="Tổng lãi/lỗ" value={formatCurrency(totalPnl)} icon={<TrendingUp size={16} />} tone={statTone(totalPnl)} subValue={`${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`} />
          <SummaryStatCardV2 label="Lãi/lỗ trong ngày" value={formatCurrency(dayPnl)} icon={dayPnl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} tone={statTone(dayPnl)} subValue={refreshing ? 'Đang cập nhật giá...' : 'Theo biến động phiên hiện tại'} />
          <SummaryStatCardV2 label="Lãi/lỗ cổ phiếu đang giữ" value={formatCurrency(unrealizedPnl)} icon={<TrendingUp size={16} />} tone={statTone(unrealizedPnl)} subValue="Hiệu suất vị thế mở" />
          <SummaryStatCardV2 label="Lãi/lỗ đã chốt" value={formatCurrency(realizedSummary.totalRealizedPnl)} icon={<TrendingDown size={16} />} tone={statTone(realizedSummary.totalRealizedPnl)} subValue={`${realizedSummary.totalSellOrders} lệnh bán`} />
        </section> : null}

        {vnIndex ? <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyleV2}><div className="ab-row-between align-center"><div><div className="ab-card-kicker">VN-Index</div><div className="ab-card-headline small">{formatCompactPrice(vnIndex.price)}</div></div><div className="ab-soft-change under-price" style={{ color: getChangeColor(vnIndex.change), padding: '10px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.72)' }}>{formatChange(vnIndex.change)} · {formatPct(vnIndex.pct)}</div></div></section> : null}

        {!!allocations.length ? <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyleV2}><div className="ab-card-kicker">Cơ cấu danh mục</div><div className="ab-mini-list" style={{ marginTop: 12 }}>{allocations.map((item) => <div key={item.symbol} style={{ display: 'grid', gap: 8 }}><div className="ab-row-between align-center"><div className="ab-mini-symbol">{item.symbol}</div><div className="ab-mini-price">{formatCurrency(item.totalNow)} · {item.percent.toFixed(1)}%</div></div><div style={{ width: '100%', height: 10, borderRadius: 999, background: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}><div style={{ width: `${Math.max(item.percent, 2)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(15,23,42,0.92), rgba(59,130,246,0.72))' }} /></div></div>)}</div></section> : null}

        {message ? <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyleV2}><div className="ab-error">{message}</div></section> : null}

        {loading ? <section className="ab-position-grid"><SummarySkeletonV2 /><SummarySkeletonV2 /></section> : !positions.length ? <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyleV2}><div className="ab-note">Chưa có vị thế mở nào trong danh mục</div></section> : <section className="ab-position-grid">{positionViews.map((position) => <PositionCardV2 key={position.symbol} {...position} />)}</section>}

        <CollapsibleSectionV2 kicker="Giao dịch" title={editingTradeId ? `Sửa lệnh ${tradeMode === 'BUY' ? 'mua' : 'bán'}` : 'Thêm giao dịch'} isOpen={tradeOpen} onToggle={() => setTradeOpen((v) => !v)}>
          <div className="ab-row-gap mt-16">
            <button type="button" className={`ab-btn ${tradeMode === 'BUY' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setTradeMode('BUY')} style={premiumButtonStyleV2}>Lệnh mua</button>
            <button type="button" className={`ab-btn ${tradeMode === 'SELL' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setTradeMode('SELL')} style={premiumButtonStyleV2}>Lệnh bán</button>
          </div>
          <form onSubmit={handleTradeSubmit} className="ab-form-grid compact-form-grid mt-16">
            <input value={tradeForm.symbol} onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value })} placeholder="Mã" required className="ab-input" style={premiumInputStyleV2} />
            <input value={tradeForm.price} onChange={(e) => setTradeForm({ ...tradeForm, price: e.target.value })} type="number" placeholder={tradeMode === 'BUY' ? 'Giá mua' : 'Giá bán'} required className="ab-input" style={premiumInputStyleV2} />
            <input value={tradeForm.quantity} onChange={(e) => setTradeForm({ ...tradeForm, quantity: e.target.value })} type="number" placeholder="Số lượng" required className="ab-input" style={premiumInputStyleV2} />
            <input value={tradeForm.trade_date} onChange={(e) => setTradeForm({ ...tradeForm, trade_date: e.target.value })} type="date" className="ab-input" style={premiumInputStyleV2} />
            <input value={tradeForm.note} onChange={(e) => setTradeForm({ ...tradeForm, note: e.target.value })} placeholder="Ghi chú" className="ab-input ab-full" style={premiumInputStyleV2} />
            <div className="ab-row-gap">
              <button type="submit" className="ab-btn ab-btn-primary" style={premiumButtonStyleV2}>{editingTradeId ? `Lưu lệnh ${tradeMode === 'BUY' ? 'mua' : 'bán'}` : `Thêm lệnh ${tradeMode === 'BUY' ? 'mua' : 'bán'}`}</button>
              {editingTradeId ? <button type="button" className="ab-btn ab-btn-subtle" onClick={() => { setEditingTradeId(null); setTradeForm(DEFAULT_TRADE_FORM); setTradeOpen(false); }} style={premiumButtonStyleV2}>Hủy</button> : null}
            </div>
          </form>
        </CollapsibleSectionV2>

        <CollapsibleSectionV2 kicker="Giao dịch" title="Nhật ký giao dịch" isOpen={historyOpen} onToggle={() => setHistoryOpen((v) => !v)}>
          <div className="ab-row-gap mt-16">
            <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as TxTypeFilter)} className="ab-input" style={premiumInputStyleV2}><option value="ALL">Tất cả</option><option value="BUY">Mua</option><option value="SELL">Bán</option><option value="DEPOSIT">Nạp tiền</option><option value="WITHDRAW">Rút tiền</option></select>
            <input value={historySymbol} onChange={(e) => setHistorySymbol(e.target.value)} placeholder="Lọc theo mã" className="ab-input" style={premiumInputStyleV2} />
          </div>
          <div className="ab-mini-list mt-16">{historyRows.length ? historyRows.map((row) => row.kind === 'trade' ? <div key={row.item.id} className="ab-mini-row"><div><div className="ab-mini-symbol">{getTransactionLabel(row.item.transaction_type)} · {row.item.symbol} · SL {row.item.quantity}</div><div className="ab-mini-price">{formatTradeDate(row.item.trade_date)} · Giá {formatCurrency(Number(row.item.price))}{row.item.transaction_type === 'SELL' ? ` · Đã chốt ${formatCurrency(Number(row.item.realized_pnl || 0))}` : ''}</div></div><div className="ab-row-gap"><button type="button" className="ab-btn ab-btn-subtle" onClick={() => editTrade(row.item)} style={premiumButtonStyleV2}>Sửa</button><button type="button" className="ab-delete ghost" onClick={() => deleteTrade(row.item)}>Xóa</button></div></div> : <div key={row.item.id} className="ab-mini-row"><div><div className="ab-mini-symbol">{getTransactionLabel(row.item.transaction_type)}</div><div className="ab-mini-price">{formatTradeDate(row.item.transaction_date)} · {formatCurrency(Number(row.item.amount))}</div></div><div className="ab-row-gap"><button type="button" className="ab-btn ab-btn-subtle" onClick={() => editCash(row.item)} style={premiumButtonStyleV2}>Sửa</button><button type="button" className="ab-delete ghost" onClick={() => deleteCash(row.item)}>Xóa</button></div></div>) : <div className="ab-note">Chưa có lịch sử giao dịch</div>}</div>
        </CollapsibleSectionV2>

        <CollapsibleSectionV2 kicker="Tiền mặt" title="Nạp / Rút / Điều chỉnh tiền mặt" isOpen={cashOpen} onToggle={() => setCashOpen((v) => !v)}>
          <div className="ab-row-gap mt-16"><button type="button" className={`ab-btn ${cashMode === 'CASH' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setCashMode('CASH')} style={premiumButtonStyleV2}>Nạp / Rút tiền</button><button type="button" className={`ab-btn ${cashMode === 'ADJUSTMENT' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setCashMode('ADJUSTMENT')} style={premiumButtonStyleV2}>Điều chỉnh tiền mặt</button></div>
          {cashMode === 'CASH' ? <form onSubmit={handleCashSubmit} className="ab-form-grid compact-form-grid mt-16"><select value={cashForm.transaction_type} onChange={(e) => setCashForm({ ...cashForm, transaction_type: e.target.value as 'DEPOSIT' | 'WITHDRAW' })} className="ab-input" style={premiumInputStyleV2}><option value="DEPOSIT">Nạp tiền</option><option value="WITHDRAW">Rút tiền</option></select><input value={cashForm.amount} onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })} type="number" placeholder="Số tiền" required className="ab-input" style={premiumInputStyleV2} /><input value={cashForm.transaction_date} onChange={(e) => setCashForm({ ...cashForm, transaction_date: e.target.value })} type="date" className="ab-input" style={premiumInputStyleV2} /><input value={cashForm.note} onChange={(e) => setCashForm({ ...cashForm, note: e.target.value })} placeholder="Ghi chú" className="ab-input ab-full" style={premiumInputStyleV2} /><div className="ab-row-gap"><button type="submit" className="ab-btn ab-btn-primary" style={premiumButtonStyleV2}>{editingCashId ? 'Lưu giao dịch tiền' : 'Lưu giao dịch tiền'}</button>{editingCashId ? <button type="button" className="ab-btn ab-btn-subtle" onClick={() => { setEditingCashId(null); setCashForm(DEFAULT_CASH_FORM); }} style={premiumButtonStyleV2}>Hủy</button> : null}</div></form> : <form onSubmit={handleSaveCashAdjustment} className="ab-form-grid compact-form-grid mt-16"><div className="ab-row-gap"><button type="button" className={`ab-btn ${adjustmentSign === 1 ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setAdjustmentSign(1)} style={premiumButtonStyleV2}>Dương (+)</button><button type="button" className={`ab-btn ${adjustmentSign === -1 ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setAdjustmentSign(-1)} style={premiumButtonStyleV2}>Âm (-)</button></div><input value={adjustmentAmountInput} onChange={(e) => setAdjustmentAmountInput(e.target.value)} type="number" inputMode="decimal" className="ab-input" placeholder="Nhập số điều chỉnh" style={premiumInputStyleV2} /><div className="ab-note">Tiền mặt tính toán: <strong>{formatCurrency(cashSummary.calculatedCash)}</strong></div><div className="ab-note">Điều chỉnh hiện tại: <strong>{cashSummary.cashAdjustment >= 0 ? '+' : ''}{formatCurrency(cashSummary.cashAdjustment)}</strong></div><div className="ab-note">NAV thực tế = Tiền mặt tính toán + Điều chỉnh tiền mặt</div><button type="submit" className="ab-btn ab-btn-primary" style={premiumButtonStyleV2}>{savingAdjustment ? 'Đang lưu...' : 'Lưu điều chỉnh'}</button></form>}
        </CollapsibleSectionV2>

        <CollapsibleSectionV2 kicker="Telegram" title="Báo cáo cuối ngày" isOpen={telegramOpen} onToggle={() => setTelegramOpen((v) => !v)}>
          <form onSubmit={handleSaveTelegram} className="ab-form-grid compact-form-grid mt-16"><input value={telegram.chat_id} onChange={(e) => setTelegram({ ...telegram, chat_id: e.target.value })} placeholder="Nhập chat_id Telegram" className="ab-input ab-full" style={premiumInputStyleV2} /><label className="ab-toggle-row"><input type="checkbox" checked={telegram.is_enabled} onChange={(e) => setTelegram({ ...telegram, is_enabled: e.target.checked })} /><span>Bật báo cáo Telegram</span></label><label className="ab-toggle-row"><input type="checkbox" checked={telegram.notify_daily} onChange={(e) => setTelegram({ ...telegram, notify_daily: e.target.checked })} /><span>Nhận báo cáo cuối ngày</span></label><input value={telegram.daily_hour_vn} onChange={(e) => setTelegram({ ...telegram, daily_hour_vn: clampHour(Number(e.target.value || 15)) })} type="number" min={0} max={23} className="ab-input" placeholder="Giờ Việt Nam" style={premiumInputStyleV2} /><div className="ab-note">Báo cáo sẽ gửi theo tổng vốn, NAV thực tế, giá trị thị trường, tổng tài sản, tổng lãi/lỗ, lãi/lỗ trong ngày và chi tiết vị thế.</div><div className="ab-row-gap"><button type="submit" className="ab-btn ab-btn-primary" style={premiumButtonStyleV2}>{telegramSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</button><button type="button" className="ab-btn ab-btn-subtle" onClick={handleTelegramTest} disabled={telegramTesting || telegramLoading} style={premiumButtonStyleV2}><Send size={14} />{telegramTesting ? 'Đang gửi...' : 'Gửi báo cáo'}</button></div></form>
          {telegramMessage ? <div className="ab-error mt-12">{telegramMessage}</div> : null}
        </CollapsibleSectionV2>
      </div>
    </main>
  );
}
