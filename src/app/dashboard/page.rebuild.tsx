'use client';

import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
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

const cardStyle = {
  borderRadius: 22,
  background: 'var(--card, #fff)',
  color: 'var(--foreground, #0f172a)',
  border: '1px solid var(--border, rgba(148,163,184,0.18))',
  boxShadow: '0 10px 26px rgba(15,23,42,0.08)',
} as const;

const strongCardStyle = {
  ...cardStyle,
  border: '1px solid color-mix(in srgb, var(--border, #cbd5e1) 92%, transparent)',
  boxShadow: '0 12px 30px rgba(15,23,42,0.10)',
} as const;

const inputStyle = {
  borderRadius: 18,
  background: 'var(--input, #fff)',
  color: 'var(--foreground, #0f172a)',
  border: '1px solid color-mix(in srgb, var(--border, #cbd5e1) 90%, transparent)',
} as const;

const btnStyle = { borderRadius: 18, boxShadow: '0 10px 18px rgba(15,23,42,0.08)' } as const;
const pillStyle = {
  borderRadius: 999,
  padding: '6px 10px',
  background: 'var(--secondary, rgba(148,163,184,0.12))',
  border: '1px solid color-mix(in srgb, var(--border, #cbd5e1) 80%, transparent)',
  color: 'var(--foreground, #0f172a)',
  fontSize: 12,
  fontWeight: 700,
} as const;

const muted = () => 'var(--muted-foreground, #64748b)';
const fg = () => 'var(--foreground, #0f172a)';
const up = () => 'var(--green, #16a34a)';
const down = () => 'var(--red, #dc2626)';

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
  if (value === null || value === undefined || !Number.isFinite(value)) return muted();
  if (value > 0) return up();
  if (value < 0) return down();
  return muted();
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

