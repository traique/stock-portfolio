'use client';

import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  PieChart,
  Send,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  RefreshCw,
  Newspaper,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShellHeader from '@/components/app-shell-header';
import { DashboardSection as Section, DashboardStatCard as StatCard } from '@/components/dashboard/dashboard-primitives';
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

// --- TYPES ---
type QuoteDebugItem = { symbol: string; price: number; change: number; pct: number };
type PricesResponse = { prices?: PriceMap; debug?: QuoteDebugItem[]; error?: string; cached?: boolean };
type TelegramSettings = { chat_id: string; is_enabled: boolean; notify_daily: boolean; daily_hour_vn: number };

type NewsItem = { title: string; source: string; pubDate: string };

type AiPortfolioResponse = {
  summary: string;
  actions: Array<{
    symbol: string;
    action: 'BUY' | 'HOLD' | 'REDUCE' | 'SELL' | 'WATCH';
    reason: string;
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    tp?: number;
    sl?: number;
  }>;
  risks: string[];
  newsContext?: Record<string, NewsItem[]>;
  cached?: boolean;
  cache_ttl_seconds?: number;
  cached_at?: string;
  error?: string;
};
type TxTypeFilter = 'ALL' | 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
type CashMode = 'CASH' | 'ADJUSTMENT';
type TradeMode = 'BUY' | 'SELL';
type HistoryRow =
  | { kind: 'trade'; item: Transaction; sortDate: string }
  | { kind: 'cash'; item: CashTransaction; sortDate: string };

// --- CONSTANTS ---
const DEFAULT_TELEGRAM: TelegramSettings = { chat_id: '', is_enabled: false, notify_daily: true, daily_hour_vn: 15 };
const DEFAULT_TRADE_FORM = { symbol: '', price: '', quantity: '', trade_date: '', note: '' };
const DEFAULT_CASH_FORM = { transaction_type: 'DEPOSIT' as 'DEPOSIT' | 'WITHDRAW', amount: '', transaction_date: '', note: '' };

// --- STYLES ---
const cardStyle = { borderRadius: 24, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-soft)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' } as const;
const strongCardStyle = { ...cardStyle, border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow)' } as const;
const inputStyle = { borderRadius: 999, background: 'var(--soft)', color: 'var(--text)', border: '1px solid var(--border-strong)' } as const;
const btnStyle = { borderRadius: 999, boxShadow: '0 8px 16px rgba(0,0,0,0.06)' } as const;
const pillStyle = { borderRadius: 999, padding: '6px 12px', background: 'var(--soft)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' } as const;
const muted = () => 'var(--muted)';
const fg = () => 'var(--text)';
const up = () => 'var(--green)';
const down = () => 'var(--red)';

