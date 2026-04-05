export type Transaction = {
  id: string;
  user_id: string;
  symbol: string;
  transaction_type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  trade_date: string | null;
  note: string | null;
  avg_cost: number | null;
  realized_pnl: number | null;
  created_at: string;
  updated_at: string;
};

export type CashTransaction = {
  id: string;
  user_id: string;
  transaction_type: 'DEPOSIT' | 'WITHDRAW';
  amount: number;
  transaction_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type PortfolioSettings = {
  user_id: string;
  cash_adjustment: number;
  created_at?: string;
  updated_at?: string;
};

export type PriceMap = Record<string, number>;

export type OpenLot = {
  id: string;
  user_id: string;
  symbol: string;
  buy_price: number;
  quantity: number;
  buy_date: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  source_transaction_id: string;
};

export type PositionGroup = {
  symbol: string;
  holdings: OpenLot[];
  quantity: number;
  avgBuyPrice: number;
  totalBuy: number;
  note: string | null;
  latestBuyDate: string | null;
};

export type SellMeta = {
  avgCost: number;
  realizedPnl: number;
};

export type SimulationResult = {
  valid: boolean;
  error?: string;
  openLots: OpenLot[];
  sellMetaById: Record<string, SellMeta>;
};

function sortTransactions(transactions: Transaction[]) {
  return [...transactions].sort((a, b) => {
    const aDate = a.trade_date ? new Date(a.trade_date).getTime() : 0;
    const bDate = b.trade_date ? new Date(b.trade_date).getTime() : 0;
    if (aDate !== bDate) return aDate - bDate;

    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aCreated !== bCreated) return aCreated - bCreated;

    return a.id.localeCompare(b.id);
  });
}

export function simulateTransactions(transactions: Transaction[]): SimulationResult {
  const lotsBySymbol = new Map<string, OpenLot[]>();
  const balances = new Map<string, number>();
  const sellMetaById: Record<string, SellMeta> = {};

  for (const tx of sortTransactions(transactions)) {
    const symbol = String(tx.symbol || '').trim().toUpperCase();
    const qty = Number(tx.quantity || 0);
    const price = Number(tx.price || 0);

    if (!symbol || qty <= 0 || price <= 0) continue;

    if (tx.transaction_type === 'BUY') {
      const existing = lotsBySymbol.get(symbol) || [];
      existing.push({
        id: `${tx.id}:lot`,
        user_id: tx.user_id,
        symbol,
        buy_price: price,
        quantity: qty,
        buy_date: tx.trade_date || null,
        note: tx.note || null,
        created_at: tx.created_at,
        updated_at: tx.updated_at,
        source_transaction_id: tx.id,
      });
      lotsBySymbol.set(symbol, existing);
      balances.set(symbol, Number(balances.get(symbol) || 0) + qty);
      continue;
    }

    const available = Number(balances.get(symbol) || 0);
    if (available + 1e-9 < qty) {
      return {
        valid: false,
        error: `Lệnh bán ${symbol} vượt quá số lượng đang nắm giữ tại ngày ${tx.trade_date || '--'}`,
        openLots: [],
        sellMetaById: {},
      };
    }

    const lots = lotsBySymbol.get(symbol) || [];
    let remaining = qty;
    let costBasis = 0;

    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const consumeQty = Math.min(Number(lot.quantity), remaining);
      costBasis += consumeQty * Number(lot.buy_price);
      lot.quantity = Number(lot.quantity) - consumeQty;
      remaining -= consumeQty;

      if (Number(lot.quantity) <= 0.0000001) {
        lots.shift();
      }
    }

    balances.set(symbol, available - qty);
    sellMetaById[tx.id] = {
      avgCost: qty > 0 ? costBasis / qty : 0,
      realizedPnl: qty * price - costBasis,
    };
  }

  const openLots = [...lotsBySymbol.values()]
    .flat()
    .filter((lot) => Number(lot.quantity) > 0.0000001)
    .map((lot) => ({
      ...lot,
      symbol: lot.symbol.toUpperCase(),
      quantity: Number(lot.quantity),
    }));

  return { valid: true, openLots, sellMetaById };
}

export function deriveOpenHoldings(transactions: Transaction[]) {
  const result = simulateTransactions(transactions);
  return result.valid ? result.openLots : [];
}

export function enrichTransactions(transactions: Transaction[]) {
  const simulation = simulateTransactions(transactions);
  const meta = simulation.sellMetaById;

  return transactions.map((tx) => {
    if (tx.transaction_type !== 'SELL') return tx;
    const sellMeta = meta[tx.id];
    return {
      ...tx,
      avg_cost: Number(tx.avg_cost ?? sellMeta?.avgCost ?? 0),
      realized_pnl: Number(tx.realized_pnl ?? sellMeta?.realizedPnl ?? 0),
    };
  });
}

export function groupHoldingsBySymbol(holdings: OpenLot[]): PositionGroup[] {
  const grouped = new Map<string, OpenLot[]>();

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
          return aTime - bTime;
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

export function calcHolding(holding: OpenLot, prices: PriceMap) {
  const currentPrice = Number(prices[holding.symbol.toUpperCase()] || 0);
  const totalBuy = Number(holding.buy_price) * Number(holding.quantity);
  const totalNow = currentPrice * Number(holding.quantity);
  const pnl = totalNow - totalBuy;
  const pnlPct = totalBuy > 0 ? (pnl / totalBuy) * 100 : 0;

  return { currentPrice, totalBuy, totalNow, pnl, pnlPct };
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

export function calcSummary(openHoldings: OpenLot[], prices: PriceMap) {
  const positions = groupHoldingsBySymbol(openHoldings);

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

export function calcRealizedSummary(transactions: Transaction[]) {
  const enriched = enrichTransactions(transactions);

  return enriched
    .filter((tx) => tx.transaction_type === 'SELL')
    .reduce(
      (acc, tx) => {
        const realized = Number(tx.realized_pnl || 0);
        acc.totalSellOrders += 1;
        acc.totalRealizedPnl += realized;
        acc.wins += realized > 0 ? 1 : 0;
        acc.losses += realized < 0 ? 1 : 0;
        return acc;
      },
      { totalSellOrders: 0, totalRealizedPnl: 0, wins: 0, losses: 0 }
    );
}

export function calcCashSummary(
  cashTransactions: CashTransaction[],
  transactions: Transaction[],
  portfolioSettings?: PortfolioSettings | null
) {
  const deposits = cashTransactions
    .filter((tx) => tx.transaction_type === 'DEPOSIT')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const withdraws = cashTransactions
    .filter((tx) => tx.transaction_type === 'WITHDRAW')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const buyOutflow = transactions
    .filter((tx) => tx.transaction_type === 'BUY')
    .reduce((sum, tx) => sum + Number(tx.price || 0) * Number(tx.quantity || 0), 0);

  const sellInflow = transactions
    .filter((tx) => tx.transaction_type === 'SELL')
    .reduce((sum, tx) => sum + Number(tx.price || 0) * Number(tx.quantity || 0), 0);

  const netCapital = deposits - withdraws;
  const calculatedCash = deposits - withdraws - buyOutflow + sellInflow;
  const cashAdjustment = Number(portfolioSettings?.cash_adjustment || 0);
  const actualCash = calculatedCash + cashAdjustment;

  return {
    deposits,
    withdraws,
    buyOutflow,
    sellInflow,
    netCapital,
    calculatedCash,
    cashAdjustment,
    actualCash,
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}
