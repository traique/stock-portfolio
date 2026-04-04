import { calcHolding, calcSummary, Holding, PriceMap } from '@/lib/calculations';

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
  holdings: Holding[],
  prices: PriceMap,
  quotes: QuoteDebugItem[],
  vnIndex?: QuoteDebugItem | null
) {
  const summary = calcSummary(holdings, prices);
  const pnlPct = summary.totalBuy > 0 ? (summary.totalPnl / summary.totalBuy) * 100 : 0;

  const quoteMap = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));

  const rows = holdings
    .map((holding) => {
      const row = calcHolding(holding, prices);
      const quote = quoteMap.get(holding.symbol.toUpperCase());

      return {
        symbol: holding.symbol,
        quantity: Number(holding.quantity || 0),
        price: Number(quote?.price || row.currentPrice || 0),
        dayPct: Number(quote?.pct || 0),
        pnl: Number(row.pnl || 0),
        pnlPct: Number(row.pnlPct || 0),
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true }));

  const lines = [
    `📊 <b>LCTA · Tổng kết cuối ngày</b>`,
    ``,
    `👤 ${email.split('@')[0]}`,
    `Tổng số mã: <b>${rows.length}</b>`,
    `Tổng vốn: <b>${formatVnd(summary.totalBuy)}</b>`,
    `NAV: <b>${formatVnd(summary.totalNow)}</b>`,
    `Lãi/Lỗ: <b>${summary.totalPnl >= 0 ? '+' : ''}${formatVnd(summary.totalPnl)}</b> (${formatPct(pnlPct)})`,
  ];

  if (vnIndex && Number.isFinite(vnIndex.price)) {
    lines.push(
      `VN-Index: <b>${formatPrice(vnIndex.price)}</b> (${formatPct(vnIndex.pct)})`
    );
  }

  if (rows.length) {
    lines.push('', `Chi tiết danh mục:`);
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

export function buildThresholdAlert(
  email: string,
  quote: QuoteDebugItem,
  holding: Holding,
  prices: PriceMap
) {
  const row = calcHolding(holding, prices);

  return [
    `🚨 <b>LCTA · Cảnh báo biến động</b>`,
    ``,
    `👤 ${email.split('@')[0]}`,
    `Mã: <b>${holding.symbol}</b>`,
    `Giá hiện tại: <b>${formatPrice(quote.price)}</b>`,
    `Biến động ngày: <b>${formatPct(quote.pct)}</b>`,
    `Lãi/Lỗ vị thế: <b>${row.pnl >= 0 ? '+' : ''}${formatVnd(row.pnl)}</b>`,
    `Hiệu suất vị thế: <b>${formatPct(row.pnlPct)}</b>`,
    `🕒 Cập nhật: <b>${formatUpdatedTime()}</b>`,
  ].join('\n');
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

export function pickThresholdHit(
  holdings: Holding[],
  quotes: QuoteDebugItem[],
  thresholdPct: number
) {
  const quoteMap = new Map(quotes.map((q) => [q.symbol.toUpperCase(), q]));

  const hits = holdings
    .map((holding) => {
      const quote = quoteMap.get(holding.symbol.toUpperCase());
      if (!quote) return null;
      if (Math.abs(quote.pct) < thresholdPct) return null;
      return { holding, quote };
    })
    .filter(Boolean) as Array<{ holding: Holding; quote: QuoteDebugItem }>;

  hits.sort((a, b) => Math.abs(b.quote.pct) - Math.abs(a.quote.pct));
  return hits[0] || null;
}
