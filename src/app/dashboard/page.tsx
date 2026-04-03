'use client';

import { ArrowDownRight, ArrowUpRight, PieChart, Send, TrendingUp, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppShellHeader from '@/components/app-shell-header';
import { calcHolding, calcSummary, formatCurrency, Holding, PriceMap } from '@/lib/calculations';

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

// Việt Nam UTC+7, không DST
function vnHourToUtc(vnHour: number) {
  return (clampHour(vnHour) - 7 + 24) % 24;
}

function utcHourToVn(utcHour: number) {
  return (clampHour(utcHour) + 7) % 24;
}

export default function DashboardPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [quotes, setQuotes] = useState<QuoteDebugItem[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    symbol: '',
    buy_price: '',
    quantity: '',
    buy_date: '',
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

  const loadHoldings = useCallback(async () => {
    setLoading(true);
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      window.location.href = '/';
      return;
    }

    setEmail(authData.user.email || '');

    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .order('symbol', { ascending: true });

    if (error) {
      setHoldings([]);
      setMessage('Không tải được dữ liệu');
    } else {
      setHoldings((data || []) as Holding[]);
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

  useEffect(() => {
    loadHoldings();
    loadTelegramSettings();
  }, [loadHoldings, loadTelegramSettings]);

  useEffect(() => {
    if (holdings.length > 0) loadPrices(holdings);
    else {
      setPrices({});
      setQuotes([]);
    }
  }, [holdings, loadPrices]);

  const summary = useMemo(() => calcSummary(holdings, prices), [holdings, prices]);
  const summaryPct = summary.totalBuy > 0 ? (summary.totalPnl / summary.totalBuy) * 100 : 0;
  const quoteMap = useMemo(() => getQuoteMap(quotes), [quotes]);

  const dayPnl = useMemo(
    () =>
      holdings.reduce((sum, holding) => {
        const quote = quoteMap.get(holding.symbol.toUpperCase());
        const change = Number(quote?.change || 0);
        return sum + change * Number(holding.quantity || 0);
      }, 0),
    [holdings, quoteMap]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      window.location.href = '/';
      return;
    }

    const symbol = form.symbol.trim().toUpperCase();
    const buyPrice = Number(form.buy_price);
    const quantity = Number(form.quantity);

    if (!symbol || !buyPrice || !quantity) {
      setMessage('Nhập đủ mã, giá mua, số lượng');
      return;
    }

    const { error } = await supabase.from('holdings').insert({
      user_id: authData.user.id,
      symbol,
      buy_price: buyPrice,
      quantity,
      buy_date: form.buy_date || null,
      note: form.note.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setForm({
      symbol: '',
      buy_price: '',
      quantity: '',
      buy_date: '',
      note: '',
    });

    await loadHoldings();
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
        setTelegramMessage(payload?.error || 'Không gửi được tin test');
      } else {
        setTelegramMessage('Đã gửi tin test tới Telegram');
      }
    } catch {
      setTelegramMessage('Không gửi được tin test');
    } finally {
      setTelegramTesting(false);
    }
  }

  async function handleDelete(id: string, symbol: string) {
    if (!window.confirm('Xóa ' + symbol + '?')) return;

    const { error } = await supabase.from('holdings').delete().eq('id', id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadHoldings();
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
                  <span className="ab-soft-label">NAV</span>
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
                  <span className="ab-soft-label">Lãi/lỗ danh mục</span>
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

        <section className="ab-premium-card ab-form-shell compact">
          <div className="ab-row-between align-center compact-form-head">
            <div>
              <div className="ab-card-kicker">Thêm vị thế</div>
            </div>
            <button type="button" className="ab-btn ab-btn-subtle" onClick={loadHoldings}>
              {refreshing ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="ab-form-grid compact-form-grid">
            <input
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
              placeholder="Mã"
              required
              className="ab-input"
            />
            <input
              value={form.buy_price}
              onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
              type="number"
              placeholder="Giá mua"
              required
              className="ab-input"
            />
            <input
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              type="number"
              placeholder="Số lượng"
              required
              className="ab-input"
            />
            <input
              value={form.buy_date}
              onChange={(e) => setForm({ ...form, buy_date: e.target.value })}
              type="date"
              className="ab-input"
            />
            <button type="submit" className="ab-btn ab-btn-primary">
              Thêm mã
            </button>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Ghi chú"
              className="ab-input ab-full"
            />
          </form>

          {message ? <div className="ab-error">{message}</div> : null}
        </section>

        <section className="ab-premium-card ab-form-shell compact">
          <div className="ab-row-between align-center compact-form-head">
            <div>
              <div className="ab-card-kicker">Telegram</div>
              <div className="ab-soft-label">1 bot chung · mỗi user một chat ID riêng</div>
            </div>

            <button
              type="button"
              className="ab-btn ab-btn-subtle"
              onClick={handleTelegramTest}
              disabled={telegramTesting || telegramLoading}
            >
              <Send size={14} />
              {telegramTesting ? 'Đang gửi...' : 'Gửi test'}
            </button>
          </div>

          <form onSubmit={handleSaveTelegram} className="ab-form-grid compact-form-grid">
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
              Nhập theo giờ Việt Nam. Hệ thống sẽ tự đổi sang UTC khi lưu.
              Mặc định <strong>15</strong> = sau 15:00 Việt Nam.
            </div>

            <button type="submit" className="ab-btn ab-btn-primary">
              {telegramSaving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </form>

          <div className="ab-note">
            Cách lấy chat_id: mở bot Telegram, bấm <strong>/start</strong>, rồi lấy
            chat_id từ <strong>getUpdates</strong>.
          </div>

          {telegramMessage ? <div className="ab-error">{telegramMessage}</div> : null}
        </section>

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
        ) : holdings.length === 0 ? (
          <section className="ab-premium-card">Chưa có mã nào</section>
        ) : (
          <section className="ab-position-grid">
            {holdings.map((holding) => {
              const row = calcHolding(holding, prices);
              const quote = quoteMap.get(holding.symbol.toUpperCase());
              const positive = row.pnl >= 0;

              return (
                <article key={holding.id} className="ab-premium-card ab-position-card">
                  <div className="ab-row-between align-start">
                    <div>
                      <div className="ab-symbol premium">{holding.symbol}</div>
                    </div>
                    <button
                      type="button"
                      className="ab-delete ghost"
                      onClick={() => handleDelete(holding.id, holding.symbol)}
                    >
                      Xóa
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
                      <span>SL</span>
                      <strong>{holding.quantity}</strong>
                    </div>
                    <div className="ab-stat-chip">
                      <span>Giá mua</span>
                      <strong>{formatCurrency(Number(holding.buy_price))}</strong>
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
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
