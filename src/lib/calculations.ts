export type Holding = {
  id: string;
  user_id: string;
  symbol: string;
  buy_price: number;
  quantity: number;
  buy_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type PriceMap = Record<string, number>;

export function calcHolding(holding: Holding, prices: PriceMap) {
  const currentPrice = Number(prices[holding.symbol.toUpperCase()] || 0);
  const totalBuy = Number(holding.buy_price) * Number(holding.quantity);
  const totalNow = currentPrice * Number(holding.quantity);
  const pnl = totalNow - totalBuy;
  const pnlPct = totalBuy > 0 ? (pnl / totalBuy) * 100 : 0;

  return { currentPrice, totalBuy, totalNow, pnl, pnlPct };
}

export function calcSummary(holdings: Holding[], prices: PriceMap) {
  return holdings.reduce(
    (acc, holding) => {
      const row = calcHolding(holding, prices);
      acc.totalBuy += row.totalBuy;
      acc.totalNow += row.totalNow;
      acc.totalPnl += row.pnl;
      return acc;
    },
    { totalBuy: 0, totalNow: 0, totalPnl: 0 }
  );
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDateTime(value?: string) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}
