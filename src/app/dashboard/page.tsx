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

type QuoteDebugItem = { symbol: string; price: number; change: number; pct: number };
type PricesResponse = { prices?: PriceMap; debug?: QuoteDebugItem[]; error?: string; cached?: boolean };
type TelegramSettings = { chat_id: string;
is_enabled: boolean; notify_daily: boolean; daily_hour_vn: number };
type TxTypeFilter = 'ALL' | 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
type CashMode = 'CASH' | 'ADJUSTMENT';
type TradeMode = 'BUY' | 'SELL';
type HistoryRow =
  | { kind: 'trade';
item: Transaction; sortDate: string }
  | { kind: 'cash'; item: CashTransaction; sortDate: string };
const DEFAULT_TELEGRAM: TelegramSettings = {
  chat_id: '',
  is_enabled: false,
  notify_daily: true,
  daily_hour_vn: 15,
};
const DEFAULT_TRADE_FORM = {
  symbol: '',
  price: '',
  quantity: '',
  trade_date: '',
  note: '',
};
const DEFAULT_CASH_FORM = {
  transaction_type: 'DEPOSIT' as 'DEPOSIT' | 'WITHDRAW',
  amount: '',
  transaction_date: '',
  note: '',
};
const cardStyle = {
  borderRadius: 24,
  background: 'var(--card)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-soft)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
} as const;
const strongCardStyle = {
  ...cardStyle,
  border: '1px solid var(--border-strong)',
  boxShadow: 'var(--shadow)',
} as const;
const inputStyle = {
  borderRadius: 18,
  background: 'var(--soft)',
  color: 'var(--text)',
  border: '1px solid var(--border-strong)',
} as const;
const btnStyle = {
  borderRadius: 18,
  boxShadow: '0 10px 18px rgba(15,23,42,0.08)',
} as const;
const pillStyle = {
  borderRadius: 999,
  padding: '6px 10px',
  background: 'var(--soft-2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 700,
} as const;
const muted = () => 'var(--muted)';
const fg = () => 'var(--text)';
const up = () => 'var(--green)';
const down = () => 'var(--red)';

