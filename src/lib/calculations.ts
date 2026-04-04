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

export type PositionGroup = {
  symbol: string;
  holdings: Holding[];
  quantity: number;
  avgBuyPrice: number;
  totalBuy: number;
  note: string | null;
  latestBuyDate: string | null;
};

export function calcHolding(holding: Holding, prices: PriceMap) {
  const currentPrice = Number(prices[holding.symbol.toUpperCase()] || 0);
  const totalBuy = Number(holding.buy_price) * Number(holding.quantity);
  const totalNow = currentPrice * Number(holding.quantity);
  const pnl = totalNow - totalBuy;
  const pnlPct = totalBuy > 0 ? (pnl / totalBuy) * 100 : 0;

  return { currentPrice, totalBuy, totalNow, pnl, pnlPct };
}

export function groupHoldingsBySymbol(holdings: Holding[]): PositionGroup[] {
  const grouped = new Map<string, Holding[]>();

  for (const holding of holdings) {
    const symbol = String(holding.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    const list = grouped.get(symbol) || [];
    list.push({ ...holding, symbol });
    grouped.set(symbol, list);
  }

  return [...grouped.entries()]
    .map(([symbol, items]) => {
      const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const totalBuy = items.reduce(
        (sum, item) => sum + Number(item.buy_price || 0) * Number(item.quantity || 0),
        0
      );
      const avgBuyPrice = quantity > 0 ? totalBuy / quantity : 0;

      const latestBuyDate =
        [...items]
          .map((item) => item.buy_date)
          .filter(Boolean)
          .sort()
          .at(-1) || null;

      const note =
        items
          .map((item) => item.note?.trim())
          .filter(Boolean)
          .at(-1) || null;

      return {
        symbol,
        holdings: items.sort((a, b) => {
          const aTime = a.buy_date ? new Date(a.buy_date).getTime() : 0;
          const bTime = b.buy_date ? new Date(b.buy_date).getTime() : 0;
          return bTime - aTime;
        }),
        quantity,
        avgBuyPrice,
        totalBuy,
        note,
        latestBuyDate,
      };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol, 'vi', { numeric: true }));
}

export function calcPosition(position: PositionGroup, prices: PriceMap) {
  const currentPrice = Number(prices[position.symbol.toUpperCase()] || 0);
  const totalNow = currentPrice * Number(position.quantity || 0);
  const pnl = totalNow - Number(position.totalBuy || 0);
  const pnlPct = position.totalBuy > 0 ? (pnl / position.totalBuy) * 100 : 0;

  return {
    currentPrice,
    totalBuy: position.totalBuy,
    totalNow,
    pnl,
    pnlPct,
  };
}

export function calcSummary(holdings: Holding[], prices: PriceMap) {
  const positions = groupHoldingsBySymbol(holdings);

  return positions.reduce(
    (acc, position) => {
      const row = calcPosition(position, prices);
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
