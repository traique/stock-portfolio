'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShellHeader from '@/components/app-shell-header';
import {
  AllocationSection,
  CashSection,
  HistorySection,
  MarketIndexSection,
  PositionsSection,
  SummarySection,
  TelegramSection,
  TradeFormSection,
} from '@/components/dashboard/dashboard-sections';
import { premiumCardStyle } from '@/components/dashboard/premium-dashboard-ui';
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

type QuoteDebugItem = {
  symbol: string;
  price: number;
  change: number;
  pct: number;
};

type PricesResponse = {
  prices?: PriceMap;
  debug?: QuoteDebugItem[];
  error?: string;
  cached?: boolean;
};

type TelegramSettings = {
  chat_id: string;
  is_enabled: boolean;
  notify_daily: boolean;
  daily_hour_vn: number;
};

type TxTypeFilter = 'ALL' | 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
type CashMode = 'CASH' | 'ADJUSTMENT';

type HistoryRow =
  | { kind: 'trade'; item: Transaction; sortDate: string }
  | { kind: 'cash'; item: CashTransaction; sortDate: string };

const DEFAULT_TELEGRAM: TelegramSettings = {
  chat_id: '',
  is_enabled: false,
  notify_daily: true,
  daily_hour_vn: 15,
};

const DEFAULT_BUY_FORM = {
  symbol: '',
  price: '',
  quantity: '',
  trade_date: '',
  note: '',
};

