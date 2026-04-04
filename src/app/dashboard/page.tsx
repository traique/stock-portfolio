'use client';

import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  PieChart,
  Send,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';
import {
  calcPosition,
  calcRealizedSummary,
  calcSummary,
  formatCurrency,
  groupHoldingsBySymbol,
  Holding,
  PriceMap,
  Transaction,
} from '@/lib/calculations';

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
};

type TelegramSettings = {
  chat_id: string;
  is_enabled: boolean;
  notify_daily: boolean;
  daily_hour_vn: number;
};

const DEFAULT_TELEGRAM: TelegramSettings = {
  chat_id: '',
  is_enabled: false,
  notify_daily: true,
  daily_hour_vn: 15,
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
  return (
    sign +
    new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  );
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

function SummarySkeleton() {
  return (
    <article className="ab-premium-card ab-stat-premium">
      <div className="ab-skeleton skeleton-line short" />
      <div className="ab-skeleton skeleton-price medium" />
    </article>
  );
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

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [quotes, setQuotes] = useState<QuoteDebugItem[]>([]);
  const [vnIndex, setVnIndex] = useState<QuoteDebugItem | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const [buyOpen, setBuyOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [expandedSymbols, setExpandedSymbols] = useState<Record<string, boolean>>({});

  const [buyForm, setBuyForm] = useState({
    symbol: '',
    buy_price: '',
    quantity: '',
    buy_date: '',
    note: '',
  });

  const [sellForm, setSellForm] = useState({
    symbol: '',
    sell_price: '',
    quantity: '',
    trade_date: '',
    note: '',
  });

  const [telegram, setTelegram] = useState<TelegramSettings>(DEFAULT_TELEGRAM);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState('');

  const loadTelegramSettings = useCallback(async () => {
    setTelegramLoading(true);
    setTelegramMessage('');

    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch('/api/telegram/settings', {
        headers: { Authorization: `Bearer ${token}` },
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
  }, []);

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      window.location.href = '/';
      return;
    }

    setEmail(authData.user.email || '');

    const [holdingsRes, transactionsRes] = await Promise.all([
      supabase.from('holdings').select('*').order('symbol', { ascending: true }),
      supabase
        .from('transactions')
        .select('*')
        .order('trade_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
    ]);

    if (holdingsRes.error) {
      setHoldings([]);
      setMessage('Không tải được dữ liệu holdings');
    } else {
      setHoldings((holdingsRes.data || []) as Holding[]);
    }

    if (transactionsRes.error) {
      setTransactions([]);
    } else {
      setTransactions((transactionsRes.data || []) as Transaction[]);
    }

    setLoading(false);
  }, []);

  const loadPrices = useCallback(async (items: Holding[]) => {
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
        '/api/prices?symbols=' + encodeURIComponent(symbols.join(',')),
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
          (data.debug || []).sort((a, b) =>
            a.symbol.localeCompare(b.symbol, 'vi', { numeric: true })
          )
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
      const response = await fetch('/api/prices?symbols=VNINDEX', { cache: 'no-store' });
      const data: PricesResponse = await response.json();
      const item = data?.debug?.[0];
      setVnIndex(item && Number(item.price) > 0 ? item : null);
    } catch {
      setVnIndex(null);
    }
  }, []);

  useEffect(() => {
    loadPortfolio();
    loadTelegramSettings();
    loadVnIndex();
  }, [loadPortfolio, loadTelegramSettings, loadVnIndex]);

  useEffect(() => {
    if (holdings.length > 0) {
      loadPrices(holdings);
    } else {
      setPrices({});
      setQuotes([]);
    }
  }, [holdings, loadPrices]);

  const positions = useMemo(() => groupHoldingsBySymbol(holdings), [holdings]);
  const summary = useMemo(() => calcSummary(holdings, prices), [holdings, prices]);
  const realizedSummary = useMemo(() => calcRealizedSummary(transactions), [transactions]);
  const summaryPct = summary.totalBuy > 0 ? (summary.totalPnl / summary.totalBuy) * 100 : 0;
  const quoteMap = useMemo(() => getQuoteMap(quotes), [quotes]);

  const dayPnl = useMemo(
    () =>
      positions.reduce((sum, position) => {
        const quote = quoteMap.get(position.symbol.toUpperCase());
        const change = Number(quote?.change || 0);
        return sum + change * Number(position.quantity || 0);
      }, 0),
    [positions, quoteMap]
  );

  const allocations = useMemo(() => {
    const totalNow = summary.totalNow || 0;
    return positions
      .map((position) => {
        const row = calcPosition(position, prices);
        const percent = totalNow > 0 ? (row.totalNow / totalNow) * 100 : 0;
        return { symbol: position.symbol, totalNow: row.totalNow, percent };
      })
      .sort((a, b) => b.totalNow - a.totalNow);
  }, [positions, prices, summary.totalNow]);

  async function handleBuySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      window.location.href = '/';
      return;
    }

    const symbol = buyForm.symbol.trim().toUpperCase();
    const buyPrice = Number(buyForm.buy_price);
    const quantity = Number(buyForm.quantity);

    if (!symbol || !buyPrice || !quantity) {
      setMessage('Nhập đủ mã, giá mua, số lượng');
      return;
    }

    const [holdingRes, transactionRes] = await Promise.all([
      supabase.from('holdings').insert({
        user_id: authData.user.id,
        symbol,
        buy_price: buyPrice,
        quantity,
        buy_date: buyForm.buy_date || null,
        note: buyForm.note.trim() || null,
      }),
      supabase.from('transactions').insert({
        user_id: authData.user.id,
        symbol,
        transaction_type: 'BUY',
        price: buyPrice,
        quantity,
        trade_date: buyForm.buy_date || null,
        note: buyForm.note.trim() || null,
      }),
    ]);

    if (holdingRes.error || transactionRes.error) {
      setMessage(holdingRes.error?.message || transactionRes.error?.message || 'Không lưu được lệnh mua');
      return;
    }

    setBuyForm({
      symbol: '',
      buy_price: '',
      quantity: '',
      buy_date: '',
      note: '',
    });
    setBuyOpen(false);
    await loadPortfolio();
  }

  async function handleSellSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      window.location.href = '/';
      return;
    }

    const symbol = sellForm.symbol.trim().toUpperCase();
    const sellPrice = Number(sellForm.sell_price);
    const sellQuantity = Number(sellForm.quantity);

    if (!symbol || !sellPrice || !sellQuantity) {
      setMessage('Nhập đủ mã, giá bán, số lượng');
      return;
    }

    const lots = holdings
      .filter((item) => item.symbol.toUpperCase() === symbol)
      .sort((a, b) => {
        const aTime = a.buy_date ? new Date(a.buy_date).getTime() : 0;
        const bTime = b.buy_date ? new Date(b.buy_date).getTime() : 0;
        return aTime - bTime;
      });

    const availableQty = lots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);

    if (availableQty < sellQuantity) {
      setMessage(`Số lượng bán vượt quá đang nắm giữ. Hiện có ${availableQty}`);
      return;
    }

    let remaining = sellQuantity;
    let costBasis = 0;

    for (const lot of lots) {
      if (remaining <= 0) break;

      const lotQty = Number(lot.quantity || 0);
      const consumeQty = Math.min(lotQty, remaining);
      costBasis += consumeQty * Number(lot.buy_price || 0);

      if (consumeQty === lotQty) {
        const { error } = await supabase.from('holdings').delete().eq('id', lot.id);
        if (error) {
          setMessage(error.message);
          return;
        }
      } else {
        const { error } = await supabase
          .from('holdings')
          .update({ quantity: lotQty - consumeQty })
          .eq('id', lot.id);
        if (error) {
          setMessage(error.message);
          return;
        }
      }

      remaining -= consumeQty;
    }

    const avgCost = sellQuantity > 0 ? costBasis / sellQuantity : 0;
    const realizedPnl = sellQuantity * sellPrice - costBasis;

    const { error: transactionError } = await supabase.from('transactions').insert({
      user_id: authData.user.id,
      symbol,
      transaction_type: 'SELL',
      price: sellPrice,
      quantity: sellQuantity,
      trade_date: sellForm.trade_date || null,
      note: sellForm.note.trim() || null,
      avg_cost: avgCost,
      realized_pnl: realizedPnl,
    });

    if (transactionError) {
      setMessage(transactionError.message);
      return;
    }

    setSellForm({
      symbol: '',
      sell_price: '',
      quantity: '',
      trade_date: '',
      note: '',
    });
    setSellOpen(false);
    await loadPortfolio();
  }

  async function handleSaveTelegram(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTelegramSaving(true);
    setTelegramMessage('');

    try {
      const token = await getAccessToken();

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

      if (!response.ok) {
        setTelegramMessage(payload?.error || 'Không lưu được cấu hình');
      } else {
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
      const token = await getAccessToken();

      const response = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await response.json();

      if (!response.ok) {
        setTelegramMessage(payload?.error || 'Không gửi được báo cáo');
      } else {
        setTelegramMessage('Đã gửi báo cáo tới Telegram');
      }
    } catch {
      setTelegramMessage('Không gửi được báo cáo');
    } finally {
      setTelegramTesting(false);
    }
  }

  async function handleDeleteLot(id: string, symbol: string) {
    if (!window.confirm('Xóa lệnh mua của ' + symbol + '?')) return;

    const { error } = await supabase.from('holdings').delete().eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPortfolio();
  }

  function toggleSymbol(symbol: string) {
    setExpandedSymbols((prev) => ({ ...prev, [symbol]: !prev[symbol] }));
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

        <section className="ab-summary-grid premium-summary-grid compact-top-grid">
          {loading ? (
            <>
              <SummarySkeleton />
              <SummarySkeleton />
              <SummarySkeleton />
              <SummarySkeleton />
            </>
          ) : (
            <>
              <article className="ab-premium-card ab-stat-premium neutral">
                <div className="ab-stat-head">
                  <Wallet size={16} />
                  <span className="ab-soft-label">Tổng vốn</span>
                </div>
                <div className="ab-big-number dark">{formatCurrency(summary.totalBuy)}</div>
              </article>

              <article className="ab-premium-card ab-stat-premium neutral">
                <div className="ab-stat-head">
                  <PieChart size={16} />
                  <span className="ab-soft-label">Tổng giá trị</span>
                </div>
                <div className="ab-big-number dark">{formatCurrency(summary.totalNow)}</div>
              </article>

              <article className={`ab-premium-card ab-stat-premium ${statTone(dayPnl)}`}>
                <div className="ab-stat-head">
                  {dayPnl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  <span className="ab-soft-label">Lãi/lỗ ngày</span>
                </div>
                <div className="ab-big-number" style={{ color: getChangeColor(dayPnl) }}>
                  {formatCurrency(dayPnl)}
                </div>
              </article>

              <article className={`ab-premium-card ab-stat-premium ${statTone(summary.totalPnl)}`}>
                <div className="ab-stat-head">
                  <TrendingUp size={16} />
                  <span className="ab-soft-label">Lãi/lỗ tạm tính</span>
                </div>
                <div className="ab-big-number" style={{ color: getChangeColor(summary.totalPnl) }}>
                  {formatCurrency(summary.totalPnl)}
                </div>
                <div className="ab-stat-sub" style={{ color: getChangeColor(summary.totalPnl) }}>
                  {summaryPct >= 0 ? '+' : ''}
                  {summaryPct.toFixed(2)}%
                </div>
              </article>
            </>
          )}
        </section>

        {!loading ? (
          <section className="ab-summary-grid premium-summary-grid compact-top-grid">
            <article className={`ab-premium-card ab-stat-premium ${statTone(realizedSummary.totalRealizedPnl)}`}>
              <div className="ab-stat-head">
                <TrendingUp size={16} />
                <span className="ab-soft-label">Lãi/lỗ đã chốt</span>
              </div>
              <div
                className="ab-big-number"
                style={{ color: getChangeColor(realizedSummary.totalRealizedPnl) }}
              >
                {formatCurrency(realizedSummary.totalRealizedPnl)}
              </div>
              <div
                className="ab-stat-sub"
                style={{ color: getChangeColor(realizedSummary.totalRealizedPnl) }}
              >
                {realizedSummary.totalSellOrders} lệnh bán
              </div>
            </article>
          </section>
        ) : null}

        {vnIndex ? (
          <section className="ab-premium-card ab-form-shell compact">
            <div className="ab-row-between align-center">
              <div>
                <div className="ab-card-kicker">VN-Index</div>
                <div className="ab-card-headline small">{formatCompactPrice(vnIndex.price)}</div>
              </div>
              <div
                className="ab-soft-change under-price"
                style={{ color: getChangeColor(vnIndex.change) }}
              >
                {formatChange(vnIndex.change)} · {formatPct(vnIndex.pct)}
              </div>
            </div>
          </section>
        ) : null}

        {!loading && allocations.length ? (
          <section className="ab-premium-card ab-form-shell compact">
            <div className="ab-card-kicker">Cơ cấu danh mục</div>
            <div className="ab-mini-list" style={{ marginTop: 12 }}>
              {allocations.map((item) => (
                <div key={item.symbol} style={{ display: 'grid', gap: 8 }}>
                  <div className="ab-row-between align-center">
                    <div className="ab-mini-symbol">{item.symbol}</div>
                    <div className="ab-mini-price">
                      {formatCurrency(item.totalNow)} · {item.percent.toFixed(1)}%
                    </div>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: 10,
                      borderRadius: 999,
                      background: 'rgba(148,163,184,0.16)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(item.percent, 2)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: 'linear-gradient(90deg, rgba(37,99,235,0.95), rgba(59,130,246,0.75))',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {message ? (
          <section className="ab-premium-card ab-form-shell compact">
            <div className="ab-error">{message}</div>
          </section>
        ) : null}

        {loading ? (
          <section className="ab-position-grid">
            <article className="ab-premium-card ab-position-card ab-skeleton-card">
              <div className="ab-skeleton skeleton-title" />
              <div className="ab-skeleton skeleton-price" />
              <div className="ab-skeleton skeleton-line" />
              <div className="ab-skeleton skeleton-line short" />
            </article>
            <article className="ab-premium-card ab-position-card ab-skeleton-card">
              <div className="ab-skeleton skeleton-title" />
              <div className="ab-skeleton skeleton-price" />
              <div className="ab-skeleton skeleton-line" />
              <div className="ab-skeleton skeleton-line short" />
            </article>
          </section>
        ) : positions.length === 0 ? (
          <section className="ab-premium-card ab-form-shell compact">
            <div className="ab-note">Chưa có vị thế nào trong danh mục</div>
          </section>
        ) : (
          <section className="ab-position-grid">
            {positions.map((position) => {
              const row = calcPosition(position, prices);
              const quote = quoteMap.get(position.symbol.toUpperCase());
              const positive = row.pnl >= 0;
              const isExpanded = !!expandedSymbols[position.symbol];

              return (
                <article key={position.symbol} className="ab-premium-card ab-position-card">
                  <div className="ab-row-between align-start">
                    <div>
                      <div className="ab-symbol premium">{position.symbol}</div>
                      <div className="ab-soft-label mini-top">
                        {position.holdings.length} lệnh mua · SL {position.quantity}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="ab-delete ghost"
                      onClick={() => toggleSymbol(position.symbol)}
                    >
                      {isExpanded ? 'Ẩn lệnh' : 'Xem lệnh'}
                    </button>
                  </div>

                  <div className="ab-price premium">
                    {formatCompactPrice(quote?.price ?? row.currentPrice)}
                  </div>

                  <div
                    className="ab-soft-change under-price"
                    style={{ color: getChangeColor(quote?.change) }}
                  >
                    {formatChange(quote?.change)} · {formatPct(quote?.pct)}
                  </div>

                  <div className="ab-position-stats">
                    <div className="ab-stat-chip">
                      <span>SL tổng</span>
                      <strong>{position.quantity}</strong>
                    </div>
                    <div className="ab-stat-chip">
                      <span>Giá vốn TB</span>
                      <strong>{formatCurrency(position.avgBuyPrice)}</strong>
                    </div>
                  </div>

                  <div className="ab-mini-grid premium">
                    <div className="ab-mini-card premium">
                      <div className="ab-soft-label">Tổng mua</div>
                      <div className="ab-mini-value">{formatCurrency(row.totalBuy)}</div>
                    </div>
                    <div className="ab-mini-card premium">
                      <div className="ab-soft-label">Hiện tại</div>
                      <div className="ab-mini-value">{formatCurrency(row.totalNow)}</div>
                    </div>
                  </div>

                  <div className={`ab-profit-pill ${positive ? 'up' : 'down'}`}>
                    <span>Lãi / Lỗ</span>
                    <strong>{formatCurrency(row.pnl)}</strong>
                  </div>

                  <div
                    className="ab-performance premium"
                    style={{
                      background: positive
                        ? 'rgba(34,197,94,0.10)'
                        : 'rgba(239,68,68,0.10)',
                      borderColor: positive
                        ? 'rgba(34,197,94,0.18)'
                        : 'rgba(239,68,68,0.18)',
                      color: positive ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    <span>Hiệu suất vị thế</span>
                    <strong>
                      {row.pnlPct >= 0 ? '+' : ''}
                      {row.pnlPct.toFixed(2)}%
                    </strong>
                  </div>

                  {isExpanded ? (
                    <div className="ab-mini-list" style={{ marginTop: 14 }}>
                      {position.holdings.map((holding) => (
                        <div key={holding.id} className="ab-mini-row">
                          <div>
                            <div className="ab-mini-symbol">
                              {formatTradeDate(holding.buy_date)} · SL {holding.quantity}
                            </div>
                            <div className="ab-mini-price">
                              Giá mua {formatCurrency(Number(holding.buy_price))}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="ab-delete ghost"
                            onClick={() => handleDeleteLot(holding.id, holding.symbol)}
                          >
                            Xóa
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}

        <section className="ab-premium-card ab-form-shell compact">
          <button
            type="button"
            className="ab-section-toggle"
            onClick={() => setBuyOpen((v) => !v)}
          >
            <div className="ab-section-toggle-copy">
              <div className="ab-card-kicker">Danh mục</div>
              <div className="ab-section-toggle-title">Thêm lệnh mua</div>
            </div>
            <div className="ab-section-toggle-icon">
              {buyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {buyOpen ? (
            <form onSubmit={handleBuySubmit} className="ab-form-grid compact-form-grid mt-16">
              <input
                value={buyForm.symbol}
                onChange={(e) => setBuyForm({ ...buyForm, symbol: e.target.value })}
                placeholder="Mã"
                required
                className="ab-input"
              />
              <input
                value={buyForm.buy_price}
                onChange={(e) => setBuyForm({ ...buyForm, buy_price: e.target.value })}
                type="number"
                placeholder="Giá mua"
                required
                className="ab-input"
              />
              <input
                value={buyForm.quantity}
                onChange={(e) => setBuyForm({ ...buyForm, quantity: e.target.value })}
                type="number"
                placeholder="Số lượng"
                required
                className="ab-input"
              />
              <input
                value={buyForm.buy_date}
                onChange={(e) => setBuyForm({ ...buyForm, buy_date: e.target.value })}
                type="date"
                className="ab-input"
              />
              <input
                value={buyForm.note}
                onChange={(e) => setBuyForm({ ...buyForm, note: e.target.value })}
                placeholder="Ghi chú"
                className="ab-input ab-full"
              />
              <button type="submit" className="ab-btn ab-btn-primary">
                Thêm lệnh mua
              </button>
            </form>
          ) : null}
        </section>

        <section className="ab-premium-card ab-form-shell compact">
          <button
            type="button"
            className="ab-section-toggle"
            onClick={() => setSellOpen((v) => !v)}
          >
            <div className="ab-section-toggle-copy">
              <div className="ab-card-kicker">Danh mục</div>
              <div className="ab-section-toggle-title">Thêm lệnh bán</div>
            </div>
            <div className="ab-section-toggle-icon">
              {sellOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {sellOpen ? (
            <form onSubmit={handleSellSubmit} className="ab-form-grid compact-form-grid mt-16">
              <input
                value={sellForm.symbol}
                onChange={(e) => setSellForm({ ...sellForm, symbol: e.target.value })}
                placeholder="Mã"
                required
                className="ab-input"
              />
              <input
                value={sellForm.sell_price}
                onChange={(e) => setSellForm({ ...sellForm, sell_price: e.target.value })}
                type="number"
                placeholder="Giá bán"
                required
                className="ab-input"
              />
              <input
                value={sellForm.quantity}
                onChange={(e) => setSellForm({ ...sellForm, quantity: e.target.value })}
                type="number"
                placeholder="Số lượng"
                required
                className="ab-input"
              />
              <input
                value={sellForm.trade_date}
                onChange={(e) => setSellForm({ ...sellForm, trade_date: e.target.value })}
                type="date"
                className="ab-input"
              />
              <input
                value={sellForm.note}
                onChange={(e) => setSellForm({ ...sellForm, note: e.target.value })}
                placeholder="Ghi chú"
                className="ab-input ab-full"
              />
              <button type="submit" className="ab-btn ab-btn-primary">
                Thêm lệnh bán
              </button>
            </form>
          ) : null}
        </section>

        <section className="ab-premium-card ab-form-shell compact">
          <button
            type="button"
            className="ab-section-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <div className="ab-section-toggle-copy">
              <div className="ab-card-kicker">Danh mục</div>
              <div className="ab-section-toggle-title">Nhật ký giao dịch</div>
            </div>
            <div className="ab-section-toggle-icon">
              {historyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {historyOpen ? (
            <div className="ab-mini-list mt-16">
              {transactions.length ? (
                transactions.map((tx) => (
                  <div key={tx.id} className="ab-mini-row">
                    <div>
                      <div className="ab-mini-symbol">
                        {tx.transaction_type === 'BUY' ? 'Mua' : 'Bán'} · {tx.symbol} · SL {tx.quantity}
                      </div>
                      <div className="ab-mini-price">
                        {formatTradeDate(tx.trade_date)} · Giá {formatCurrency(Number(tx.price))}
                        {tx.transaction_type === 'SELL' && tx.realized_pnl !== null
                          ? ` · Đã chốt ${formatCurrency(Number(tx.realized_pnl || 0))}`
                          : ''}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="ab-note">Chưa có lịch sử giao dịch</div>
              )}
            </div>
          ) : null}
        </section>

        <section className="ab-premium-card ab-form-shell compact">
          <button
            type="button"
            className="ab-section-toggle"
            onClick={() => setTelegramOpen((v) => !v)}
          >
            <div className="ab-section-toggle-copy">
              <div className="ab-card-kicker">Telegram</div>
              <div className="ab-section-toggle-title">Báo cáo cuối ngày</div>
            </div>
            <div className="ab-section-toggle-icon">
              {telegramOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>

          {telegramOpen ? (
            <>
              <form onSubmit={handleSaveTelegram} className="ab-form-grid compact-form-grid mt-16">
                <input
                  value={telegram.chat_id}
                  onChange={(e) => setTelegram({ ...telegram, chat_id: e.target.value })}
                  placeholder="Nhập chat_id Telegram"
                  className="ab-input ab-full"
                />

                <label className="ab-toggle-row">
                  <input
                    type="checkbox"
                    checked={telegram.is_enabled}
                    onChange={(e) =>
                      setTelegram({ ...telegram, is_enabled: e.target.checked })
                    }
                  />
                  <span>Bật báo cáo Telegram</span>
                </label>

                <label className="ab-toggle-row">
                  <input
                    type="checkbox"
                    checked={telegram.notify_daily}
                    onChange={(e) =>
                      setTelegram({ ...telegram, notify_daily: e.target.checked })
                    }
                  />
                  <span>Nhận báo cáo cuối ngày</span>
                </label>

                <input
                  value={telegram.daily_hour_vn}
                  onChange={(e) =>
                    setTelegram({
                      ...telegram,
                      daily_hour_vn: clampHour(Number(e.target.value || 15)),
                    })
                  }
                  type="number"
                  min={0}
                  max={23}
                  className="ab-input"
                  placeholder="Giờ Việt Nam"
                />

                <div className="ab-note">
                  Nhập theo giờ Việt Nam. Hệ thống tự đổi sang UTC khi lưu. Mặc định{' '}
                  <strong>15</strong> = sau 15:00 Việt Nam.
                </div>

                <div className="ab-row-gap">
                  <button type="submit" className="ab-btn ab-btn-primary">
                    {telegramSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
                  </button>

                  <button
                    type="button"
                    className="ab-btn ab-btn-subtle"
                    onClick={handleTelegramTest}
                    disabled={telegramTesting || telegramLoading}
                  >
                    <Send size={14} />
                    {telegramTesting ? 'Đang gửi...' : 'Gửi báo cáo'}
                  </button>
                </div>
              </form>

              <div className="ab-note mt-12">
                Báo cáo tập trung theo <strong>vị thế gộp theo mã</strong>, dù một mã có nhiều
                lệnh mua riêng.
              </div>

              <div className="ab-note mt-12">
                Cách lấy chat_id: mở bot Telegram, bấm <strong>/start</strong>, rồi lấy
                chat_id từ <strong>getUpdates</strong>.
              </div>

              {telegramMessage ? <div className="ab-error mt-12">{telegramMessage}</div> : null}
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
            }
