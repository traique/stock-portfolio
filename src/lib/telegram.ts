import {
  calcCashSummary,
  calcPosition,
  calcRealizedSummary,
  calcSummary,
  deriveOpenHoldings,
  groupHoldingsBySymbol,
  Transaction,
  CashTransaction,
  PortfolioSettings,
  PriceMap,
} from '@/lib/calculations';

export type TelegramSettingRow = {
  user_id: string;
  chat_id: string;
  is_enabled: boolean;
  notify_daily: boolean;
  notify_threshold: boolean;
  threshold_pct: number;
  daily_hour_utc: number;
  last_daily_sent_at: string | null;
  last_alert_key: string | null;
  last_alert_sent_at: string | null;
};

export type QuoteDebugItem = {
  symbol: string;
  price: number;
  change: number;
  pct: number;
};

export function formatVnd(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPrice(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPct(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe > 0 ? '+' : safe < 0 ? '' : ''}${safe.toFixed(2)}%`;
}

function formatUpdatedTime(date = new Date()) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN');

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    cache: 'no-store',
  });

  const payload = await response.json();

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || 'Telegram send failed');
  }

  return payload;
}

export function buildDailyMessage(
  email: string,
  transactions: Transaction[],
  cashTransactions: CashTransaction[],
  portfolioSettings: PortfolioSettings | null,
  prices: PriceMap,
  quotes: QuoteDebugItem[],
  vnIndex?: QuoteDebugItem | null
) {
  const openHoldings = deriveOpenHoldings(transactions);
  const positions = groupHoldingsBySymbol(openHoldings);
  const summary = calcSummary(openHoldings, prices);
  const realized = calcRealizedSummary(transactions);
  const cash = calcCashSummary(cashTransactions, transactions, portfolioSettings);
  const quoteMap = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));

  const totalCapital = cash.netCapital;
  const actualNav = cash.actualCash;
  const marketValue = summary.totalNow;
  const totalAssets = actualNav + marketValue;
  const totalPnl = totalAssets - totalCapital;

  const dayPnl = positions.reduce((sum, position) => {
    const quote = quoteMap.get(position.symbol.toUpperCase());
    const change = Number(quote?.change || 0);
    return sum + change * Number(position.quantity || 0);
  }, 0);

  const totalPnlPct = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;

  const rows = positions
    .map((position) => {
      const row = calcPosition(position, prices);
      const quote = quoteMap.get(position.symbol.toUpperCase());

      return {
        symbol: position.symbol,
        quantity: Number(position.quantity || 0),
        price: Number(quote?.price || row.currentPrice || 0),
        dayPct: Number(quote?.pct || 0),
        pnl: Number(row.pnl || 0),
        pnlPct: Number(row.pnlPct || 0),
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true }));

  const lines = [
    `📊 <b>Tổng kết</b>`,
    ``,
    `👤 ${email.split('@')[0]}`,
    `Tổng vốn: <b>${formatVnd(totalCapital)}</b>`,
    `NAV thực tế: <b>${formatVnd(actualNav)}</b>`,
    `Giá trị thị trường: <b>${formatVnd(marketValue)}</b>`,
    `Tổng tài sản: <b>${formatVnd(totalAssets)}</b>`,
    `Tổng lãi/lỗ: <b>${totalPnl >= 0 ? '+' : ''}${formatVnd(totalPnl)}</b> (${formatPct(totalPnlPct)})`,
    `Lãi/lỗ trong ngày: <b>${dayPnl >= 0 ? '+' : ''}${formatVnd(dayPnl)}</b>`,
    `Lãi/lỗ cổ phiếu đang giữ: <b>${summary.totalPnl >= 0 ? '+' : ''}${formatVnd(summary.totalPnl)}</b>`,
    `Lãi/lỗ đã chốt: <b>${realized.totalRealizedPnl >= 0 ? '+' : ''}${formatVnd(realized.totalRealizedPnl)}</b>`,
  ];

  if (vnIndex && Number.isFinite(vnIndex.price)) {
    lines.push(`VN-Index: <b>${formatPrice(vnIndex.price)}</b> (${formatPct(vnIndex.pct)})`);
  }

  if (rows.length) {
    lines.push('', `Chi tiết vị thế:`);
    rows.forEach((row) => {
      const marker = row.pnl >= 0 ? '📈' : '📉';
      lines.push(
        `${marker} <b>${row.symbol}</b> (${row.quantity}): ${formatPrice(row.price)} (${formatPct(row.dayPct)}) · ${row.pnl >= 0 ? '+' : ''}${formatVnd(row.pnl)} (${formatPct(row.pnlPct)})`
      );
    });
  }

  lines.push('', `🕒 Cập nhật: <b>${formatUpdatedTime()}</b>`);

  return lines.join('\n');
}

export function shouldSendDaily(lastDailySentAt: string | null, now: Date, dailyHourUtc: number) {
  if (now.getUTCHours() !== dailyHourUtc) return false;
  if (!lastDailySentAt) return true;

  const last = new Date(lastDailySentAt);

  return (
    last.getUTCFullYear() !== now.getUTCFullYear() ||
    last.getUTCMonth() !== now.getUTCMonth() ||
    last.getUTCDate() !== now.getUTCDate()
  );
}