const DEFAULT_SELL_FORM = {
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
  if (value === null || value === undefined || !Number.isFinite(value)) return 'var(--muted)';
  if (value > 0) return 'var(--green)';
  if (value < 0) return 'var(--red)';
  return 'var(--muted)';
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

function getTransactionLabel(
  type: TxTypeFilter | Transaction['transaction_type'] | CashTransaction['transaction_type']
) {
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

export default function DashboardPage() {
  const [userId, setUserId] = useState<string>('');
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

  const [buyOpen, setBuyOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [editingCashId, setEditingCashId] = useState<string | null>(null);

  const [buyForm, setBuyForm] = useState(DEFAULT_BUY_FORM);
  const [sellForm, setSellForm] = useState(DEFAULT_SELL_FORM);
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
    const [{ data: userData }, token] = await Promise.all([
      supabase.auth.getUser(),
      getAccessToken(),
    ]);

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

  const loadTelegramSettings = useCallback(async (token?: string) => {
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
  }, [accessToken]);

  const loadPortfolio = useCallback(async (resolvedUserId?: string, resolvedEmail?: string) => {
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
      const settings = (settingsRes.data || null) as PortfolioSettings | null;
      const adjustment = Number(settings?.cash_adjustment || 0);
      setPortfolioSettings(settings);
      setAdjustmentSign(adjustment >= 0 ? 1 : -1);
      setAdjustmentAmountInput(String(Math.abs(adjustment)));
    }

    setLoading(false);
  }, [bootstrapSession, email, userId]);

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
      const response = await fetch(
        '/api/prices-cache?symbols=' + encodeURIComponent(symbols.join(',')),
        { cache: 'no-store' }
      );
      const data: PricesResponse = await response.json();

      if (!response.ok) {
        setPrices({});
        setQuotes([]);
        setMessage(data?.error || 'Không lấy được giá');
      } else {
        setPrices(data.prices || {});
        setQuotes(
          (data.debug || []).sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true }))
        );
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
    (async () => {
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
  const realizedSummary = useMemo(
    () => calcRealizedSummary(enrichedTransactions),
    [enrichedTransactions]
  );
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
      .filter((row) => {
        if (historyFilter === 'ALL') return true;
        return row.kind === 'trade'
          ? row.item.transaction_type === historyFilter
          : row.item.transaction_type === historyFilter;
      })
      .filter((row) => {
        if (!historySymbol.trim()) return true;
        if (row.kind === 'cash') return true;
        return row.item.symbol.toUpperCase().includes(historySymbol.trim().toUpperCase());
      })
      .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  }, [cashTransactions, enrichedTransactions, historyFilter, historySymbol]);

  const positionViews = useMemo(() => {
    return positions.map((position) => {
      const row = calcPosition(position, prices);
      const quote = quoteMap.get(position.symbol.toUpperCase());
      const positive = row.pnl >= 0;
      const isExpanded = !!expandedSymbols[position.symbol];

      return {
        symbol: position.symbol,
        lotsText: `${position.holdings.length} lệnh mua mở · SL ${position.quantity}`,
        priceText: formatCompactPrice(quote?.price ?? row.currentPrice),
        changeText: `${formatChange(quote?.change)} · ${formatPct(quote?.pct)}`,
        changeColor: getChangeColor(quote?.change),
        quantityText: String(position.quantity),
        avgPriceText: formatCurrency(position.avgBuyPrice),
        totalBuyText: formatCurrency(row.totalBuy),
        totalNowText: formatCurrency(row.totalNow),
        pnlText: formatCurrency(row.pnl),
        pnlPctText: `${row.pnlPct >= 0 ? '+' : ''}${row.pnlPct.toFixed(2)}%`,
        positive,
        isExpanded,
        onToggle: () => setExpandedSymbols((prev) => ({ ...prev, [position.symbol]: !prev[position.symbol] })),
        lots: position.holdings.map((holding) => (
          <div key={holding.id} className="ab-mini-row">
            <div>
              <div className="ab-mini-symbol">{formatTradeDate(holding.buy_date)} · SL {holding.quantity}</div>
              <div className="ab-mini-price">Giá mua {formatCurrency(Number(holding.buy_price))}</div>
            </div>
          </div>
        )),
      };
    });
  }, [positions, prices, quoteMap, expandedSymbols]);

  async function handleBuySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!userId) {
      setMessage('Phiên đăng nhập không hợp lệ');
      return;
    }

    const symbol = buyForm.symbol.trim().toUpperCase();
    const price = Number(buyForm.price);
    const quantity = Number(buyForm.quantity);
    if (!symbol || !price || !quantity) {
      setMessage('Nhập đủ mã, giá mua, số lượng');
      return;
    }

    if (editingTradeId) {
      const { error } = await supabase
        .from('transactions')
        .update({
          symbol,
          transaction_type: 'BUY',
          price,
          quantity,
          trade_date: buyForm.trade_date || null,
          note: buyForm.note.trim() || null,
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
        transaction_type: 'BUY',
        price,
        quantity,
        trade_date: buyForm.trade_date || null,
        note: buyForm.note.trim() || null,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setBuyForm(DEFAULT_BUY_FORM);
    setEditingTradeId(null);
    setBuyOpen(false);
    await loadPortfolio(userId, email);
  }

  async function handleSellSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!userId) {
      setMessage('Phiên đăng nhập không hợp lệ');
      return;
    }

    const symbol = sellForm.symbol.trim().toUpperCase();
    const price = Number(sellForm.price);
    const quantity = Number(sellForm.quantity);
    if (!symbol || !price || !quantity) {
      setMessage('Nhập đủ mã, giá bán, số lượng');
      return;
    }

    if (editingTradeId) {
      const { error } = await supabase
        .from('transactions')
        .update({
          symbol,
          transaction_type: 'SELL',
          price,
          quantity,
          trade_date: sellForm.trade_date || null,
          note: sellForm.note.trim() || null,
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
        transaction_type: 'SELL',
        price,
        quantity,
        trade_date: sellForm.trade_date || null,
        note: sellForm.note.trim() || null,
        avg_cost: null,
        realized_pnl: null,
      });
      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setSellForm(DEFAULT_SELL_FORM);
    setEditingTradeId(null);
    setSellOpen(false);
    await loadPortfolio(userId, email);
  }

  async function handleCashSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!userId) {
      setMessage('Phiên đăng nhập không hợp lệ');
      return;
    }

    const amount = Number(cashForm.amount);
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

    const normalized = adjustmentAmountInput.replace(/\s/g, '').replace(/,/g, '');
    const baseAmount = Number(normalized || 0);
    if (!Number.isFinite(baseAmount)) {
      setSavingAdjustment(false);
      setMessage('Điều chỉnh tiền mặt không hợp lệ');
      return;
    }

    const cashAdjustment = adjustmentSign * Math.abs(baseAmount);
    const { error } = await supabase.from('portfolio_settings').upsert(
      { user_id: userId, cash_adjustment: cashAdjustment },
      { onConflict: 'user_id' }
    );
    setSavingAdjustment(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadPortfolio(userId, email);
  }

  function editTrade(item: Transaction) {
    if (item.transaction_type === 'BUY') {
      setBuyForm({
        symbol: item.symbol,
        price: String(item.price),
        quantity: String(item.quantity),
        trade_date: item.trade_date || '',
        note: item.note || '',
      });
      setEditingTradeId(item.id);
      setBuyOpen(true);
      setSellOpen(false);
      setCashOpen(false);
      return;
    }

    setSellForm({
      symbol: item.symbol,
      price: String(item.price),
      quantity: String(item.quantity),
      trade_date: item.trade_date || '',
      note: item.note || '',
    });
    setEditingTradeId(item.id);
    setSellOpen(true);
    setBuyOpen(false);
    setCashOpen(false);
  }

  function editCash(item: CashTransaction) {
    setCashMode('CASH');
    setCashForm({
      transaction_type: item.transaction_type,
      amount: String(item.amount),
      transaction_date: item.transaction_date || '',
      note: item.note || '',
    });
    setEditingCashId(item.id);
    setCashOpen(true);
    setBuyOpen(false);
    setSellOpen(false);
  }

  async function deleteTrade(item: Transaction) {
    if (!window.confirm(`Xóa giao dịch ${getTransactionLabel(item.transaction_type)} ${item.symbol}?`)) return;
    const { error } = await supabase.from('transactions').delete().eq('id', item.id).eq('user_id', userId);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadPortfolio(userId, email);
  }

  async function deleteCash(item: CashTransaction) {
    if (!window.confirm(`Xóa giao dịch ${getTransactionLabel(item.transaction_type)}?`)) return;
    const { error } = await supabase.from('cash_transactions').delete().eq('id', item.id).eq('user_id', userId);
    if (error) {
      setMessage(error.message);
      return;
    }
    await loadPortfolio(userId, email);
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
      <div className="ab-shell premium-gap">
        <AppShellHeader
          title="Danh mục cá nhân"
          isLoggedIn={true}
          email={email}
          currentTab="dashboard"
          onLogout={handleLogout}
        />

        <SummarySection
          loading={loading}
          totalCapital={totalCapital}
          actualNav={actualNav}
          marketValue={marketValue}
          totalAssets={totalAssets}
          totalPnl={totalPnl}
          totalPnlPct={totalPnlPct}
          dayPnl={dayPnl}
          unrealizedPnl={unrealizedPnl}
          realizedPnl={realizedSummary.totalRealizedPnl}
          realizedOrders={realizedSummary.totalSellOrders}
          refreshing={refreshing}
          getTone={statTone}
        />

        <MarketIndexSection
          vnIndex={vnIndex}
          formatCompactPrice={formatCompactPrice}
          formatChange={formatChange}
          formatPct={formatPct}
          getChangeColor={getChangeColor}
        />

        <AllocationSection allocations={allocations} />

        {message ? (
          <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyle}>
            <div className="ab-error">{message}</div>
          </section>
        ) : null}

        <PositionsSection loading={loading} hasPositions={positions.length > 0} positions={positionViews} />

        <TradeFormSection
          kicker="Giao dịch"
          title={editingTradeId && buyOpen ? 'Sửa lệnh mua' : 'Thêm lệnh mua'}
          isOpen={buyOpen}
          onToggle={() => setBuyOpen((v) => !v)}
          form={buyForm}
          onChange={setBuyForm}
          onSubmit={handleBuySubmit}
          submitLabel={editingTradeId ? 'Lưu lệnh mua' : 'Thêm lệnh mua'}
          onCancel={editingTradeId ? () => {
            setEditingTradeId(null);
            setBuyForm(DEFAULT_BUY_FORM);
            setBuyOpen(false);
          } : undefined}
        />

        <TradeFormSection
          kicker="Giao dịch"
          title={editingTradeId && sellOpen ? 'Sửa lệnh bán' : 'Thêm lệnh bán'}
          isOpen={sellOpen}
          onToggle={() => setSellOpen((v) => !v)}
          form={sellForm}
          onChange={setSellForm}
          onSubmit={handleSellSubmit}
          submitLabel={editingTradeId ? 'Lưu lệnh bán' : 'Thêm lệnh bán'}
          onCancel={editingTradeId ? () => {
            setEditingTradeId(null);
            setSellForm(DEFAULT_SELL_FORM);
            setSellOpen(false);
          } : undefined}
        />

        <HistorySection
          isOpen={historyOpen}
          onToggle={() => setHistoryOpen((v) => !v)}
          historyFilter={historyFilter}
          onHistoryFilterChange={setHistoryFilter}
          historySymbol={historySymbol}
          onHistorySymbolChange={setHistorySymbol}
          historyRows={historyRows}
          getTransactionLabel={getTransactionLabel}
          formatTradeDate={formatTradeDate}
          editTrade={editTrade}
          editCash={editCash}
          deleteTrade={deleteTrade}
          deleteCash={deleteCash}
        />

        <CashSection
          isOpen={cashOpen}
          onToggle={() => setCashOpen((v) => !v)}
          cashMode={cashMode}
          onCashModeChange={setCashMode}
          cashForm={cashForm}
          onCashFormChange={setCashForm}
          onCashSubmit={handleCashSubmit}
          editingCash={!!editingCashId}
          onCancelCashEdit={editingCashId ? () => {
            setEditingCashId(null);
            setCashForm(DEFAULT_CASH_FORM);
          } : undefined}
          adjustmentSign={adjustmentSign}
          onAdjustmentSignChange={setAdjustmentSign}
          adjustmentAmountInput={adjustmentAmountInput}
          onAdjustmentAmountChange={setAdjustmentAmountInput}
          cashCalculated={cashSummary.calculatedCash}
          cashAdjustment={cashSummary.cashAdjustment}
          onSaveAdjustment={handleSaveCashAdjustment}
          savingAdjustment={savingAdjustment}
        />

        <TelegramSection
          isOpen={telegramOpen}
          onToggle={() => setTelegramOpen((v) => !v)}
          telegram={telegram}
          onTelegramChange={setTelegram}
          onSave={handleSaveTelegram}
          telegramSaving={telegramSaving}
          onTest={handleTelegramTest}
          telegramTesting={telegramTesting}
          telegramLoading={telegramLoading}
          telegramMessage={telegramMessage}
          clampHour={clampHour}
        />
      </div>
    </main>
  );
}
