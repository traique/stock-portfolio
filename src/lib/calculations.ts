// src/lib/calculations.ts
//
// ✨ HỖ TRỢ CỔ TỨC (dividends):
//   • Cổ tức TIỀN MẶT  → CashTransaction.transaction_type = 'DIVIDEND'
//       (cộng vào tiền mặt thực tế, KHÔNG cộng vào vốn gốc ⇒ tính là lãi).
//   • Cổ tức CỔ PHIẼU / thưởng → Transaction.transaction_type = 'STOCK_DIVIDEND'
//       (tạo lô cổ phiếu giá vốn = 0 ⇒ tổng vốn không đổi, số lượng tăng,
//        giá vốn bình quân giảm — đúng bản chất điều chỉnh giá ngày GDKHQ).
//   ⇒ Khi giá bị điều chỉnh giảm ngày không hưởng quyền, danh mục KHÔNG còn báo "lỗ ảo".

export type Transaction = {
  id: string;
  user_id: string;
  symbol: string;
  transaction_type: 'BUY' | 'SELL' | 'STOCK_DIVIDEND'; // ✨ thêm cổ tức cổ phiếu
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
  transaction_type: 'DEPOSIT' | 'WITHDRAW' | 'DIVIDEND'; // ✨ thêm cổ tức tiền mặt
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

export type PortfolioDerivation = {
  positions: PositionGroup[]; // ✨ vị thế đã gom theo mã — các route như portfolio-insights / export dùng field này
  openLots: OpenLot[];
  enrichedTransactions: Transaction[];
  totalSellOrders: number;
  totalRealizedPnl: number;
  wins: number;
  losses: number;
};

export type TransactionValidationResult = {
  valid: boolean;
  error?: string;
};

const EPSILON = 1e-9;

function roundQty(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    const da = a.trade_date ?? '';
    const db = b.trade_date ?? '';
    if (da !== db) return da < db ? -1 : 1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// FIFO: mô phỏng toàn bộ lịch sử giao dịch → các lô còn mở + lãi/lỗ từng lệnh bán.
export function simulateTransactions(transactions: Transaction[]): SimulationResult {
  const lotsBySymbol = new Map<string, Array<{ lot: OpenLot; remaining: number }>>();
  const sellMetaById: Record<string, SellMeta> = {};

  for (const tx of sortTransactions(transactions)) {
    const symbol = String(tx.symbol || '').trim().toUpperCase();
    const qty = roundQty(Number(tx.quantity || 0));
    const price = Number(tx.price || 0);

    // ✨ Cổ tức cổ phiếu có giá vốn = 0 nên hợp lệ; các loại khác vẫn cần giá > 0.
    const isStockDividend = tx.transaction_type === 'STOCK_DIVIDEND';
    if (!symbol || qty <= 0) continue;
    if (!isStockDividend && price <= 0) continue;

    // ✨ BUY và STOCK_DIVIDEND đều tạo lô mở mới (FIFO).
    //    STOCK_DIVIDEND (cổ phiếu thưởng): buy_price = 0
    //    ⇒ tổng giá vốn KHÔNG đổi, số lượng tăng ⇒ giá vốn BQ giảm đúng bản chất pha loãng.
    if (tx.transaction_type === 'BUY' || isStockDividend) {
      const lot: OpenLot = {
        id: `${tx.id}:lot`,
        user_id: tx.user_id,
        symbol,
        buy_price: isStockDividend ? 0 : price,
        quantity: qty,
        buy_date: tx.trade_date || null,
        note: tx.note || null,
        created_at: tx.created_at,
        updated_at: tx.updated_at,
        source_transaction_id: tx.id,
      };
      const queue = lotsBySymbol.get(symbol) ?? [];
      queue.push({ lot, remaining: qty });
      lotsBySymbol.set(symbol, queue);
      continue;
    }

    // ── SELL ──
    const queue = lotsBySymbol.get(symbol) ?? [];
    const available = roundQty(queue.reduce((s, e) => s + e.remaining, 0));

    if (qty > available + EPSILON) {
      return {
        valid: false,
        error: `Lệnh bán ${symbol} (${qty}) vượt quá số lượng đang nắm giữ (${available}) tại ngày ${tx.trade_date ?? '--'}`,
        openLots: [],
        sellMetaById: {},
      };
    }

    const sellQty = Math.min(qty, available);
    let toConsume = sellQty;
    let costBasis = 0;

    for (const entry of queue) {
      if (toConsume <= EPSILON) break;
      const consume = Math.min(entry.remaining, toConsume);
      costBasis += consume * entry.lot.buy_price;
      entry.remaining = roundQty(entry.remaining - consume);
      toConsume = roundQty(toConsume - consume);
    }

    sellMetaById[tx.id] = {
      avgCost: sellQty > 0 ? costBasis / sellQty : 0,
      realizedPnl: sellQty * price - costBasis,
    };
  }

  const openLots: OpenLot[] = [];
  for (const queue of lotsBySymbol.values()) {
    for (const { lot, remaining } of queue) {
      if (remaining > EPSILON) {
        openLots.push({
          ...lot,
          symbol: lot.symbol.toUpperCase(),
          quantity: roundQty(remaining),
        });
      }
    }
  }

  return { valid: true, openLots, sellMetaById };
}

// Lấy kết quả mô phỏng + gắn avg_cost / realized_pnl vào các lệnh SELL.
export function derivePortfolio(transactions: Transaction[]): PortfolioDerivation {
  const sim = simulateTransactions(transactions);
  if (!sim.valid) {
    return {
      positions: [],
      openLots: [],
      enrichedTransactions: transactions,
      totalSellOrders: 0,
      totalRealizedPnl: 0,
      wins: 0,
      losses: 0,
    };
  }

  const enrichedTransactions = transactions.map((tx) => {
    if (tx.transaction_type !== 'SELL') return tx;
    const meta = sim.sellMetaById[tx.id];
    if (!meta) return tx;
    return { ...tx, avg_cost: meta.avgCost, realized_pnl: meta.realizedPnl };
  });

  let totalSellOrders = 0;
  let totalRealizedPnl = 0;
  let wins = 0;
  let losses = 0;

  for (const tx of enrichedTransactions) {
    if (tx.transaction_type !== 'SELL') continue;
    const meta = sim.sellMetaById[tx.id];
    if (!meta) continue;
    totalSellOrders += 1;
    totalRealizedPnl += meta.realizedPnl;
    if (meta.realizedPnl > EPSILON) wins += 1;
    else if (meta.realizedPnl < -EPSILON) losses += 1;
  }

  return {
    positions: groupHoldingsBySymbol(sim.openLots),
    openLots: sim.openLots,
    enrichedTransactions,
    totalSellOrders,
    totalRealizedPnl,
    wins,
    losses,
  };
}

// Validate giao dịch mới trước khi lưu (kiểm tra oversell cho SELL).
export function validateNewTransaction(
  existingTransactions: Transaction[],
  newTx: Pick<Transaction, 'id' | 'user_id' | 'transaction_type' | 'symbol' | 'price' | 'quantity' | 'trade_date' | 'note'>,
): TransactionValidationResult {
  const symbol = String(newTx.symbol || '').trim().toUpperCase();
  const qty = roundQty(Number(newTx.quantity || 0));
  const price = Number(newTx.price || 0);

  if (!symbol) return { valid: false, error: 'Mã cổ phiếu không được để trống' };
  if (qty <= 0) return { valid: false, error: 'Số lượng phải lớn hơn 0' };

  // ✨ Cổ tức cổ phiếu: giá = 0 hợp lệ, chỉ cần qty > 0 (cộng thêm cổ phiếu, không tốn tiền).
  if (newTx.transaction_type === 'STOCK_DIVIDEND') return { valid: true };

  if (price <= 0) return { valid: false, error: 'Giá phải lớn hơn 0' };

  // Với lệnh MUA không cần kiểm tra thêm.
  if (newTx.transaction_type === 'BUY') return { valid: true };

  // Với lệnh BÁN: chạy simulation với giao dịch mới để kiểm tra oversell.
  const candidateTx: Transaction = {
    ...newTx,
    symbol,
    avg_cost: null,
    realized_pnl: null,
    created_at: newTx.trade_date ?? new Date().toISOString(),
    updated_at: newTx.trade_date ?? new Date().toISOString(),
  };

  const sim = simulateTransactions([...existingTransactions, candidateTx]);
  if (!sim.valid) return { valid: false, error: sim.error };
  return { valid: true };
}

// Gom các lô mở theo mã → vị thế tổng hợp.
export function groupHoldingsBySymbol(openLots: OpenLot[]): PositionGroup[] {
  const grouped = new Map<string, OpenLot[]>();
  for (const lot of openLots) {
    const symbol = lot.symbol.toUpperCase();
    const list = grouped.get(symbol) ?? [];
    list.push(lot);
    grouped.set(symbol, list);
  }

  const groups: PositionGroup[] = [];
  for (const [symbol, holdings] of grouped.entries()) {
    const quantity = roundQty(holdings.reduce((s, h) => s + Number(h.quantity || 0), 0));
    const totalBuy = holdings.reduce((s, h) => s + Number(h.buy_price || 0) * Number(h.quantity || 0), 0);
    const avgBuyPrice = quantity > 0 ? totalBuy / quantity : 0;
    let latestBuyDate: string | null = null;
    for (const h of holdings) {
      if (h.buy_date && (!latestBuyDate || h.buy_date > latestBuyDate)) latestBuyDate = h.buy_date;
    }
    const note = holdings.find((h) => h.note)?.note ?? null;
    groups.push({ symbol, holdings, quantity, avgBuyPrice, totalBuy, note, latestBuyDate });
  }

  groups.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return groups;
}

export function calcHolding(lot: OpenLot, prices: PriceMap) {
  const symbol = lot.symbol.toUpperCase();
  const quantity = Number(lot.quantity || 0);
  const buyPrice = Number(lot.buy_price || 0);
  const now = Number(prices[symbol] ?? buyPrice);
  const cost = buyPrice * quantity;
  const value = now * quantity;
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { symbol, quantity, buyPrice, now, cost, value, pnl, pnlPct };
}

export function calcPosition(group: PositionGroup, prices: PriceMap) {
  const symbol = group.symbol.toUpperCase();
  const quantity = group.quantity;
  const buyPrice = group.avgBuyPrice;
  const now = Number(prices[symbol] ?? buyPrice);
  const cost = group.totalBuy;
  const value = now * quantity;
  const pnl = value - cost;
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  return { symbol, quantity, buyPrice, now, cost, value, pnl, pnlPct, latestBuyDate: group.latestBuyDate, note: group.note };
}

export function calcSummary(groups: PositionGroup[], prices: PriceMap) {
  let totalCost = 0;
  let totalNow = 0;
  for (const g of groups) {
    const pos = calcPosition(g, prices);
    totalCost += pos.cost;
    totalNow += pos.value;
  }
  const totalPnl = totalNow - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  return { totalCost, totalNow, totalPnl, totalPnlPct };
}

// Tổng hợp tiền mặt. ✨ Cộng thêm cổ tức tiền mặt (DIVIDEND).
export function calcCashSummary(
  cashTransactions: CashTransaction[],
  transactions: Transaction[],
  portfolioSettings?: PortfolioSettings | null,
) {
  const deposits = cashTransactions
    .filter((tx) => tx.transaction_type === 'DEPOSIT')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const withdraws = cashTransactions
    .filter((tx) => tx.transaction_type === 'WITHDRAW')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  // ✨ Cổ tức tiền mặt nhận về — là LỢI NHUẬN, không phải vốn góp.
  const dividends = cashTransactions
    .filter((tx) => tx.transaction_type === 'DIVIDEND')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

  const buyOutflow = transactions
    .filter((tx) => tx.transaction_type === 'BUY')
    .reduce((sum, tx) => sum + Number(tx.price || 0) * Number(tx.quantity || 0), 0);

  const sellInflow = transactions
    .filter((tx) => tx.transaction_type === 'SELL')
    .reduce((sum, tx) => sum + Number(tx.price || 0) * Number(tx.quantity || 0), 0);

  // Vốn gốc CHỈ gồm tiền nạp − rút (KHÔNG gồm cổ tức) ⇒ cổ tức được tính là lãi.
  const netCapital = deposits - withdraws;

  // Tiền mặt thực tế CÓ cộng cổ tức tiền mặt đã nhận.
  const calculatedCash = deposits - withdraws + dividends - buyOutflow + sellInflow;
  const cashAdjustment = Number(portfolioSettings?.cash_adjustment || 0);
  const actualCash = calculatedCash + cashAdjustment;

  return {
    deposits,
    withdraws,
    dividends, // ✨ mới
    buyOutflow,
    sellInflow,
    netCapital,
    calculatedCash,
    cashAdjustment,
    actualCash,
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export type PortfolioRisk = {
  annualVolatility: number;
  diversificationScore: number;
  concentration: number;
};

const TRADING_DAYS = 252;

// Rủi ro danh mục: biến động năm hóa từ ma trận hiệp phương sai + độ tập trung.
export function calcPortfolioRisk(
  holdings: Array<{ symbol: string; weight: number; closes: number[] }>,
): PortfolioRisk {
  const valid = holdings.filter((h) => h.closes && h.closes.length > 2 && h.weight > 0);
  if (valid.length === 0) {
    return { annualVolatility: 0, diversificationScore: 0, concentration: 0 };
  }

  const weightSum = valid.reduce((s, h) => s + h.weight, 0);
  const weights = valid.map((h) => h.weight / (weightSum || 1));

  const dailyReturns: number[][] = valid.map((h) => {
    const rets: number[] = [];
    for (let i = 1; i < h.closes.length; i++) {
      const prev = h.closes[i - 1];
      const cur = h.closes[i];
      if (prev > 0) rets.push(cur / prev - 1);
    }
    return rets;
  });

  const n = valid.length;
  const minLen = Math.min(...dailyReturns.map((r) => r.length));
  if (minLen < 2) {
    const concentration = weights.reduce((s, w) => s + w * w, 0);
    return { annualVolatility: 0, diversificationScore: 1 - concentration, concentration };
  }

  const trimmed = dailyReturns.map((r) => r.slice(r.length - minLen));
  const means = trimmed.map((r) => r.reduce((s, x) => s + x, 0) / r.length);

  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let acc = 0;
      for (let k = 0; k < minLen; k++) {
        acc += (trimmed[i][k] - means[i]) * (trimmed[j][k] - means[j]);
      }
      const c = acc / (minLen - 1);
      cov[i][j] = c;
      cov[j][i] = c;
    }
  }

  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += weights[i] * weights[j] * cov[i][j];
    }
  }
  variance = Math.max(0, variance);

  const annualVolatility = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS);
  const concentration = weights.reduce((s, w) => s + w * w, 0);
  const diversificationScore = 1 - concentration;

  return { annualVolatility, diversificationScore, concentration };
                                }