// --- FORMATTERS ---
function formatCompactPrice(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatChange(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return sign + new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatPct(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
}

function getChangeColor(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return muted();
  return value > 0 ? up() : value < 0 ? down() : muted();
}

function getQuoteMap(items: QuoteDebugItem[]) {
  const map = new Map<string, QuoteDebugItem>();
  items.forEach((item) => map.set(item.symbol.toUpperCase(), item));
  return map;
}

function statTone(value: number) {
  return value >= 0 ? 'up' : 'down';
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

function clampHour(value: number) { return Math.min(23, Math.max(0, Math.floor(Number.isFinite(value) ? value : 15))); }
function vnHourToUtc(vnHour: number) { return (clampHour(vnHour) - 7 + 24) % 24; }
function utcHourToVn(utcHour: number) { return (clampHour(utcHour) + 7) % 24; }

function formatTradeDate(value?: string | null) {
  if (!value) return 'Không ngày';
  return new Intl.DateTimeFormat('vi-VN').format(new Date(value));
}

function getTransactionLabel(type: TxTypeFilter | Transaction['transaction_type'] | CashTransaction['transaction_type']) {
  switch (type) {
    case 'BUY': return 'Mua';
    case 'SELL': return 'Bán';
    case 'DEPOSIT': return 'Nạp tiền';
    case 'WITHDRAW': return 'Rút tiền';
    default: return 'Tất cả';
  }
}

function formatIntegerInput(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}

function parseIntegerInput(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

// --- SUB-COMPONENTS CHO LUXURY UI ---
function HeroMetric({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean | null }) {
  const toneColor = positive == null ? fg() : positive ? up() : down();
  return (
    <div style={{ ...strongCardStyle, padding: 16, borderRadius: 20, boxShadow: 'none', background: 'var(--soft)' }}>
      <div style={{ fontSize: 11, color: muted(), fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div className="num-premium" style={{ marginTop: 6, fontSize: 24, lineHeight: 1.15, fontWeight: 800, color: toneColor, wordBreak: 'break-word' }}>{value}</div>
      {sub && <div style={{ marginTop: 6, fontSize: 12, color: muted(), fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

function MiniInfoCard({ label, value, subValue, icon }: { label: string; value: string; subValue?: string; icon?: React.ReactNode }) {
  return (
    <div style={{ ...cardStyle, padding: 16, borderRadius: 20, boxShadow: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 11, color: muted(), fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        {icon && <div style={{ color: muted() }}>{icon}</div>}
      </div>
      <div className="num-premium" style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: fg(), lineHeight: 1.2, wordBreak: 'break-word' }}>{value}</div>
      {subValue && <div style={{ marginTop: 6, fontSize: 12, color: muted(), fontWeight: 600 }}>{subValue}</div>}
    </div>
  );
}

// --- MAIN COMPONENT ---
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
  
  // UI States
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeMode, setTradeMode] = useState<TradeMode>('BUY');
  const [cashOpen, setCashOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});
  
  const [newsModal, setNewsModal] = useState<{ isOpen: boolean; symbol: string; news: NewsItem[] }>({ isOpen: false, symbol: '', news: [] });

  // Form States
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
  const [resettingPortfolio, setResettingPortfolio] = useState(false);
  
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState<AiPortfolioResponse | null>(null);

  const bootstrapSession = useCallback(async () => {
    const [{ data: userData }, token] = await Promise.all([supabase.auth.getUser(), getAccessToken()]);
    if (!userData.user) {
      window.location.href = '/';
      return null;
    }
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
    } catch { setTelegramMessage('Không tải được cấu hình Telegram'); } finally { setTelegramLoading(false); }
  }, [accessToken]);

  const loadPortfolio = useCallback(async (resolvedUserId?: string, resolvedEmail?: string) => {
    setLoading(true); setMessage('');
    let currentUserId = resolvedUserId || userId;
    let currentEmail = resolvedEmail || email;

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

    if (transactionsRes.error) { setTransactions([]); setMessage(transactionsRes.error.message); } 
    else setTransactions((transactionsRes.data || []) as Transaction[]);

    if (cashRes.error) { setCashTransactions([]); if (!transactionsRes.error) setMessage(cashRes.error.message); } 
    else setCashTransactions((cashRes.data || []) as CashTransaction[]);

    if (settingsRes.error) { setPortfolioSettings(null); if (!transactionsRes.error && !cashRes.error) setMessage(settingsRes.error.message); } 
    else {
      const settings = (settingsRes.data || null) as PortfolioSettings | null;
      const adjustment = Number(settings?.cash_adjustment || 0);
      setPortfolioSettings(settings); setAdjustmentSign(adjustment >= 0 ? 1 : -1);
      setAdjustmentAmountInput(formatIntegerInput(String(Math.abs(adjustment)))); 
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
    } catch { setPrices({}); setQuotes([]); setMessage('Lỗi kết nối'); } finally { setRefreshing(false); }
  }, []);

  const loadVnIndex = useCallback(async () => {
    try {
      const response = await fetch('/api/prices-cache?symbols=VNINDEX', { cache: 'no-store' });
      const data: PricesResponse = await response.json();
      const item = data?.debug?.[0];
      setVnIndex(item && Number(item.price) > 0 ? item : null);
    } catch { setVnIndex(null); }
  }, []);

  useEffect(() => {
    void (async () => {
      const session = await bootstrapSession();
      if (!session) return;
      await Promise.all([loadPortfolio(session.userId, session.email), loadTelegramSettings(session.accessToken), loadVnIndex()]);
    })();
  }, [bootstrapSession, loadPortfolio, loadTelegramSettings, loadVnIndex]);

  useEffect(() => {
    if (openHoldings.length > 0) loadPrices(openHoldings);
    else { setPrices({}); setQuotes([]); }
  }, [openHoldings, loadPrices]);

  useEffect(() => {
    const savedAi = localStorage.getItem('lcta_ai_portfolio_result');
    if (savedAi) { try { setAiResult(JSON.parse(savedAi)); } catch {} }
  }, []);

  useEffect(() => {
    if (aiResult) localStorage.setItem('lcta_ai_portfolio_result', JSON.stringify(aiResult));
  }, [aiResult]);

  // Derived Data
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
  
  const dayPnl = useMemo(() => positions.reduce((sum, position) => {
    const quote = quoteMap.get(position.symbol.toUpperCase());
    return sum + Number(quote?.change || 0) * Number(position.quantity || 0);
  }, 0), [positions, quoteMap]);

  const allocations = useMemo(() => {
    const totalNow = marketValue || 0;
    return positions.map((position) => {
      const row = calcPosition(position, prices);
      const percent = totalNow > 0 ? (row.totalNow / totalNow) * 100 : 0;
      return { symbol: position.symbol, totalNow: row.totalNow, percent };
    }).sort((a, b) => b.totalNow - a.totalNow);
  }, [positions, prices, marketValue]);

  const historyRows = useMemo(() => {
    const tradeRows: HistoryRow[] = enrichedTransactions.map((item) => ({ kind: 'trade', item, sortDate: item.trade_date || item.created_at }));
    const cashRows: HistoryRow[] = cashTransactions.map((item) => ({ kind: 'cash', item, sortDate: item.transaction_date || item.created_at }));
    return [...tradeRows, ...cashRows]
      .filter((row) => historyFilter === 'ALL' ? true : row.kind === 'trade' ? row.item.transaction_type === historyFilter : row.item.transaction_type === historyFilter)
      .filter((row) => !historySymbol.trim() ? true : row.kind === 'cash' ? true : row.item.symbol.toUpperCase().includes(historySymbol.trim().toUpperCase()))
      .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  }, [cashTransactions, enrichedTransactions, historyFilter, historySymbol]);

  // Event Handlers
  async function handleTradeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('');
    if (!userId) return setMessage('Phiên đăng nhập không hợp lệ');
    const symbol = tradeForm.symbol.trim().toUpperCase();
    const price = parseIntegerInput(tradeForm.price);
    const quantity = parseIntegerInput(tradeForm.quantity);
    if (!symbol || !price || !quantity) return setMessage(`Nhập đủ mã, giá ${tradeMode === 'BUY' ? 'mua' : 'bán'}, số lượng`);

    const payload = { symbol, transaction_type: tradeMode, price, quantity, trade_date: tradeForm.trade_date || null, note: tradeForm.note.trim() || null, avg_cost: null, realized_pnl: null };
    if (editingTradeId) { const { error } = await supabase.from('transactions').update(payload).eq('id', editingTradeId).eq('user_id', userId); if (error) return setMessage(error.message); } 
    else { const { error } = await supabase.from('transactions').insert({ user_id: userId, ...payload }); if (error) return setMessage(error.message); }

    setTradeForm(DEFAULT_TRADE_FORM); setEditingTradeId(null); setTradeOpen(false); await loadPortfolio(userId, email);
  }

  async function handleCashSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('');
    if (!userId) return setMessage('Phiên đăng nhập không hợp lệ');
    const amount = parseIntegerInput(cashForm.amount);
    if (!amount) return setMessage('Nhập số tiền hợp lệ');

    const payload = { transaction_type: cashForm.transaction_type, amount, transaction_date: cashForm.transaction_date || null, note: cashForm.note.trim() || null };
    if (editingCashId) { const { error } = await supabase.from('cash_transactions').update(payload).eq('id', editingCashId).eq('user_id', userId); if (error) return setMessage(error.message); } 
    else { const { error } = await supabase.from('cash_transactions').insert({ user_id: userId, ...payload }); if (error) return setMessage(error.message); }

    setCashForm(DEFAULT_CASH_FORM); setEditingCashId(null); await loadPortfolio(userId, email);
  }

  async function handleSaveCashAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setSavingAdjustment(true);
    if (!userId) { setSavingAdjustment(false); return setMessage('Phiên đăng nhập không hợp lệ'); }
    const baseAmount = parseIntegerInput(adjustmentAmountInput);
    if (!Number.isFinite(baseAmount)) { setSavingAdjustment(false); return setMessage('Điều chỉnh tiền mặt không hợp lệ'); }

    const cashAdjustment = adjustmentSign * Math.abs(baseAmount);
    const { error } = await supabase.from('portfolio_settings').upsert({ user_id: userId, cash_adjustment: cashAdjustment }, { onConflict: 'user_id' });
    setSavingAdjustment(false); if (error) return setMessage(error.message); await loadPortfolio(userId, email);
  }

  function editTrade(item: Transaction) {
    setTradeMode(item.transaction_type === 'SELL' ? 'SELL' : 'BUY');
    setTradeForm({ symbol: item.symbol, price: formatIntegerInput(String(item.price)), quantity: formatIntegerInput(String(item.quantity)), trade_date: item.trade_date || '', note: item.note || '' });
    setEditingTradeId(item.id); setTradeOpen(true); setCashOpen(false);
  }

  function editCash(item: CashTransaction) {
    setCashMode('CASH');
    setCashForm({ transaction_type: item.transaction_type, amount: formatIntegerInput(String(item.amount)), transaction_date: item.transaction_date || '', note: item.note || '' });
    setEditingCashId(item.id); setCashOpen(true); setTradeOpen(false);
  }

  async function deleteTrade(item: Transaction) {
    if (!window.confirm(`Xóa giao dịch ${getTransactionLabel(item.transaction_type)} ${item.symbol}?`)) return;
    const { error } = await supabase.from('transactions').delete().eq('id', item.id).eq('user_id', userId);
    if (error) return setMessage(error.message); await loadPortfolio(userId, email);
  }

  async function deleteCash(item: CashTransaction) {
    if (!window.confirm(`Xóa giao dịch ${getTransactionLabel(item.transaction_type)}?`)) return;
    const { error } = await supabase.from('cash_transactions').delete().eq('id', item.id).eq('user_id', userId);
    if (error) return setMessage(error.message); await loadPortfolio(userId, email);
  }

  async function deleteSymbol(symbol: string) {
    if (!userId) return setMessage('Phiên đăng nhập không hợp lệ');
    const symbolUpper = symbol.toUpperCase();
    const count = transactions.filter((item) => item.symbol.toUpperCase() === symbolUpper).length;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa toàn bộ ${count} giao dịch của mã ${symbolUpper}?`)) return;
    
    setMessage('');
    const { error } = await supabase.from('transactions').delete().eq('user_id', userId).eq('symbol', symbolUpper);
    if (error) return setMessage(error.message);

    setExpandedSymbols((prev) => { const next = { ...prev }; delete next[symbolUpper]; return next; });
    if (editingTradeId && tradeForm.symbol.trim().toUpperCase() === symbolUpper) { setEditingTradeId(null); setTradeForm(DEFAULT_TRADE_FORM); setTradeOpen(false); }
    if (historySymbol.trim().toUpperCase() === symbolUpper) setHistorySymbol('');
    await loadPortfolio(userId, email);
  }

  async function resetPortfolio() {
    if (!userId) return;
    if (!window.confirm('Xóa toàn bộ danh mục hiện tại để tạo danh mục mới?')) return;

    setResettingPortfolio(true); setMessage('');
    try {
      const [tradeRes, cashRes, settingsRes] = await Promise.all([ supabase.from('transactions').delete().eq('user_id', userId), supabase.from('cash_transactions').delete().eq('user_id', userId), supabase.from('portfolio_settings').delete().eq('user_id', userId) ]);
      const firstError = tradeRes.error || cashRes.error || settingsRes.error;
      if (firstError) return setMessage(firstError.message || 'Không thể xóa danh mục');

      setExpandedSymbols({}); setEditingTradeId(null); setEditingCashId(null);
      setTradeForm(DEFAULT_TRADE_FORM); setCashForm(DEFAULT_CASH_FORM);
      setTradeOpen(false); setCashOpen(false); setHistoryOpen(false);
      setMessage('Đã xóa toàn bộ danh mục. Bạn có thể tạo danh mục mới.');
      await loadPortfolio(userId, email);
    } catch { setMessage('Không thể xóa danh mục'); } finally { setResettingPortfolio(false); }
  }

  async function handleSaveTelegram(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTelegramSaving(true); setTelegramMessage('');
    try {
      const token = accessToken || (await getAccessToken());
      const response = await fetch('/api/telegram/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_id: telegram.chat_id.trim(), is_enabled: telegram.is_enabled, notify_daily: telegram.notify_daily, daily_hour_utc: vnHourToUtc(telegram.daily_hour_vn) }),
      });
      const payload = await response.json();
      if (!response.ok) setTelegramMessage(payload?.error || 'Không lưu được cấu hình');
      else { setTelegramMessage('Đã lưu cấu hình Telegram'); setTelegramOpen(false); }
    } catch { setTelegramMessage('Không lưu được cấu hình'); } finally { setTelegramSaving(false); }
  }

  async function handleTelegramTest() {
    setTelegramTesting(true); setTelegramMessage('');
    try {
      const token = accessToken || (await getAccessToken());
      const response = await fetch('/api/telegram/test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) setTelegramMessage(payload?.error || 'Không gửi được báo cáo');
      else setTelegramMessage('Đã gửi báo cáo tới Telegram');
    } catch { setTelegramMessage('Không gửi được báo cáo'); } finally { setTelegramTesting(false); }
  }

  async function handleAiPortfolioInsights() {
    setAiLoading(true); setAiError('');
    try {
      const token = accessToken || (await getAccessToken());
      const response = await fetch('/api/ai/portfolio-insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ risk_profile: 'balanced', force_refresh: true }), 
      });
      const payload: AiPortfolioResponse = await response.json();
      if (!response.ok) { setAiError(payload?.error || 'Không thể phân tích danh mục'); } 
      else { setAiResult(payload); }
    } catch { setAiError('Không thể kết nối AI'); } finally { setAiLoading(false); }
  }

  function handleOpenNews(symbol: string) {
    const newsData = aiResult?.newsContext?.[symbol] || [];
    setNewsModal({ isOpen: true, symbol, news: newsData });
  }

  async function handleLogout() {
    await supabase.auth.signOut(); window.location.href = '/';
  }

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap" style={{ gap: 12 }}>
        <AppShellHeader title="Danh mục" isLoggedIn={true} email={email} currentTab="dashboard" onLogout={handleLogout} />

        {message && <section style={{ ...cardStyle, padding: 12 }}><div className="ab-error">{message}</div></section>}

        {/* --- OVERVIEW HERO --- */}
        <section style={{ ...strongCardStyle, padding: 16, overflow: 'hidden', background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(59,130,246,0.04) 35%, rgba(15,23,42,0.02) 100%), var(--card)' }}>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 11, color: muted(), fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>TỔNG TÀI SẢN</div>
              <div className="num-premium" style={{ fontSize: 'clamp(32px, 6vw, 44px)', lineHeight: 1.05, fontWeight: 800, color: fg(), wordBreak: 'break-word' }}>
                {loading ? '...' : formatCurrency(totalAssets)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span className="num-premium" style={{ ...pillStyle, color: getChangeColor(totalPnl), background: totalPnl >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', borderColor: totalPnl >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)' }}>
                  PnL {loading ? '...' : formatCurrency(totalPnl)}
                </span>
                <span className="num-premium" style={{ ...pillStyle, color: getChangeColor(totalPnlPct) }}>
                  {loading ? '...' : `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`}
                </span>
                <span className="num-premium" style={{ ...pillStyle, color: getChangeColor(dayPnl) }}>
                  Hôm nay {loading ? '...' : formatCurrency(dayPnl)}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', alignSelf: 'stretch' }}>
              <HeroMetric label="NAV THỰC TẾ" value={loading ? '...' : formatCurrency(actualNav)} sub="Tiền mặt hiện có" />
              <HeroMetric label="GIÁ TRỊ THỊ TRƯỜNG" value={loading ? '...' : formatCurrency(marketValue)} sub={`${positions.length} mã đang nắm giữ`} />
              <HeroMetric label="LÃI/LỖ ĐÃ CHỐT" value={loading ? '...' : formatCurrency(realizedSummary.totalRealizedPnl)} sub={`${realizedSummary.totalSellOrders} lệnh bán`} positive={realizedSummary.totalRealizedPnl >= 0} />
              <HeroMetric label="LÃI/LỖ ĐANG MỞ" value={loading ? '...' : formatCurrency(unrealizedPnl)} sub="Vị thế hiện tại" positive={unrealizedPnl >= 0} />
            </div>
          </div>

          {vnIndex && (
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: muted(), textTransform: 'uppercase', letterSpacing: '0.04em' }}>VN-INDEX</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span className="num-premium" style={{ fontSize: 20, fontWeight: 800, color: fg() }}>{formatCompactPrice(vnIndex.price)}</span>
                <span className="num-premium" style={{ ...pillStyle, color: getChangeColor(vnIndex.change) }}>{formatChange(vnIndex.change)} · {formatPct(vnIndex.pct)}</span>
              </div>
            </div>
          )}
        </section>

        {/* --- CHI TIẾT DANH MỤC (STATISTICS) --- */}
        <Section kicker="Thống kê" title="CHI TIẾT DANH MỤC" open={detailsOpen} onToggle={() => setDetailsOpen((v) => !v)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <section style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <MiniInfoCard label="TỔNG VỐN" value={loading ? '...' : formatCurrency(totalCapital)} subValue="Net nạp trừ rút" icon={<Landmark size={16} />} />
              <MiniInfoCard label="TIỀN MẶT HỆ THỐNG" value={loading ? '...' : formatCurrency(cashSummary.calculatedCash)} subValue="Từ dòng tiền và giao dịch" icon={<Wallet size={16} />} />
              <MiniInfoCard label="ĐIỀU CHỈNH THỦ CÔNG" value={loading ? '...' : `${cashSummary.cashAdjustment >= 0 ? '+' : ''}${formatCurrency(cashSummary.cashAdjustment)}`} subValue="Cân bằng sổ sách" icon={<PieChart size={16} />} />
              <MiniInfoCard label="BIẾN ĐỘNG NGÀY" value={loading ? '...' : formatCurrency(dayPnl)} subValue="Theo biến động phiên" icon={dayPnl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} />
            </section>
          </div>
        </Section>

        {/* --- CƠ CẤU TỶ TRỌNG --- */}
        {!!allocations.length && (
          <section style={{ ...cardStyle, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <div><div className="ab-card-kicker" style={{ color: muted() }}>Cơ cấu danh mục</div><div style={{ fontSize: 18, fontWeight: 800, color: fg(), marginTop: 4 }}>TỶ TRỌNG VỊ THẾ</div></div>
              <span className="num-premium" style={pillStyle}>{positions.length} MÃ</span>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {allocations.map((item) => (
                <div key={item.symbol} style={{ display: 'grid', gap: 6 }}>
                  <div className="ab-row-between align-center" style={{ gap: 8 }}>
                    <div style={{ fontWeight: 800, color: fg(), minWidth: 0 }}>{item.symbol}</div>
                    <div className="num-premium" style={{ fontSize: 13, fontWeight: 700, color: muted(), textAlign: 'right' }}>{formatCurrency(item.totalNow)} · {item.percent.toFixed(1)}%</div>
                  </div>
                  <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--soft)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(item.percent, 2)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(37,99,235,0.8), rgba(96,165,250,0.6))' }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* --- HOLDINGS (DANH MỤC HIỆN TẠI) --- */}
        <section style={{ ...cardStyle, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <div><div className="ab-card-kicker" style={{ color: muted() }}>Danh mục hiện tại</div><div style={{ fontSize: 20, fontWeight: 800, color: fg(), marginTop: 4 }}>HOLDINGS</div></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span className="num-premium" style={pillStyle}>{positions.length} MÃ</span>
              <span className="num-premium" style={pillStyle}>{openHoldings.length} LOT MỞ</span>
            </div>
          </div>

          {!loading && positions.length ? (
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {positions.map((position) => {
                const row = calcPosition(position, prices);
                const quote = quoteMap.get(position.symbol.toUpperCase());
                const positive = row.pnl >= 0;
                const isExpanded = !!expandedSymbols[position.symbol];

                return (
                  <article key={position.symbol} style={{ ...strongCardStyle, padding: 16, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: 'none' }}>
                    
                    {/* HÀNG 1: TÊN MÃ & NÚT XÓA (Tách biệt hoàn toàn) */}
                    <div className="ab-row-between align-start" style={{ gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 800, color: fg() }}>{position.symbol}</div>
                        <div className="num-premium" style={{ fontSize: 11, fontWeight: 800, color: muted(), marginTop: 6, letterSpacing: '0.04em' }}>
                          {position.holdings.length} LOT MỞ · SL {position.quantity}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button 
                          type="button" 
                          onClick={() => setExpandedSymbols((prev) => ({ ...prev, [position.symbol]: !prev[position.symbol] }))} 
                          style={{ ...pillStyle, background: 'var(--soft)', cursor: 'pointer' }}
                        >
                          {isExpanded ? 'ẨN LỆNH' : 'XEM LỆNH'}
                        </button>
                        <button 
                          type="button" 
                          onClick={() => deleteSymbol(position.symbol)} 
                          style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '50%', width: 34, height: 34, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--muted)', transition: '0.2s' }}
                          title={`Xóa mã ${position.symbol}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* HÀNG 2: GIÁ & PNL */}
                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: muted(), fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Giá hiện tại</div>
                        <div className="num-premium" style={{ fontSize: 28, fontWeight: 800, color: fg(), marginTop: 4, lineHeight: 1.1, wordBreak: 'break-word' }}>
                          {formatCompactPrice(quote?.price ?? row.currentPrice)}
                        </div>
                        <div className="num-premium" style={{ fontSize: 13, fontWeight: 800, color: getChangeColor(quote?.change), marginTop: 4 }}>
                          {formatChange(quote?.change)} · {formatPct(quote?.pct)}
                        </div>
                      </div>
                      <div style={{ borderRadius: 16, padding: '12px 16px', background: positive ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', border: `1px solid ${positive ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`, color: positive ? up() : down(), textAlign: 'right', minWidth: 120 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>PnL</div>
                        <div className="num-premium" style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{formatCurrency(row.pnl)}</div>
                        <div className="num-premium" style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%</div>
                      </div>
                    </div>

                    {/* HÀNG 3: VỐN & THỐNG KÊ */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <div className="num-premium" style={pillStyle}>SL {position.quantity}</div>
                      <div className="num-premium" style={pillStyle}>VỐN TB {formatCurrency(position.avgBuyPrice)}</div>
                    </div>

                    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                      <div style={{ ...cardStyle, padding: 12, borderRadius: 16, boxShadow: 'none' }}>
                        <div style={{ fontSize: 10, color: muted(), fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tổng mua</div>
                        <div className="num-premium" style={{ fontSize: 16, fontWeight: 800, marginTop: 4, color: fg() }}>{formatCurrency(row.totalBuy)}</div>
                      </div>
                      <div style={{ ...cardStyle, padding: 12, borderRadius: 16, boxShadow: 'none' }}>
                        <div style={{ fontSize: 10, color: muted(), fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hiện tại</div>
                        <div className="num-premium" style={{ fontSize: 16, fontWeight: 800, marginTop: 4, color: fg() }}>{formatCurrency(row.totalNow)}</div>
                      </div>
                    </div>

                    {/* HÀNG 4: NÚT TIN TỨC (Dễ bấm, nằm dưới cùng) */}
                    <button 
                      type="button" 
                      onClick={() => handleOpenNews(position.symbol)} 
                      style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, 
                        background: 'var(--card)', border: '1px solid var(--border)', 
                        borderRadius: 14, padding: '12px', marginTop: 'auto', cursor: 'pointer', 
                        color: 'var(--text)', fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
                        transition: 'background 0.2s', width: '100%' 
                      }}
                    >
                      <Newspaper size={16} color="var(--primary)" /> ĐỌC TIN TỨC
                    </button>

                    {isExpanded && (
                      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                        {position.holdings.map((holding) => (
                          <div key={holding.id} style={{ ...cardStyle, padding: 12, borderRadius: 14, boxShadow: 'none' }}>
                            <div className="num-premium" style={{ fontSize: 13, fontWeight: 800, color: fg() }}>{formatTradeDate(holding.buy_date)} · SL {holding.quantity}</div>
                            <div className="num-premium" style={{ fontSize: 12, color: muted(), marginTop: 4 }}>GIÁ MUA {formatCurrency(Number(holding.buy_price))}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="ab-note" style={{ color: muted() }}>{loading ? 'Đang tải danh mục...' : 'Chưa có vị thế đang nắm giữ'}</div>
          )}
        </section>

        {/* --- CÁC SECTION KHÁC BÊN DƯỚI GIỮ NGUYÊN HOẶC ÉP NUM-PREMIUM --- */}
        <Section kicker="Giao dịch" title={editingTradeId ? `SỬA LỆNH ${tradeMode === 'BUY' ? 'MUA' : 'BÁN'}` : 'THÊM GIAO DỊCH'} open={tradeOpen} onToggle={() => setTradeOpen((v) => !v)}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', marginBottom: 12 }}>
            <button type="button" className={`ab-btn ${tradeMode === 'BUY' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setTradeMode('BUY')} style={btnStyle}>LỆNH MUA</button>
            <button type="button" className={`ab-btn ${tradeMode === 'SELL' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setTradeMode('SELL')} style={btnStyle}>LỆNH BÁN</button>
          </div>
          <form onSubmit={handleTradeSubmit} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <input value={tradeForm.symbol} onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value.toUpperCase() })} placeholder="Mã cổ phiếu" className="ab-input" style={inputStyle} />
            <input value={tradeForm.price} onChange={(e) => setTradeForm({ ...tradeForm, price: formatIntegerInput(e.target.value) })} type="text" inputMode="numeric" placeholder={tradeMode === 'BUY' ? 'Giá mua' : 'Giá bán'} className="ab-input num-premium" style={inputStyle} />
            <input value={tradeForm.quantity} onChange={(e) => setTradeForm({ ...tradeForm, quantity: formatIntegerInput(e.target.value) })} type="text" inputMode="numeric" placeholder="Số lượng" className="ab-input num-premium" style={inputStyle} />
            <input value={tradeForm.trade_date} onChange={(e) => setTradeForm({ ...tradeForm, trade_date: e.target.value })} type="date" className="ab-input num-premium" style={inputStyle} />
            <input value={tradeForm.note} onChange={(e) => setTradeForm({ ...tradeForm, note: e.target.value })} placeholder="Ghi chú (Không bắt buộc)" className="ab-input" style={{ ...inputStyle, gridColumn: '1 / -1' }} />
            <div className="ab-row-gap" style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="ab-btn ab-btn-primary" style={btnStyle}>LƯU GIAO DỊCH</button>
              {editingTradeId && <button type="button" className="ab-btn ab-btn-subtle" onClick={() => { setEditingTradeId(null); setTradeForm(DEFAULT_TRADE_FORM); setTradeOpen(false); }} style={btnStyle}>HỦY</button>}
            </div>
          </form>
        </Section>

        {/* --- NHẬT KÝ GIAO DỊCH --- */}
        <Section kicker="Giao dịch" title="NHẬT KÝ GIAO DỊCH" open={historyOpen} onToggle={() => setHistoryOpen((v) => !v)}>
          <div className="ab-row-gap" style={{ marginBottom: 12, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as TxTypeFilter)} className="ab-input" style={inputStyle}>
              <option value="ALL">Tất cả</option><option value="BUY">Mua</option><option value="SELL">Bán</option><option value="DEPOSIT">Nạp tiền</option><option value="WITHDRAW">Rút tiền</option>
            </select>
            <input value={historySymbol} onChange={(e) => setHistorySymbol(e.target.value)} placeholder="Lọc theo mã" className="ab-input" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {historyRows.length ? historyRows.map((row) =>
              row.kind === 'trade' ? (
                <div key={row.item.id} style={{ ...cardStyle, padding: 14, borderRadius: 18, boxShadow: 'none' }}>
                  <div className="num-premium" style={{ fontSize: 14, fontWeight: 800, color: fg() }}>{getTransactionLabel(row.item.transaction_type)} · {row.item.symbol} · SL {row.item.quantity}</div>
                  <div className="num-premium" style={{ fontSize: 12, color: muted(), marginTop: 6 }}>{formatTradeDate(row.item.trade_date)} · GIÁ {formatCurrency(Number(row.item.price))}{row.item.transaction_type === 'SELL' ? ` · CHỐT ${formatCurrency(Number(row.item.realized_pnl || 0))}` : ''}</div>
                  <div className="ab-row-gap" style={{ marginTop: 10 }}>
                    <button type="button" className="ab-btn ab-btn-subtle" onClick={() => editTrade(row.item)} style={btnStyle}>Sửa</button>
                    <button type="button" className="ab-delete ghost" onClick={() => deleteTrade(row.item)}>Xóa</button>
                  </div>
                </div>
              ) : (
                <div key={row.item.id} style={{ ...cardStyle, padding: 14, borderRadius: 18, boxShadow: 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: fg() }}>{getTransactionLabel(row.item.transaction_type)}</div>
                  <div className="num-premium" style={{ fontSize: 12, color: muted(), marginTop: 6 }}>{formatTradeDate(row.item.transaction_date)} · {formatCurrency(Number(row.item.amount))}</div>
                  <div className="ab-row-gap" style={{ marginTop: 10 }}>
                    <button type="button" className="ab-btn ab-btn-subtle" onClick={() => editCash(row.item)} style={btnStyle}>Sửa</button>
                    <button type="button" className="ab-delete ghost" onClick={() => deleteCash(row.item)}>Xóa</button>
                  </div>
                </div>
              )
            ) : <div className="ab-note" style={{ color: muted() }}>Chưa có lịch sử giao dịch</div>}
          </div>
        </Section>

        {/* --- AI ASSISTANT --- */}
        <Section kicker="AI Assistant" title="NHẬN XÉT & CHIẾN LƯỢC" open={aiOpen} onToggle={() => setAiOpen((v) => !v)}>
          <div className="ab-row-gap">
            <button type="button" className="ab-btn ab-btn-primary" onClick={handleAiPortfolioInsights} disabled={aiLoading || !positions.length} style={btnStyle}>
              {aiLoading ? <><RefreshCw size={14} className="spin-animation" /> ĐANG PHÂN TÍCH</> : 'PHÂN TÍCH DANH MỤC'}
            </button>
          </div>
          {aiError && <div className="ab-error" style={{ marginTop: 10 }}>{aiError}</div>}
          
          {aiResult ? (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 14, backgroundColor: 'var(--soft)', borderRadius: 14, fontStyle: 'italic', border: '1px solid var(--border)' }}>
                "{aiResult.summary}"
              </div>
              {(aiResult.actions || []).map((item) => (
                <div key={item.symbol} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--card)' }}>
                  <div className="ab-row-between align-center" style={{ marginBottom: 10 }}>
                    <strong style={{ fontSize: 16, fontWeight: 800 }}>{item.symbol} · {item.action}</strong>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, backgroundColor: 'var(--soft)' }}>{item.confidence}</span>
                  </div>
                  <div className="ab-soft-label" style={{ fontSize: 13, marginBottom: 12, color: fg() }}>{item.reason}</div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '8px 0', borderRadius: 12 }}>
                        <div style={{ color: 'var(--green)', fontSize: 10, letterSpacing: '0.04em' }}>CHỐT LỜI (TP)</div>
                        <div className="num-premium" style={{ color: 'var(--green)', marginTop: 4, fontSize: 16 }}>{Number.isFinite(Number(item.tp)) ? formatCompactPrice(Number(item.tp)) : '--'}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '8px 0', borderRadius: 12 }}>
                        <div style={{ color: 'var(--red)', fontSize: 10, letterSpacing: '0.04em' }}>CẮT LỖ (SL)</div>
                        <div className="num-premium" style={{ color: 'var(--red)', marginTop: 4, fontSize: 16 }}>{Number.isFinite(Number(item.sl)) ? formatCompactPrice(Number(item.sl)) : '--'}</div>
                    </div>
                  </div>
                </div>
              ))}
              {aiResult.risks?.length ? (
                <div style={{ marginTop: 8, padding: 14, backgroundColor: 'rgba(244, 63, 94, 0.05)', borderRadius: 14, border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                  <span style={{ color: 'var(--red)', fontWeight: 800 }}>⚠️ RỦI RO CẦN LƯU TÂM: </span>
                  <span className="ab-soft-label" style={{ fontWeight: 600 }}>{aiResult.risks.join(' | ')}</span>
                </div>
              ) : null}
            </div>
          ) : !aiLoading && <div className="ab-note" style={{ marginTop: 10 }}>Nhấn “Phân tích danh mục” để AI đưa gợi ý xử lý và thiết lập TP/SL.</div>}
        </Section>

      </div>

      {/* --- UI TIN TỨC POPUP (MODAL) --- */}
      {newsModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="ab-premium-card" style={{ width: '100%', maxWidth: 450, maxHeight: '80vh', overflowY: 'auto', position: 'relative', margin: 0, padding: 20 }}>
            <div className="ab-row-between align-center" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Newspaper size={20} color="var(--primary)" />
                TIN TỨC: {newsModal.symbol}
              </div>
              <button 
                onClick={() => setNewsModal({ isOpen: false, symbol: '', news: [] })} 
                style={{ background: 'var(--soft)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', padding: 6, borderRadius: '50%', display: 'grid', placeItems: 'center' }}
              >
                <X size={16} />
              </button>
            </div>
            
            {newsModal.news.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {newsModal.news.map((n, i) => (
                  <a key={i} href={`https://www.google.com/search?q=${encodeURIComponent(n.title)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', padding: 14, background: 'var(--soft)', borderRadius: 16, border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14, marginBottom: 8, lineHeight: 1.4 }}>{n.title}</div>
                    <div className="num-premium" style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{n.source} • {new Date(n.pubDate).toLocaleDateString('vi-VN')}</div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="ab-soft-label" style={{ textAlign: 'center', padding: '30px 0', lineHeight: 1.5 }}>
                Chưa có dữ liệu tin tức. <br/>
                Vui lòng bấm nút <b>"PHÂN TÍCH DANH MỤC"</b> ở bên dưới để hệ thống AI lấy tin tức mới nhất về nhé!
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