function Section({ kicker, title, open, onToggle, children }: { kicker: string; title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section style={{ ...cardStyle, padding: 14 }}>
      <button type="button" className="ab-section-toggle" onClick={onToggle} style={{ minHeight: 'unset', width: '100%', color: fg() }}>
        <div className="ab-section-toggle-copy">
          <div className="ab-card-kicker" style={{ color: muted() }}>{kicker}</div>
          <div className="ab-section-toggle-title" style={{ fontSize: 18, color: fg() }}>{title}</div>
        </div>
        <div className="ab-section-toggle-icon" style={{ color: muted() }}>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
      </button>
      {open ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </section>
  );
}

function StatCard({ label, value, icon, subValue, tone = 'neutral', strong = false }: { label: string; value: string; icon: React.ReactNode; subValue?: string; tone?: 'neutral' | 'up' | 'down'; strong?: boolean }) {
  const color = tone === 'up' ? up() : tone === 'down' ? down() : fg();
  return (
    <article style={{ ...(strong ? strongCardStyle : cardStyle), padding: 14 }}>
      <div className="ab-stat-head" style={{ marginBottom: 6, color: tone === 'neutral' ? muted() : color }}>
        {icon}
        <span className="ab-soft-label">{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.15, color }}>{value}</div>
      {subValue ? <div style={{ fontSize: 12, marginTop: 4, color: tone === 'neutral' ? muted() : color }}>{subValue}</div> : null}
    </article>
  );
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
    setUserId(userData.user.id); setEmail(userData.user.email || ''); setAccessToken(token);
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
    return [...tradeRows, ...cashRows].filter((row) => historyFilter === 'ALL' ? true : row.kind === 'trade' ? row.item.transaction_type === historyFilter : row.item.transaction_type === historyFilter).filter((row) => !historySymbol.trim() ? true : row.kind === 'cash' ? true : row.item.symbol.toUpperCase().includes(historySymbol.trim().toUpperCase())).sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  }, [cashTransactions, enrichedTransactions, historyFilter, historySymbol]);

  async function handleTradeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage('');
    if (!userId) { setMessage('Phiên đăng nhập không hợp lệ'); return; }
    const symbol = tradeForm.symbol.trim().toUpperCase(); const price = Number(tradeForm.price); const quantity = Number(tradeForm.quantity);
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
    event.preventDefault(); setMessage('');
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

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap" style={{ gap: 12 }}>
        <AppShellHeader title="Danh mục cá nhân" isLoggedIn={true} email={email} currentTab="dashboard" onLogout={handleLogout} />
        <section className="ab-summary-grid premium-summary-grid compact-top-grid" style={{ gap: 10 }}>
          <StatCard label="Tổng vốn" value={loading ? '...' : formatCurrency(totalCapital)} icon={<Landmark size={16} />} strong />
          <StatCard label="NAV thực tế" value={loading ? '...' : formatCurrency(actualNav)} icon={<Wallet size={16} />} strong />
          <StatCard label="Giá trị thị trường" value={loading ? '...' : formatCurrency(marketValue)} icon={<PieChart size={16} />} strong />
          <StatCard label="Tổng tài sản" value={loading ? '...' : formatCurrency(totalAssets)} icon={<TrendingUp size={16} />} strong />
        </section>
        {!loading ? <section className="ab-summary-grid premium-summary-grid compact-top-grid" style={{ gap: 10 }}>
          <StatCard label="Tổng lãi/lỗ" value={formatCurrency(totalPnl)} icon={<TrendingUp size={16} />} tone={statTone(totalPnl)} subValue={`${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`} />
          <StatCard label="Lãi/lỗ trong ngày" value={formatCurrency(dayPnl)} icon={dayPnl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} tone={statTone(dayPnl)} subValue={refreshing ? 'Đang cập nhật giá...' : 'Theo biến động phiên hiện tại'} />
          <StatCard label="Lãi/lỗ cổ phiếu đang giữ" value={formatCurrency(unrealizedPnl)} icon={<TrendingUp size={16} />} tone={statTone(unrealizedPnl)} subValue="Hiệu suất vị thế mở" />
          <StatCard label="Lãi/lỗ đã chốt" value={formatCurrency(realizedSummary.totalRealizedPnl)} icon={<TrendingDown size={16} />} tone={statTone(realizedSummary.totalRealizedPnl)} subValue={`${realizedSummary.totalSellOrders} lệnh bán`} />
        </section> : null}
        {vnIndex ? <section style={{ ...cardStyle, padding: 14 }}><div className="ab-row-between align-center"><div><div className="ab-card-kicker" style={{ color: muted() }}>VN-Index</div><div style={{ fontWeight: 900, fontSize: 18, color: fg() }}>{formatCompactPrice(vnIndex.price)}</div></div><div style={{ ...pillStyle, color: getChangeColor(vnIndex.change) }}>{formatChange(vnIndex.change)} · {formatPct(vnIndex.pct)}</div></div></section> : null}
        {!!allocations.length ? <section style={{ ...cardStyle, padding: 14 }}><div className="ab-card-kicker" style={{ color: muted(), marginBottom: 10 }}>Cơ cấu danh mục</div><div style={{ display: 'grid', gap: 10 }}>{allocations.map((item) => <div key={item.symbol} style={{ display: 'grid', gap: 6 }}><div className="ab-row-between align-center"><div style={{ fontWeight: 800, color: fg() }}>{item.symbol}</div><div style={{ fontSize: 12, color: muted() }}>{formatCurrency(item.totalNow)} · {item.percent.toFixed(1)}%</div></div><div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--secondary, rgba(148,163,184,0.14))', overflow: 'hidden' }}><div style={{ width: `${Math.max(item.percent, 2)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, rgba(37,99,235,0.95), rgba(96,165,250,0.65))' }} /></div></div>)}</div></section> : null}
        {message ? <section style={{ ...cardStyle, padding: 14 }}><div className="ab-error">{message}</div></section> : null}
        {!loading && positions.length ? <section className="ab-position-grid" style={{ gap: 12 }}>{positions.map((position) => { const row = calcPosition(position, prices); const quote = quoteMap.get(position.symbol.toUpperCase()); const positive = row.pnl >= 0; const isExpanded = !!expandedSymbols[position.symbol]; const pnlColor = positive ? up() : down(); return <article key={position.symbol} style={{ ...cardStyle, padding: 14 }}><div className="ab-row-between align-start" style={{ marginBottom: 6 }}><div><div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: fg() }}>{position.symbol}</div><div style={{ fontSize: 12, color: muted(), marginTop: 4 }}>{position.holdings.length} lệnh mua mở · SL {position.quantity}</div></div><button type="button" className="ab-delete ghost" onClick={() => setExpandedSymbols((prev) => ({ ...prev, [position.symbol]: !prev[position.symbol] }))} style={pillStyle}>{isExpanded ? 'Ẩn lệnh' : 'Xem lệnh'}</button></div><div style={{ fontSize: 22, fontWeight: 900, color: fg() }}>{formatCompactPrice(quote?.price ?? row.currentPrice)}</div><div style={{ fontSize: 13, fontWeight: 700, color: getChangeColor(quote?.change), marginTop: 4 }}>{formatChange(quote?.change)} · {formatPct(quote?.pct)}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}><div style={pillStyle}>SL tổng {position.quantity}</div><div style={pillStyle}>Giá vốn TB {formatCurrency(position.avgBuyPrice)}</div></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}><div style={{ ...strongCardStyle, padding: 10, borderRadius: 16, boxShadow: 'none' }}><div style={{ fontSize: 11, color: muted() }}>Tổng mua</div><div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: fg() }}>{formatCurrency(row.totalBuy)}</div></div><div style={{ ...strongCardStyle, padding: 10, borderRadius: 16, boxShadow: 'none' }}><div style={{ fontSize: 11, color: muted() }}>Hiện tại</div><div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: fg() }}>{formatCurrency(row.totalNow)}</div></div></div><div style={{ display: 'grid', gap: 8, marginTop: 10 }}><div style={{ borderRadius: 14, padding: '10px 12px', background: positive ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)', border: `1px solid ${positive ? 'rgba(22,163,74,0.20)' : 'rgba(220,38,38,0.20)'}`, color: pnlColor, display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontWeight: 700 }}>Lãi / Lỗ</span><strong>{formatCurrency(row.pnl)}</strong></div><div style={{ borderRadius: 14, padding: '10px 12px', background: positive ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)', border: `1px solid ${positive ? 'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.18)'}`, color: pnlColor, display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ fontWeight: 700 }}>Hiệu suất vị thế</span><strong>{row.pnlPct >= 0 ? '+' : ''}{row.pnlPct.toFixed(2)}%</strong></div></div>{isExpanded ? <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{position.holdings.map((holding) => <div key={holding.id} style={{ ...strongCardStyle, padding: 10, borderRadius: 14, boxShadow: 'none' }}><div style={{ fontSize: 12, fontWeight: 700, color: fg() }}>{formatTradeDate(holding.buy_date)} · SL {holding.quantity}</div><div style={{ fontSize: 12, color: muted(), marginTop: 3 }}>Giá mua {formatCurrency(Number(holding.buy_price))}</div></div>)}</div> : null}</article>; })}</section> : null}
        <Section kicker="Giao dịch" title={editingTradeId ? `Sửa lệnh ${tradeMode === 'BUY' ? 'mua' : 'bán'}` : 'Thêm giao dịch'} open={tradeOpen} onToggle={() => setTradeOpen((v) => !v)}><div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><button type="button" className={`ab-btn ${tradeMode === 'BUY' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setTradeMode('BUY')} style={{ ...btnStyle, flex: 1 }}>Lệnh mua</button><button type="button" className={`ab-btn ${tradeMode === 'SELL' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setTradeMode('SELL')} style={{ ...btnStyle, flex: 1 }}>Lệnh bán</button></div><form onSubmit={handleTradeSubmit} className="ab-form-grid compact-form-grid"><input value={tradeForm.symbol} onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value })} placeholder="Mã" required className="ab-input" style={inputStyle} /><input value={tradeForm.price} onChange={(e) => setTradeForm({ ...tradeForm, price: e.target.value })} type="number" placeholder={tradeMode === 'BUY' ? 'Giá mua' : 'Giá bán'} required className="ab-input" style={inputStyle} /><input value={tradeForm.quantity} onChange={(e) => setTradeForm({ ...tradeForm, quantity: e.target.value })} type="number" placeholder="Số lượng" required className="ab-input" style={inputStyle} /><input value={tradeForm.trade_date} onChange={(e) => setTradeForm({ ...tradeForm, trade_date: e.target.value })} type="date" className="ab-input" style={inputStyle} /><input value={tradeForm.note} onChange={(e) => setTradeForm({ ...tradeForm, note: e.target.value })} placeholder="Ghi chú" className="ab-input ab-full" style={inputStyle} /><div className="ab-row-gap"><button type="submit" className="ab-btn ab-btn-primary" style={btnStyle}>{editingTradeId ? `Lưu lệnh ${tradeMode === 'BUY' ? 'mua' : 'bán'}` : `Thêm lệnh ${tradeMode === 'BUY' ? 'mua' : 'bán'}`}</button>{editingTradeId ? <button type="button" className="ab-btn ab-btn-subtle" onClick={() => { setEditingTradeId(null); setTradeForm(DEFAULT_TRADE_FORM); setTradeOpen(false); }} style={btnStyle}>Hủy</button> : null}</div></form></Section>
        <Section kicker="Giao dịch" title="Nhật ký giao dịch" open={historyOpen} onToggle={() => setHistoryOpen((v) => !v)}><div className="ab-row-gap" style={{ marginBottom: 12 }}><select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as TxTypeFilter)} className="ab-input" style={inputStyle}><option value="ALL">Tất cả</option><option value="BUY">Mua</option><option value="SELL">Bán</option><option value="DEPOSIT">Nạp tiền</option><option value="WITHDRAW">Rút tiền</option></select><input value={historySymbol} onChange={(e) => setHistorySymbol(e.target.value)} placeholder="Lọc theo mã" className="ab-input" style={inputStyle} /></div><div style={{ display: 'grid', gap: 8 }}>{historyRows.length ? historyRows.map((row) => row.kind === 'trade' ? <div key={row.item.id} style={{ ...strongCardStyle, padding: 10, borderRadius: 14, boxShadow: 'none' }}><div style={{ fontSize: 12, fontWeight: 800, color: fg() }}>{getTransactionLabel(row.item.transaction_type)} · {row.item.symbol} · SL {row.item.quantity}</div><div style={{ fontSize: 12, color: muted(), marginTop: 4 }}>{formatTradeDate(row.item.trade_date)} · Giá {formatCurrency(Number(row.item.price))}{row.item.transaction_type === 'SELL' ? ` · Đã chốt ${formatCurrency(Number(row.item.realized_pnl || 0))}` : ''}</div><div className="ab-row-gap" style={{ marginTop: 8 }}><button type="button" className="ab-btn ab-btn-subtle" onClick={() => editTrade(row.item)} style={btnStyle}>Sửa</button><button type="button" className="ab-delete ghost" onClick={() => deleteTrade(row.item)}>Xóa</button></div></div> : <div key={row.item.id} style={{ ...strongCardStyle, padding: 10, borderRadius: 14, boxShadow: 'none' }}><div style={{ fontSize: 12, fontWeight: 800, color: fg() }}>{getTransactionLabel(row.item.transaction_type)}</div><div style={{ fontSize: 12, color: muted(), marginTop: 4 }}>{formatTradeDate(row.item.transaction_date)} · {formatCurrency(Number(row.item.amount))}</div><div className="ab-row-gap" style={{ marginTop: 8 }}><button type="button" className="ab-btn ab-btn-subtle" onClick={() => editCash(row.item)} style={btnStyle}>Sửa</button><button type="button" className="ab-delete ghost" onClick={() => deleteCash(row.item)}>Xóa</button></div></div>) : <div className="ab-note" style={{ color: muted() }}>Chưa có lịch sử giao dịch</div>}</div></Section>
        <Section kicker="Tiền mặt" title="Nạp / Rút / Điều chỉnh tiền mặt" open={cashOpen} onToggle={() => setCashOpen((v) => !v)}><div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><button type="button" className={`ab-btn ${cashMode === 'CASH' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setCashMode('CASH')} style={{ ...btnStyle, flex: 1 }}>Nạp / Rút</button><button type="button" className={`ab-btn ${cashMode === 'ADJUSTMENT' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setCashMode('ADJUSTMENT')} style={{ ...btnStyle, flex: 1 }}>Điều chỉnh</button></div>{cashMode === 'CASH' ? <form onSubmit={handleCashSubmit} className="ab-form-grid compact-form-grid"><select value={cashForm.transaction_type} onChange={(e) => setCashForm({ ...cashForm, transaction_type: e.target.value as 'DEPOSIT' | 'WITHDRAW' })} className="ab-input" style={inputStyle}><option value="DEPOSIT">Nạp tiền</option><option value="WITHDRAW">Rút tiền</option></select><input value={cashForm.amount} onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })} type="number" placeholder="Số tiền" required className="ab-input" style={inputStyle} /><input value={cashForm.transaction_date} onChange={(e) => setCashForm({ ...cashForm, transaction_date: e.target.value })} type="date" className="ab-input" style={inputStyle} /><input value={cashForm.note} onChange={(e) => setCashForm({ ...cashForm, note: e.target.value })} placeholder="Ghi chú" className="ab-input ab-full" style={inputStyle} /><div className="ab-row-gap"><button type="submit" className="ab-btn ab-btn-primary" style={btnStyle}>Lưu giao dịch tiền</button>{editingCashId ? <button type="button" className="ab-btn ab-btn-subtle" onClick={() => { setEditingCashId(null); setCashForm(DEFAULT_CASH_FORM); }} style={btnStyle}>Hủy</button> : null}</div></form> : <form onSubmit={handleSaveCashAdjustment} className="ab-form-grid compact-form-grid"><div style={{ display: 'flex', gap: 8 }}><button type="button" className={`ab-btn ${adjustmentSign === 1 ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setAdjustmentSign(1)} style={{ ...btnStyle, flex: 1 }}>Dương (+)</button><button type="button" className={`ab-btn ${adjustmentSign === -1 ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setAdjustmentSign(-1)} style={{ ...btnStyle, flex: 1 }}>Âm (-)</button></div><input value={adjustmentAmountInput} onChange={(e) => setAdjustmentAmountInput(e.target.value)} type="number" inputMode="decimal" className="ab-input" placeholder="Nhập số điều chỉnh" style={inputStyle} /><div className="ab-note" style={{ color: muted() }}>Tiền mặt tính toán: <strong style={{ color: fg() }}>{formatCurrency(cashSummary.calculatedCash)}</strong></div><div className="ab-note" style={{ color: muted() }}>Điều chỉnh hiện tại: <strong style={{ color: fg() }}>{cashSummary.cashAdjustment >= 0 ? '+' : ''}{formatCurrency(cashSummary.cashAdjustment)}</strong></div><button type="submit" className="ab-btn ab-btn-primary" style={btnStyle}>{savingAdjustment ? 'Đang lưu...' : 'Lưu điều chỉnh'}</button></form>}</Section>
        <Section kicker="Telegram" title="Báo cáo cuối ngày" open={telegramOpen} onToggle={() => setTelegramOpen((v) => !v)}><form className="ab-form-grid compact-form-grid" onSubmit={handleSaveTelegram}><input value={telegram.chat_id} onChange={(e) => setTelegram({ ...telegram, chat_id: e.target.value })} placeholder="Nhập chat_id Telegram" className="ab-input ab-full" style={inputStyle} /><label className="ab-toggle-row" style={{ color: muted() }}><input type="checkbox" checked={telegram.is_enabled} onChange={(e) => setTelegram({ ...telegram, is_enabled: e.target.checked })} /><span>Bật báo cáo Telegram</span></label><label className="ab-toggle-row" style={{ color: muted() }}><input type="checkbox" checked={telegram.notify_daily} onChange={(e) => setTelegram({ ...telegram, notify_daily: e.target.checked })} /><span>Nhận báo cáo cuối ngày</span></label><input value={telegram.daily_hour_vn} onChange={(e) => setTelegram({ ...telegram, daily_hour_vn: clampHour(Number(e.target.value || 15)) })} type="number" min={0} max={23} className="ab-input" style={inputStyle} placeholder="Giờ Việt Nam" /><div className="ab-note" style={{ color: muted() }}>Báo cáo sẽ gửi theo tổng vốn, NAV thực tế, giá trị thị trường, tổng tài sản, tổng lãi/lỗ, lãi/lỗ trong ngày và chi tiết vị thế.</div><div className="ab-row-gap"><button type="submit" className="ab-btn ab-btn-primary" style={btnStyle}>{telegramSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</button><button type="button" className="ab-btn ab-btn-subtle" onClick={handleTelegramTest} disabled={telegramTesting || telegramLoading} style={btnStyle}><Send size={14} />{telegramTesting ? 'Đang gửi...' : 'Gửi báo cáo'}</button></div></form>{telegramMessage ? <div className="ab-error" style={{ marginTop: 10 }}>{telegramMessage}</div> : null}</Section>
      </div>
    </main>
  );
}