function formatCompactPrice(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatChange(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '' : '';
  return sign + new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
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

function statTone(value: number) {
  return value >= 0 ? 'up' : 'down';
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

function clampHour(value: number) {
  if (!Number.isFinite(value)) return 15;
  return Math.min(23, Math.max(0, Math.floor(value)));
}

function vnHourToUtc(vnHour: number) {
  return (clampHour(vnHour) - 7 + 24) % 24;
}

function utcHourToVn(utcHour: number) {
  return (clampHour(utcHour) + 7) % 24;
}

function formatTradeDate(value?: string | null) {
  if (!value) return 'Không ngày';
  return new Intl.DateTimeFormat('vi-VN').format(new Date(value));
}

function getTransactionLabel(type: TxTypeFilter | Transaction['transaction_type'] | CashTransaction['transaction_type']) {
  switch (type) {
    case 'BUY':
      return 'Mua';
    case 'SELL':
      return 'Bán';
    case 'DEPOSIT':
      return 'Nạp tiền';
    case 'WITHDRAW':
      return 'Rút tiền';
    default:
      return 'Tất cả';
}
}

function formatIntegerInput(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}

function parseIntegerInput(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return 0;
  return Number(digits);
}

function HeroMetric({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean | null;
}) {
  const toneColor = positive === null ||
  positive === undefined ? fg() : positive ? up() : down();
  return (
    <div
      style={{
        ...strongCardStyle,
        padding: 14,
        borderRadius: 18,
        boxShadow: 'none',
        background: 'linear-gradient(180deg, var(--card), var(--soft))',
      }}
    >
      <div style={{ fontSize: 12, color: muted(), fontWeight: 700 }}>{label}</div>
      <div
        style={{
     
     marginTop: 6,
          fontSize: 22,
          lineHeight: 1.15,
          fontWeight: 900,
          color: toneColor,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
      {sub ? (
   
     <div style={{ marginTop: 6, fontSize: 12, color: muted(), fontWeight: 600 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function MiniInfoCard({
  label,
  value,
  subValue,
  icon,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        padding: 14,
        borderRadius: 18,
        boxShadow: 'none',
      }}
    >
      <div
        style={{
     
     display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, color: muted(), fontWeight: 700 }}>{label}</div>
        {icon ? <div style={{ color: muted() }}>{icon}</div> : null}
      </div>
      <div
   
     style={{
          marginTop: 8,
          fontSize: 18,
          fontWeight: 900,
          color: fg(),
          lineHeight: 1.2,
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
 
     {subValue ? (
        <div style={{ marginTop: 6, fontSize: 12, color: muted(), fontWeight: 600 }}>{subValue}</div>
      ) : null}
    </div>
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
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const [resettingPortfolio, setResettingPortfolio] = useState(false);
  const bootstrapSession = useCallback(async () => {
    const [{ data: userData }, token] = await Promise.all([supabase.auth.getUser(), getAccessToken()]);
    if (!userData.user) {
      window.location.href = '/';
      return null;
    }
    setUserId(userData.user.id);
    setEmail(userData.user.email || '');
    setAccessToken(token);
    return {
      userId: userData.user.id,
      email: userData.user.email || '',
      accessToken: token,
    };
  }, []);
  const loadTelegramSettings = useCallback(
    async (token?: string) => {
      setTelegramLoading(true);
      setTelegramMessage('');
      try {
        const resolvedToken = token || accessToken || (await getAccessToken());
        if (!resolvedToken) return;

        const response = await fetch('/api/telegram/settings', {
          headers: { Authorization: `Bearer ${resolvedToken}` },
        });
        
        const payload = await response.json();

        if (response.ok && payload?.settings) {
          setTelegram({
            chat_id: payload.settings.chat_id || '',
            is_enabled: Boolean(payload.settings.is_enabled),
            notify_daily: payload.settings.notify_daily !== false,
            daily_hour_vn: utcHourToVn(Number(payload.settings.daily_hour_utc ?? 8)),
          });
      
       } else {
          setTelegram(DEFAULT_TELEGRAM);
        }
      } catch {
        setTelegramMessage('Không tải được cấu hình Telegram');
      } finally {
        setTelegramLoading(false);
}
    },
    [accessToken]
  );
  const loadPortfolio = useCallback(
    async (resolvedUserId?: string, resolvedEmail?: string) => {
      setLoading(true);
      setMessage('');

      let currentUserId = resolvedUserId || userId;
      let currentEmail = resolvedEmail || email;

      if (!currentUserId) {
        const session = await bootstrapSession();
        if (!session) return;
        currentUserId = session.userId;
        currentEmail = session.email;
   
       }

      setEmail(currentEmail);

      const [transactionsRes, cashRes, settingsRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', currentUserId)
          .order('trade_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
        supabase
  
         .from('cash_transactions')
          .select('*')
          .eq('user_id', currentUserId)
          .order('transaction_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
        supabase.from('portfolio_settings').select('*').eq('user_id', currentUserId).maybeSingle(),
      ]);
      if (transactionsRes.error) {
        setTransactions([]);
        setMessage(transactionsRes.error.message);
      } else {
        setTransactions((transactionsRes.data || []) as Transaction[]);
      }

      if (cashRes.error) {
        setCashTransactions([]);
        if (!transactionsRes.error) setMessage(cashRes.error.message);
      } else {
        setCashTransactions((cashRes.data || []) as CashTransaction[]);
      }

      if (settingsRes.error) {
        setPortfolioSettings(null);
        if (!transactionsRes.error && !cashRes.error) setMessage(settingsRes.error.message);
      } else {
        const settings = (settingsRes.data || null) as PortfolioSettings |
        null;
        const adjustment = Number(settings?.cash_adjustment || 0);
        setPortfolioSettings(settings);
        setAdjustmentSign(adjustment >= 0 ? 1 : -1);
        setAdjustmentAmountInput(String(Math.abs(adjustment)));
      }

      setLoading(false);
    },
    [bootstrapSession, email, userId]
  );
  const openHoldings = useMemo(() => deriveOpenHoldings(transactions), [transactions]);
  const enrichedTransactions = useMemo(() => enrichTransactions(transactions), [transactions]);
  const loadPrices = useCallback(async (items: typeof openHoldings) => {
    const symbols = [...new Set(items.map((item) => item.symbol.toUpperCase()))];
    if (!symbols.length) {
      setPrices({});
      setQuotes([]);
      return;
    }

    setRefreshing(true);
    setMessage('');
    try {
      const response = await fetch('/api/prices-cache?symbols=' + encodeURIComponent(symbols.join(',')), {
        cache: 'no-store',
      });
      const data: PricesResponse = await response.json();

  
         if (!response.ok) {
        setPrices({});
        setQuotes([]);
        setMessage(data?.error || 'Không lấy được giá');
      } else {
        setPrices(data.prices || {});
        setQuotes((data.debug || []).sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true })));
      }
    } catch {
      setPrices({});
      setQuotes([]);
     
      setMessage('Lỗi kết nối');
    } finally {
      setRefreshing(false);
    }
  }, []);
  const loadVnIndex = useCallback(async () => {
    try {
      const response = await fetch('/api/prices-cache?symbols=VNINDEX', { cache: 'no-store' });
      const data: PricesResponse = await response.json();
      const item = data?.debug?.[0];
      setVnIndex(item && Number(item.price) > 0 ? item : null);
    } catch {
      setVnIndex(null);
    }
  }, []);
  useEffect(() => {
    void (async () => {
      const session = await bootstrapSession();
      if (!session) return;

      await Promise.all([
        loadPortfolio(session.userId, session.email),
        loadTelegramSettings(session.accessToken),
        loadVnIndex(),
      ]);
    })();
  }, [bootstrapSession, loadPortfolio, loadTelegramSettings, loadVnIndex]);
  useEffect(() => {
    if (openHoldings.length > 0) loadPrices(openHoldings);
    else {
      setPrices({});
      setQuotes([]);
    }
  }, [openHoldings, loadPrices]);
  const positions = useMemo(() => groupHoldingsBySymbol(openHoldings), [openHoldings]);
  const summary = useMemo(() => calcSummary(openHoldings, prices), [openHoldings, prices]);
  const realizedSummary = useMemo(() => calcRealizedSummary(enrichedTransactions), [enrichedTransactions]);
  const cashSummary = useMemo(
    () => calcCashSummary(cashTransactions, enrichedTransactions, portfolioSettings),
    [cashTransactions, enrichedTransactions, portfolioSettings]
  );
  const quoteMap = useMemo(() => getQuoteMap(quotes), [quotes]);

  const totalCapital = cashSummary.netCapital;
  const actualNav = cashSummary.actualCash;
  const marketValue = summary.totalNow;
  const totalAssets = actualNav + marketValue;
  const totalPnl = totalAssets - totalCapital;
  const unrealizedPnl = summary.totalPnl;
  const totalPnlPct = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;
  const dayPnl = useMemo(
    () =>
      positions.reduce((sum, position) => {
        const quote = quoteMap.get(position.symbol.toUpperCase());
        return sum + Number(quote?.change || 0) * Number(position.quantity || 0);
      }, 0),
    [positions, quoteMap]
  );
  const allocations = useMemo(() => {
    const totalNow = marketValue || 0;
    return positions
      .map((position) => {
        const row = calcPosition(position, prices);
        const percent = totalNow > 0 ? (row.totalNow / totalNow) * 100 : 0;
        return { symbol: position.symbol, totalNow: row.totalNow, percent };
      })
      .sort((a, b) => b.totalNow - a.totalNow);
  }, [positions, prices, marketValue]);
  const historyRows = useMemo(() => {
    const tradeRows: HistoryRow[] = enrichedTransactions.map((item) => ({
      kind: 'trade',
      item,
      sortDate: item.trade_date || item.created_at,
    }));

    const cashRows: HistoryRow[] = cashTransactions.map((item) => ({
      kind: 'cash',
      item,
      sortDate: item.transaction_date || item.created_at,
    }));

    return [...tradeRows, ...cashRows]
      .filter((row) =>
        historyFilter === 
          'ALL'
          ? true
          : row.kind === 'trade'
          ? row.item.transaction_type === historyFilter
          : row.item.transaction_type === historyFilter
      )
      .filter((row) =>
        !historySymbol.trim()
          ? true
          : row.kind === 'cash'
     
      ? true
          : row.item.symbol.toUpperCase().includes(historySymbol.trim().toUpperCase())
      )
      .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  }, [cashTransactions, enrichedTransactions, historyFilter, historySymbol]);
  async function handleTradeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!userId) {
      setMessage('Phiên đăng nhập không hợp lệ');
      return;
    }

    const symbol = tradeForm.symbol.trim().toUpperCase();
    const price = parseIntegerInput(tradeForm.price);
    const quantity = parseIntegerInput(tradeForm.quantity);
    if (!symbol || !price || !quantity) {
      setMessage(`Nhập đủ mã, giá ${tradeMode === 'BUY' ? 'mua' : 'bán'}, số lượng`);
      return;
    }

    if (editingTradeId) {
      const { error } = await supabase
        .from('transactions')
        .update({
          symbol,
          transaction_type: tradeMode,
          price,
          quantity,
          trade_date: tradeForm.trade_date || null,
          note: 
          tradeForm.note.trim() || null,
          avg_cost: null,
          realized_pnl: null,
        })
        .eq('id', editingTradeId)
        .eq('user_id', userId);
      if (error) {
        setMessage(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('transactions').insert({
        user_id: userId,
        symbol,
        transaction_type: tradeMode,
        price,
        quantity,
        trade_date: tradeForm.trade_date || null,
        note: tradeForm.note.trim() || null,
        avg_cost: null,
        realized_pnl: 
        null,
      });

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setTradeForm(DEFAULT_TRADE_FORM);
    setEditingTradeId(null);
    setTradeOpen(false);
    await loadPortfolio(userId, email);
  }

  async function handleCashSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!userId) {
      setMessage('Phiên đăng nhập không hợp lệ');
      return;
    }

    const amount = parseIntegerInput(cashForm.amount);
    if (!amount) {
      setMessage('Nhập số tiền hợp lệ');
      return;
    }

    if (editingCashId) {
      const { error } = await supabase
        .from('cash_transactions')
        .update({
          transaction_type: cashForm.transaction_type,
          amount,
          transaction_date: cashForm.transaction_date || null,
          note: cashForm.note.trim() || null,
        })
        .eq('id', editingCashId)
 
        .eq('user_id', userId);

      if (error) {
        setMessage(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('cash_transactions').insert({
        user_id: userId,
        transaction_type: cashForm.transaction_type,
        amount,
        transaction_date: cashForm.transaction_date || null,
        note: cashForm.note.trim() || null,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setCashForm(DEFAULT_CASH_FORM);
    setEditingCashId(null);
    await loadPortfolio(userId, email);
  }

  async function handleSaveCashAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSavingAdjustment(true);
    if (!userId) {
      setSavingAdjustment(false);
      setMessage('Phiên đăng nhập không hợp lệ');
      return;
    }

    const baseAmount = parseIntegerInput(adjustmentAmountInput);
    if (!Number.isFinite(baseAmount)) {
      setSavingAdjustment(false);
      setMessage('Điều chỉnh tiền mặt không hợp lệ');
      return;
    }

    const cashAdjustment = adjustmentSign * Math.abs(baseAmount);
    const { error } = await supabase
      .from('portfolio_settings')
      .upsert({ user_id: userId, cash_adjustment: cashAdjustment }, { onConflict: 'user_id' });
    setSavingAdjustment(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPortfolio(userId, email);
  }

  function editTrade(item: Transaction) {
    setTradeMode(item.transaction_type === 'SELL' ? 'SELL' : 'BUY');
    setTradeForm({
      symbol: item.symbol,
      price: formatIntegerInput(String(item.price)),
      quantity: formatIntegerInput(String(item.quantity)),
      trade_date: item.trade_date || '',
      note: item.note || '',
    });
    setEditingTradeId(item.id);
    setTradeOpen(true);
    setCashOpen(false);
  }

  function editCash(item: CashTransaction) {
    setCashMode('CASH');
    setCashForm({
      transaction_type: item.transaction_type,
      amount: formatIntegerInput(String(item.amount)),
      transaction_date: item.transaction_date || '',
      note: item.note || '',
    });
    setEditingCashId(item.id);
    setCashOpen(true);
    setTradeOpen(false);
  }

  async function deleteTrade(item: Transaction) {
    if (!window.confirm(`Xóa giao dịch ${getTransactionLabel(item.transaction_type)} ${item.symbol}?`)) return;
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', item.id)
      .eq('user_id', userId);
    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPortfolio(userId, email);
  }

  async function deleteCash(item: CashTransaction) {
    if (!window.confirm(`Xóa giao dịch ${getTransactionLabel(item.transaction_type)}?`)) return;
    const { error } = await supabase
      .from('cash_transactions')
      .delete()
      .eq('id', item.id)
      .eq('user_id', userId);
    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPortfolio(userId, email);
  }

  async function deleteSymbol(symbol: string) {
    if (!userId) {
      setMessage('Phiên đăng nhập không hợp lệ');
      return;
    }

    const symbolUpper = symbol.toUpperCase();
    const transactionCount = transactions.filter((item) => item.symbol.toUpperCase() === symbolUpper).length;
    if (
      !window.confirm(
        `Xóa toàn bộ ${transactionCount} giao dịch của mã ${symbolUpper}? Hành động này sẽ cập nhật lại danh mục và lãi/lỗ.`
      )
    )
      return;
    setMessage('');
    const { error } = await supabase.from('transactions').delete().eq('user_id', userId).eq('symbol', symbolUpper);

    if (error) {
      setMessage(error.message);
      return;
    }

    setExpandedSymbols((prev) => {
      const next = { ...prev };
      delete next[symbolUpper];
      return next;
    });
    if (editingTradeId && tradeForm.symbol.trim().toUpperCase() === symbolUpper) {
      setEditingTradeId(null);
      setTradeForm(DEFAULT_TRADE_FORM);
      setTradeOpen(false);
    }

    if (historySymbol.trim().toUpperCase() === symbolUpper) setHistorySymbol('');
    await loadPortfolio(userId, email);
  }

  async function resetPortfolio() {
    if (!userId) return;
    const ok = window.confirm(
      'Xóa toàn bộ danh mục hiện tại để tạo danh mục mới? Hành động này sẽ xóa tất cả giao dịch cổ phiếu, tiền mặt và cấu hình điều chỉnh.'
    );
    if (!ok) return;

    setResettingPortfolio(true);
    setMessage('');

    try {
      const [tradeRes, cashRes, settingsRes] = await Promise.all([
        supabase.from('transactions').delete().eq('user_id', userId),
        supabase.from('cash_transactions').delete().eq('user_id', userId),
        supabase.from('portfolio_settings').delete().eq('user_id', userId),
      ]);
      const firstError = tradeRes.error || cashRes.error || settingsRes.error;
      if (firstError) {
        setMessage(firstError.message || 'Không thể xóa danh mục');
        return;
      }

      setExpandedSymbols({});
      setEditingTradeId(null);
      setEditingCashId(null);
      setTradeForm(DEFAULT_TRADE_FORM);
      setCashForm(DEFAULT_CASH_FORM);
      setTradeOpen(false);
      setCashOpen(false);
      setHistoryOpen(false);
      setMessage('Đã xóa toàn bộ danh mục. Bạn có thể tạo danh mục mới.');
      await loadPortfolio(userId, email);
    } catch {
      setMessage('Không thể xóa danh mục');
    } finally {
      setResettingPortfolio(false);
    }
  }

  async function handleSaveTelegram(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTelegramSaving(true);
    setTelegramMessage('');

    try {
      const token = accessToken || (await getAccessToken());
      const response = await fetch('/api/telegram/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chat_id: telegram.chat_id.trim(),
          is_enabled: telegram.is_enabled,
          notify_daily: telegram.notify_daily,
    
          daily_hour_utc: vnHourToUtc(telegram.daily_hour_vn),
        }),
      });
      const payload = await response.json();
      if (!response.ok) setTelegramMessage(payload?.error || 'Không lưu được cấu hình');
      else {
        setTelegramMessage('Đã lưu cấu hình Telegram');
        setTelegramOpen(false);
      }
    } catch {
      setTelegramMessage('Không lưu được cấu hình');
    } finally {
      setTelegramSaving(false);
    }
  }

  async function handleTelegramTest() {
    setTelegramTesting(true);
    setTelegramMessage('');

    try {
      const token = accessToken || (await getAccessToken());
      const response = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) setTelegramMessage(payload?.error || 'Không gửi được báo cáo');
      else setTelegramMessage('Đã gửi báo cáo tới Telegram');
    } catch {
      setTelegramMessage('Không gửi được báo cáo');
    } finally {
      setTelegramTesting(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <main className="ab-page">
      <div className="ab-shell premium-gap" style={{ gap: 12 }}>
        <AppShellHeader
          title="Danh mục cá nhân"
          isLoggedIn={true}
          email={email}
          currentTab="dashboard"
          onLogout={handleLogout}
        />

        
        {message ? (
          <section style={{ ...cardStyle, padding: 12 }}>
            <div className="ab-error">{message}</div>
          </section>
        ) : null}

        <section
          style={{
            ...strongCardStyle,
            padding: 14,
       
             overflow: 'hidden',
            background:
              'linear-gradient(135deg, rgba(37,99,235,0.14), rgba(59,130,246,0.08) 35%, rgba(15,23,42,0.02) 100%), var(--card)',
          }}
        >
          <div
            style={{
              display: 'grid',
       
               gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, color: muted(), fontWeight: 800, letterSpacing: 0.2 }}>TỔNG TÀI SẢN</div>
         
              <div
                style={{
                  fontSize: 'clamp(30px, 6vw, 44px)',
                  lineHeight: 1.05,
                  fontWeight: 900,
                  color: fg(),
 
                 wordBreak: 'break-word',
                }}
              >
                {loading ?
                  '...' : formatCurrency(totalAssets)}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span
                  style={{
                    ...pillStyle,
        
                    color: getChangeColor(totalPnl),
                    background: totalPnl >= 0 ?
                      'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)',
                    borderColor: totalPnl >= 0 ?
                      'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.18)',
                  }}
                >
                  Tổng PnL {loading ?
                    '...' : formatCurrency(totalPnl)}
                </span>
                <span style={{ ...pillStyle, color: getChangeColor(totalPnlPct) }}>
                  {loading ?
                    '...' : `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`}
                </span>
                <span style={{ ...pillStyle, color: getChangeColor(dayPnl) }}>
                  Hôm nay {loading ?
                    '...' : formatCurrency(dayPnl)}
                </span>
              </div>

              <div style={{ fontSize: 12, color: muted(), fontWeight: 600 }}>
                {refreshing ?
                  'Đang cập nhật giá thị trường...' : 'Tổng quan danh mục của bạn trong phiên hiện tại'}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
               
                 gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                alignSelf: 'stretch',
              }}
            >
              <HeroMetric
                label="NAV thực tế"
    
                value={loading ?
                  '...' : formatCurrency(actualNav)}
                sub="Tiền mặt hiện có"
              />
              <HeroMetric
                label="Giá trị thị trường"
                value={loading ?
                  '...' : formatCurrency(marketValue)}
                sub={`${positions.length} mã đang nắm giữ`}
              />
              <HeroMetric
                label="Lãi/Lỗ đã chốt"
                value={loading ?
                  '...' : formatCurrency(realizedSummary.totalRealizedPnl)}
                sub={`${realizedSummary.totalSellOrders} lệnh bán`}
                positive={realizedSummary.totalRealizedPnl >= 0}
              />
              <HeroMetric
                label="Lãi/Lỗ đang mở"
                
                value={loading ? '...' : formatCurrency(unrealizedPnl)}
                sub="Vị thế hiện tại"
                positive={unrealizedPnl >= 0}
              />
            </div>
          </div>

          {vnIndex ?
            (
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
      
                  alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
              }}
            >
          
                <div style={{ fontSize: 12, fontWeight: 800, color: muted() }}>VN-INDEX</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: fg() }}>{formatCompactPrice(vnIndex.price)}</span>
                <span style={{ ...pillStyle, color: getChangeColor(vnIndex.change) }}>
                  {formatChange(vnIndex.change)} 
                  · {formatPct(vnIndex.pct)}
                </span>
              </div>
            </div>
          ) : null}
        </section>

        <Section
          kicker="Thống kê"
          title="Chi tiết danh mục"
          open={detailsOpen}
          onToggle={() => setDetailsOpen((v) => !v)}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <section
              style={{
                display: 'grid',
                gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              }}
            >
              <MiniInfoCard
                label="Tổng vốn"
                value={loading ? '...' : formatCurrency(totalCapital)}
                subValue="Net nạp trừ rút"
                icon={<Landmark size={16} />}
              />
              <MiniInfoCard
                label="Tiền mặt tính toán"
                value={loading ? '...' : formatCurrency(cashSummary.calculatedCash)}
                subValue="Từ dòng tiền và giao dịch"
                icon={<Wallet size={16} />}
              />
              <MiniInfoCard
                label="Điều chỉnh tiền mặt"
                value={loading ? '...' : `${cashSummary.cashAdjustment >= 0 ? '+' : ''}${formatCurrency(cashSummary.cashAdjustment)}`}
                subValue="Manual adjustment"
                icon={<PieChart size={16} />}
              />
              <MiniInfoCard
                label="Lãi/Lỗ ngày"
                value={loading ? '...' : formatCurrency(dayPnl)}
                subValue="Theo biến động phiên"
                icon={dayPnl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              />
            </section>

            {!loading ? (
              <section
                style={{
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                }}
              >
                <StatCard
                  label="Tổng lãi/lỗ"
                  value={formatCurrency(totalPnl)}
                  icon={<TrendingUp size={16} />}
                  tone={statTone(totalPnl)}
                  subValue={`${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`}
                  strong
                />
                <StatCard
                  label="Lãi/lỗ trong ngày"
                  value={formatCurrency(dayPnl)}
                  icon={dayPnl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  tone={statTone(dayPnl)}
                  subValue={refreshing ? 'Đang cập nhật giá...' : 'Biến động phiên'}
                  strong
                />
                <StatCard
                  label="Lãi/lỗ cổ phiếu đang giữ"
                  value={formatCurrency(unrealizedPnl)}
                  icon={<TrendingUp size={16} />}
                  tone={statTone(unrealizedPnl)}
                  subValue="Hiệu suất vị thế mở"
                  strong
                />
                <StatCard
                  label="Lãi/lỗ đã chốt"
                  value={formatCurrency(realizedSummary.totalRealizedPnl)}
                  icon={<TrendingDown size={16} />}
                  tone={statTone(realizedSummary.totalRealizedPnl)}
                  subValue={`${realizedSummary.totalSellOrders} lệnh bán`}
                  strong
                />
              </section>
            ) : null}
          </div>
        </Section>

        {!!allocations.length ?
          (
          <section style={{ ...cardStyle, padding: 14 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
        
                  alignItems: 'center',
                marginBottom: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div 
                  className="ab-card-kicker" style={{ color: muted() }}>
                  Cơ cấu danh mục
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: fg(), marginTop: 4 }}>
                  Tỷ trọng từng vị thế
           
                </div>
              </div>
              <span style={pillStyle}>{positions.length} mã</span>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {allocations.map((item) => (
                <div key={item.symbol} style={{ 
                  display: 'grid', gap: 6 }}>
                  <div className="ab-row-between align-center" style={{ gap: 8 }}>
                    <div style={{ fontWeight: 800, color: fg(), minWidth: 0 }}>{item.symbol}</div>
                    <div style={{ fontSize: 12, color: muted(), textAlign: 'right' }}>
                
                      {formatCurrency(item.totalNow)} · {item.percent.toFixed(1)}%
                    </div>
                  </div>

                  <div
                    style={{
                
                      width: '100%',
                      height: 9,
                      borderRadius: 999,
                      background: 'var(--soft-2)',
                      overflow: 'hidden',
 
                     }}
                  >
                    <div
                      style={{
                     
                        width: `${Math.max(item.percent, 2)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background:
                     
                          'linear-gradient(90deg, rgba(37,99,235,0.95), rgba(96,165,250,0.70))',
                      }}
                    />
                  </div>
                </div>
              ))}
   
             </div>
          </section>
        ) : null}

        <section style={{ ...cardStyle, padding: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
      
                gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <div>
            
                <div className="ab-card-kicker" style={{ color: muted() }}>
                Danh mục hiện tại
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: fg(), marginTop: 4 }}>
                Holdings
              </div>
      
              </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={pillStyle}>{positions.length} mã</span>
              <span style={pillStyle}>{openHoldings.length} lot mở</span>
            </div>
          </div>

          {!loading && positions.length ?
            (
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              }}
       
             >
              {positions.map((position) => {
                const row = calcPosition(position, prices);
                const quote = quoteMap.get(position.symbol.toUpperCase());
                const positive = row.pnl >= 0;
                const pnlColor = 
                  positive ? up() : down();
                const isExpanded = !!expandedSymbols[position.symbol];

                return (
                  <article
                    key={position.symbol}
                    style={{
  
                      ...strongCardStyle,
                      padding: 14,
                      borderRadius: 20,
                      display: 'grid',
           
                      gap: 12,
                      boxShadow: 'none',
                    }}
                  >
                    <div className="ab-row-between align-start" style={{ gap: 10 }}>
 
                       <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                         
                            fontSize: 28,
                            lineHeight: 1,
                            fontWeight: 900,
                            color: fg(),
         
                             letterSpacing: 0.3,
                          }}
                        >
                          {position.symbol}
    
                        </div>
                        <div style={{ fontSize: 12, color: muted(), marginTop: 6 }}>
                          {position.holdings.length} lot mở · SL {position.quantity}
                 
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                        <button
               
                          type="button"
                          className="ab-delete ghost"
                          onClick={() =>
                            setExpandedSymbols((prev) => ({
     
                              ...prev,
                              [position.symbol]: !prev[position.symbol],
                            }))
                
                          }
                          style={pillStyle}
                        >
                          {isExpanded ?
                            'Ẩn lệnh' : 'Xem lệnh'}
                        </button>

                        <button
                          type="button"
                      
                          className="ab-delete ghost"
                          onClick={() => deleteSymbol(position.symbol)}
                          title={`Xóa mã ${position.symbol}`}
                          aria-label={`Xóa mã ${position.symbol}`}
           
                         >
                          <Trash2 size={14} />
                          Xóa mã
                        </button>
        
                      </div>
                    </div>

                    <div
                      style={{
                        
                        display: 'grid',
                        gap: 10,
                        gridTemplateColumns: '1fr auto',
                        alignItems: 'end',
                      }}
 
                     >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: muted(), fontWeight: 700 }}>Giá hiện tại</div>
                     
                        <div
                          style={{
                            fontSize: 26,
                            fontWeight: 900,
             
                            color: fg(),
                            marginTop: 4,
                            lineHeight: 1.1,
                          
                            wordBreak: 'break-word',
                          }}
                        >
                          {formatCompactPrice(quote?.price ??
                            row.currentPrice)}
                        </div>
                        <div
                          style={{
                          
                            fontSize: 13,
                            fontWeight: 800,
                            color: getChangeColor(quote?.change),
                            marginTop: 6,
          
                          }}
                        >
                          {formatChange(quote?.change)} · {formatPct(quote?.pct)}
                        </div>
        
                      </div>

                      <div
                        style={{
                          borderRadius: 16,
             
                           padding: '10px 12px',
                          background: positive ?
                            'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)',
                          border: `1px solid ${positive ?
                            'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.18)'}`,
                          color: pnlColor,
                          textAlign: 'right',
                          minWidth: 120,
                 
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9 }}>PnL</div>
                        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>{formatCurrency(row.pnl)}</div>
       
                         <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>
                          {row.pnlPct >= 0 ?
                            '+' : ''}
                          {row.pnlPct.toFixed(2)}%
                        </div>
                      </div>
                    </div>

      
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <div style={pillStyle}>SL {position.quantity}</div>
                      <div style={pillStyle}>Giá vốn TB {formatCurrency(position.avgBuyPrice)}</div>
                    </div>

        
                    <div
                      style={{
                        display: 'grid',
                        gap: 10,
                
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      }}
                    >
                      <div
                        style={{
 
                          ...cardStyle,
                          padding: 10,
                          borderRadius: 16,
                     
                          boxShadow: 'none',
                        }}
                      >
                        <div style={{ fontSize: 11, color: muted() }}>Tổng mua</div>
                 
                        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: fg() }}>
                          {formatCurrency(row.totalBuy)}
                        </div>
                      </div>

           
                      <div
                        style={{
                          ...cardStyle,
                          padding: 10,
            
                          borderRadius: 16,
                          boxShadow: 'none',
                        }}
                      >
            
                        <div style={{ fontSize: 11, color: muted() }}>Hiện tại</div>
                        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: fg() }}>
                          {formatCurrency(row.totalNow)}
                     
                        </div>
                      </div>
                    </div>

                    {isExpanded ?
                      (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {position.holdings.map((holding) => (
                          <div
                    
                            key={holding.id}
                            style={{
                              ...cardStyle,
                              padding: 10,
   
                              borderRadius: 14,
                              boxShadow: 'none',
                            }}
             
                           >
                            <div style={{ fontSize: 12, fontWeight: 800, color: fg() }}>
                              {formatTradeDate(holding.buy_date)} · SL {holding.quantity}
                  
                            </div>
                            <div style={{ fontSize: 12, color: muted(), marginTop: 4 }}>
                              Giá mua {formatCurrency(Number(holding.buy_price))}
                      
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : 
                      null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="ab-note" style={{ color: muted() }}>
              {loading ? 'Đang tải danh mục...' : 'Chưa có vị thế đang nắm giữ'}
            </div>
          )}
        </section>

  
        <Section
          kicker="Giao dịch"
          title={editingTradeId ?
            `Sửa lệnh ${tradeMode === 'BUY' ? 'mua' : 'bán'}` : 'Thêm giao dịch'}
          open={tradeOpen}
          onToggle={() => setTradeOpen((v) => !v)}
        >
          <div
            style={{
              display: 'grid',
              gap: 8,
    
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              className={`ab-btn ${tradeMode === 'BUY' ?
                'ab-btn-primary' : 'ab-btn-subtle'}`}
              onClick={() => setTradeMode('BUY')}
              style={btnStyle}
            >
              Lệnh mua
            </button>
            <button
              type="button"
   
              className={`ab-btn ${tradeMode === 'SELL' ?
                'ab-btn-primary' : 'ab-btn-subtle'}`}
              onClick={() => setTradeMode('SELL')}
              style={btnStyle}
            >
              Lệnh bán
            </button>
          </div>

          <form
         
            onSubmit={handleTradeSubmit}
            className="ab-form-grid compact-form-grid"
            style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
          >
            <input
              value={tradeForm.symbol}
              onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value.toUpperCase() })}
       
              placeholder="Mã"
              className="ab-input"
              style={inputStyle}
            />
            <input
              value={tradeForm.price}
              onChange={(e) => setTradeForm({ ...tradeForm, price: formatIntegerInput(e.target.value) })}
       
              type="text"
              inputMode="numeric"
              placeholder={tradeMode === 'BUY' ?
                'Giá mua' : 'Giá bán'}
              className="ab-input"
              style={inputStyle}
            />
            <input
              value={tradeForm.quantity}
              onChange={(e) => setTradeForm({ ...tradeForm, quantity: formatIntegerInput(e.target.value) })}
          
              type="text"
              inputMode="numeric"
              placeholder="Số lượng"
              className="ab-input"
              style={inputStyle}
            />
            <input
              value={tradeForm.trade_date}
 
              onChange={(e) => setTradeForm({ ...tradeForm, trade_date: e.target.value })}
              type="date"
              className="ab-input"
              style={inputStyle}
            />
            <input
              value={tradeForm.note}
 
              onChange={(e) => setTradeForm({ ...tradeForm, note: e.target.value })}
              placeholder="Ghi chú"
              className="ab-input"
              style={{ ...inputStyle, gridColumn: '1 / -1' }}
            />

            <div className="ab-row-gap" style={{ gridColumn: '1 / -1' }}>
 
              <button type="submit" className="ab-btn ab-btn-primary" style={btnStyle}>
                Lưu giao dịch
              </button>
              {editingTradeId ?
                (
                <button
                  type="button"
                  className="ab-btn ab-btn-subtle"
                  onClick={() => {
                    setEditingTradeId(null);
       
                    setTradeForm(DEFAULT_TRADE_FORM);
                    setTradeOpen(false);
                  }}
                  style={btnStyle}
                >
               
                  Hủy
                </button>
              ) : null}
            </div>
          </form>
        </Section>

        <Section
          kicker="Giao dịch"
          title="Nhật ký giao dịch"
   
          open={historyOpen}
          onToggle={() => setHistoryOpen((v) => !v)}
        >
          <div
            className="ab-row-gap"
            style={{
              marginBottom: 12,
              display: 'grid',
       
              gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value as TxTypeFilter)}
         
              className="ab-input"
              style={inputStyle}
            >
              <option value="ALL">Tất cả</option>
              <option value="BUY">Mua</option>
              <option value="SELL">Bán</option>
              <option value="DEPOSIT">Nạp tiền</option>
       
              <option value="WITHDRAW">Rút tiền</option>
            </select>

            <input
              value={historySymbol}
              onChange={(e) => setHistorySymbol(e.target.value)}
              placeholder="Lọc theo mã"
              className="ab-input"
       
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {historyRows.length ?
              (
              historyRows.map((row) =>
                row.kind === 'trade' ? (
                  <div
                    key={row.item.id}
                    style={{
       
                      ...cardStyle,
                      padding: 12,
                      borderRadius: 16,
                      boxShadow: 'none',
                
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: fg() }}>
                      {getTransactionLabel(row.item.transaction_type)} · {row.item.symbol} · SL {row.item.quantity}
                    </div>

   
                    <div style={{ fontSize: 12, color: muted(), marginTop: 5 }}>
                      {formatTradeDate(row.item.trade_date)} · Giá {formatCurrency(Number(row.item.price))}
                      {row.item.transaction_type === 'SELL'
                        ? ` 
                          · Đã chốt ${formatCurrency(Number(row.item.realized_pnl || 0))}`
                        : ''}
                    </div>

                    <div className="ab-row-gap" style={{ marginTop: 8 }}>
                      <button
   
                        type="button"
                        className="ab-btn ab-btn-subtle"
                        onClick={() => editTrade(row.item)}
                        style={btnStyle}
    
                      >
                        Sửa
                      </button>
                      <button type="button" className="ab-delete ghost" onClick={() => deleteTrade(row.item)}>
        
                        Xóa
                      </button>
                    </div>
                  </div>
                ) : (
      
                  <div
                    key={row.item.id}
                    style={{
                      ...cardStyle,
                      padding: 12,
   
                      borderRadius: 16,
                      boxShadow: 'none',
                    }}
                  >
                   
                    <div style={{ fontSize: 12, fontWeight: 800, color: fg() }}>
                      {getTransactionLabel(row.item.transaction_type)}
                    </div>

                    <div style={{ fontSize: 12, color: muted(), marginTop: 5 }}>
                     
                      {formatTradeDate(row.item.transaction_date)} · {formatCurrency(Number(row.item.amount))}
                    </div>

                    <div className="ab-row-gap" style={{ marginTop: 8 }}>
                      <button
                        type="button"
      
                        className="ab-btn ab-btn-subtle"
                        onClick={() => editCash(row.item)}
                        style={btnStyle}
                      >
         
                        Sửa
                      </button>
                      <button type="button" className="ab-delete ghost" onClick={() => deleteCash(row.item)}>
                        Xóa
           
                      </button>
                    </div>
                  </div>
                )
              )
            ) : (
       
              <div className="ab-note" style={{ color: muted() }}>
                Chưa có lịch sử giao dịch
              </div>
            )}
          </div>
        </Section>

        <Section
          kicker="Tiền mặt"
    
          title="Nạp / Rút / Điều chỉnh tiền mặt"
          open={cashOpen}
          onToggle={() => setCashOpen((v) => !v)}
        >
          <div
            style={{
              display: 'grid',
              gap: 8,
   
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              className={`ab-btn ${cashMode === 'CASH' ?
                'ab-btn-primary' : 'ab-btn-subtle'}`}
              onClick={() => setCashMode('CASH')}
              style={btnStyle}
            >
              Nạp / Rút
            </button>
            <button
              type="button"
  
              className={`ab-btn ${cashMode === 'ADJUSTMENT' ?
                'ab-btn-primary' : 'ab-btn-subtle'}`}
              onClick={() => setCashMode('ADJUSTMENT')}
              style={btnStyle}
            >
              Điều chỉnh
            </button>
          </div>

          {cashMode === 'CASH' ?
            (
            <form
              onSubmit={handleCashSubmit}
              style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
            >
              <select
                value={cashForm.transaction_type}
         
                onChange={(e) =>
                  setCashForm({ ...cashForm, transaction_type: e.target.value as 'DEPOSIT' | 'WITHDRAW' })
                }
                className="ab-input"
                style={inputStyle}
              >
    
                <option value="DEPOSIT">Nạp tiền</option>
                <option value="WITHDRAW">Rút tiền</option>
              </select>

              <input
                value={cashForm.amount}
                onChange={(e) => setCashForm({ ...cashForm, amount: formatIntegerInput(e.target.value) })}
  
                type="text"
                inputMode="numeric"
                placeholder="Số tiền"
                className="ab-input"
                style={inputStyle}
              />

       
              <input
                value={cashForm.transaction_date}
                onChange={(e) => setCashForm({ ...cashForm, transaction_date: e.target.value })}
                type="date"
                className="ab-input"
                style={inputStyle}
       
              />

              <input
                value={cashForm.note}
                onChange={(e) => setCashForm({ ...cashForm, note: e.target.value })}
                placeholder="Ghi chú"
                className="ab-input"
        
                style={{ ...inputStyle, gridColumn: '1 / -1' }}
              />

              <div className="ab-row-gap" style={{ gridColumn: '1 / -1' }}>
                <button type="submit" className="ab-btn ab-btn-primary" style={btnStyle}>
                  Lưu giao dịch tiền
          
                </button>
                {editingCashId ?
                  (
                  <button
                    type="button"
                    className="ab-btn ab-btn-subtle"
                    onClick={() => {
                   
                      setEditingCashId(null);
                      setCashForm(DEFAULT_CASH_FORM);
                    }}
                    style={btnStyle}
                  >
                 
                    Hủy
                  </button>
                ) : null}
              </div>
            </form>
          ) : (
            <form
           
              onSubmit={handleSaveCashAdjustment}
              style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
            >
              <div
                style={{
                  display: 'grid',
             
                  gap: 8,
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gridColumn: '1 / -1',
                }}
              >
                <button
      
                  type="button"
                  className={`ab-btn ${adjustmentSign === 1 ?
                    'ab-btn-primary' : 'ab-btn-subtle'}`}
                  onClick={() => setAdjustmentSign(1)}
                  style={btnStyle}
                >
                  Dương (+)
                </button>

         
                <button
                  type="button"
                  className={`ab-btn ${adjustmentSign === -1 ?
                    'ab-btn-primary' : 'ab-btn-subtle'}`}
                  onClick={() => setAdjustmentSign(-1)}
                  style={btnStyle}
                >
                  Âm (-)
                </button>
         
              </div>

              <input
                value={adjustmentAmountInput}
                onChange={(e) => setAdjustmentAmountInput(formatIntegerInput(e.target.value))}
                type="text"
                inputMode="numeric"
               
                className="ab-input"
                placeholder="Nhập số điều chỉnh"
                style={{ ...inputStyle, gridColumn: '1 / -1' }}
              />

              <div
                style={{
              
                  ...cardStyle,
                  padding: 12,
                  borderRadius: 16,
                  boxShadow: 'none',
                }}
              >
         
                <div className="ab-note" style={{ color: muted() }}>
                  Tiền mặt tính toán:{' '}
                  <strong style={{ color: fg() }}>{formatCurrency(cashSummary.calculatedCash)}</strong>
                </div>
                <div className="ab-note" style={{ color: muted(), marginTop: 6 }}>
     
                  Điều chỉnh hiện tại:{' '}
                  <strong style={{ color: fg() }}>
                    {cashSummary.cashAdjustment >= 0 ?
                      '+' : ''}
                    {formatCurrency(cashSummary.cashAdjustment)}
                  </strong>
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
          
                <button type="submit" className="ab-btn ab-btn-primary" style={btnStyle}>
                  {savingAdjustment ?
                    'Đang lưu...' : 'Lưu điều chỉnh'}
                </button>
              </div>
            </form>
          )}
        </Section>

        <Section
          kicker="Telegram"
          title="Báo cáo cuối ngày"
    
          open={telegramOpen}
          onToggle={() => setTelegramOpen((v) => !v)}
        >
          <form
            onSubmit={handleSaveTelegram}
            style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
          >
            <input
       
              value={telegram.chat_id}
              onChange={(e) => setTelegram({ ...telegram, chat_id: e.target.value })}
              placeholder="Nhập chat_id Telegram"
              className="ab-input"
              style={{ ...inputStyle, gridColumn: '1 / -1' }}
            />

           
            <label className="ab-toggle-row" style={{ color: muted() }}>
              <input
                type="checkbox"
                checked={telegram.is_enabled}
                onChange={(e) => setTelegram({ ...telegram, is_enabled: e.target.checked })}
              />
            
              <span>Bật báo cáo Telegram</span>
            </label>

            <label className="ab-toggle-row" style={{ color: muted() }}>
              <input
                type="checkbox"
                checked={telegram.notify_daily}
                onChange={(e) => setTelegram({ ...telegram, 
                  notify_daily: e.target.checked })}
              />
              <span>Nhận báo cáo cuối ngày</span>
            </label>

            <input
              value={telegram.daily_hour_vn}
              onChange={(e) => setTelegram({ ...telegram, daily_hour_vn: clampHour(Number(e.target.value ||
                15)) })}
              type="number"
              min={0}
              max={23}
              className="ab-input"
              style={inputStyle}
              placeholder="Giờ Việt Nam"
            />

 
            <div className="ab-row-gap" style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="ab-btn ab-btn-primary" style={btnStyle}>
                {telegramSaving ?
                  'Đang lưu...' : 'Lưu cấu hình'}
              </button>

              <button
                type="button"
                className="ab-btn ab-btn-subtle"
                onClick={handleTelegramTest}
                disabled={telegramTesting ||
                  telegramLoading}
                style={btnStyle}
              >
                <Send size={14} />
                {telegramTesting ?
                  'Đang gửi...' : 'Gửi báo cáo'}
              </button>
            </div>
          </form>

          {telegramMessage ?
            <div className="ab-error" style={{ marginTop: 10 }}>{telegramMessage}</div> : null}
        </Section>

        <section style={{ ...cardStyle, padding: 12 }}>
          <div className="ab-row-between align-center" style={{ gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div className="ab-card-kicker" style={{ color: muted() }}>
                Reset danh mục
     
              </div>
              <div style={{ fontSize: 13, color: muted(), marginTop: 4 }}>
                Xóa toàn bộ để khởi tạo danh mục mới từ đầu.
              </div>
            </div>

            <button
              type="button"
              className="ab-delete ghost"
              onClick={resetPortfolio}
              disabled={resettingPortfolio}
            >
       
              <Trash2 size={14} />
              {resettingPortfolio ?
                'Đang xóa...' : 'Xóa toàn bộ danh mục'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
