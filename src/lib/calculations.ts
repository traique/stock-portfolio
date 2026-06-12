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

// ---------------------------------------------------------------------------
// PortfolioDerivation — kết quả tổng hợp của simulateTransactions chạy 1 lần
// Dùng derivePortfolio() thay vì gọi riêng lẻ enrichTransactions /
// deriveOpenHoldings / calcRealizedSummary để tránh chạy FIFO 3 lần.
// ---------------------------------------------------------------------------
export type PortfolioDerivation = {
  /** Toàn bộ kết quả FIFO simulation */
  simulation: SimulationResult;
  /** Danh sách lô mua còn mở (alias của simulation.openLots) */
  openLots: OpenLot[];
  /** Giao dịch đã được gắn avg_cost và realized_pnl */
  enrichedTransactions: Transaction[];
  /** Lô mở gộp theo mã */
  positions: PositionGroup[];
  /** Tổng hợp lãi/lỗ đã chốt */
  realizedSummary: {
    totalSellOrders: number;
    totalRealizedPnl: number;
    wins: number;
    losses: number;
  };
};

// ---------------------------------------------------------------------------
// ValidationError — kết quả validate giao dịch trước khi lưu DB
// ---------------------------------------------------------------------------
export type TransactionValidationResult =
  | { valid: true }
  | { valid: false; error: string };

// ---------------------------------------------------------------------------
// Epsilon + helpers
// ---------------------------------------------------------------------------
const EPSILON = 1e-9;

function roundQty(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function sortTransactions(transactions: Transaction[]): Transaction[] {
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

// ===========================================================================
// simulateTransactions — CORE FIFO ENGINE (chạy 1 lần qua derivePortfolio)
// ===========================================================================
export function simulateTransactions(transactions: Transaction[]): SimulationResult {
  const lotsBySymbol = new Map<string, Array<{ lot: OpenLot; remaining: number }>>();
  const sellMetaById: Record<string, SellMeta> = {};

  for (const tx of sortTransactions(transactions)) {
    const symbol = String(tx.symbol || '').trim().toUpperCase();
    const qty    = roundQty(Number(tx.quantity || 0));
    const price  = Number(tx.price || 0);

    if (!symbol || qty <= 0 || price <= 0) continue;

    if (tx.transaction_type === 'BUY') {
      const lot: OpenLot = {
        id:                    `${tx.id}:lot`,
        user_id:               tx.user_id,
        symbol,
        buy_price:             price,
        quantity:              qty,
        buy_date:              tx.trade_date || null,
        note:                  tx.note       || null,
        created_at:            tx.created_at,
        updated_at:            tx.updated_at,
        source_transaction_id: tx.id,
      };
      const queue = lotsBySymbol.get(symbol) ?? [];
      queue.push({ lot, remaining: qty });
      lotsBySymbol.set(symbol, queue);
      continue;
    }

    // ── SELL ─────────────────────────────────────────────────────────────────
    const queue     = lotsBySymbol.get(symbol) ?? [];
    const available = roundQty(queue.reduce((s, e) => s + e.remaining, 0));

    if (qty > available + EPSILON) {
      return {
        valid: false,
        error: `Lệnh bán ${symbol} (${qty}) vượt quá số lượng đang nắm giữ (${available}) tại ngày ${tx.trade_date ?? '--'}`,
        openLots:     [],
        sellMetaById: {},
      };
    }

    const sellQty = Math.min(qty, available);
    let toConsume  = sellQty;
    let costBasis  = 0;

    for (const entry of queue) {
      if (toConsume <= EPSILON) break;
      const consume   = Math.min(entry.remaining, toConsume);
      costBasis      += consume * entry.lot.buy_price;
      entry.remaining = roundQty(entry.remaining - consume);
      toConsume       = roundQty(toConsume - consume);
    }

    sellMetaById[tx.id] = {
      avgCost:     sellQty > 0 ? costBasis / sellQty : 0,
      realizedPnl: sellQty * price - costBasis,
    };
  }

  const openLots: OpenLot[] = [];
  for (const queue of lotsBySymbol.values()) {
    for (const { lot, remaining } of queue) {
      if (remaining > EPSILON) {
        openLots.push({
          ...lot,
          symbol:   lot.symbol.toUpperCase(),
          quantity: roundQty(remaining),
        });
      }
    }
  }

  return { valid: true, openLots, sellMetaById };
}

// ===========================================================================
// derivePortfolio — ENTRY POINT CHÍNH
// Chạy simulateTransactions đúng 1 lần, trả về tất cả dữ liệu phái sinh.
// Các file khác (dashboard, cron, telegram) nên gọi hàm này thay vì gọi
// deriveOpenHoldings / enrichTransactions / calcRealizedSummary riêng lẻ.
// ===========================================================================
export function derivePortfolio(transactions: Transaction[]): PortfolioDerivation {
  const simulation = simulateTransactions(transactions);
  const openLots   = simulation.openLots;
  const meta       = simulation.sellMetaById;

  // Enrich transactions (gắn avg_cost + realized_pnl cho SELL)
  const enrichedTransactions = transactions.map((tx) => {
    if (tx.transaction_type !== 'SELL') return tx;
    const sellMeta = meta[tx.id];
    return {
      ...tx,
      avg_cost:     Number(tx.avg_cost     ?? sellMeta?.avgCost     ?? 0),
      realized_pnl: Number(tx.realized_pnl ?? sellMeta?.realizedPnl ?? 0),
    };
  });

  // Realized summary
  const realizedSummary = enrichedTransactions
    .filter((tx) => tx.transaction_type === 'SELL')
    .reduce(
      (acc, tx) => {
        const realized = Number(tx.realized_pnl || 0);
        acc.totalSellOrders += 1;
        acc.totalRealizedPnl += realized;
        acc.wins   += realized > 0 ? 1 : 0;
        acc.losses += realized < 0 ? 1 : 0;
        return acc;
      },
      { totalSellOrders: 0, totalRealizedPnl: 0, wins: 0, losses: 0 },
    );

  // Group positions
  const positions = groupHoldingsBySymbol(openLots);

  return { simulation, openLots, enrichedTransactions, positions, realizedSummary };
}

// ===========================================================================
// validateNewTransaction — FIX 4: kiểm tra giao dịch mới trước khi lưu DB
// Truyền existing transactions + giao dịch sắp thêm vào.
// Trả về { valid: true } hoặc { valid: false, error: string }.
// ===========================================================================
export function validateNewTransaction(
  existingTransactions: Transaction[],
  newTx: Pick<Transaction, 'id' | 'user_id' | 'symbol' | 'transaction_type' | 'price' | 'quantity' | 'trade_date' | 'note'>,
): TransactionValidationResult {
  const symbol = String(newTx.symbol || '').trim().toUpperCase();
  const qty    = roundQty(Number(newTx.quantity || 0));
  const price  = Number(newTx.price || 0);

  // Kiểm tra cơ bản
  if (!symbol)    return { valid: false, error: 'Mã cổ phiếu không được để trống' };
  if (qty <= 0)   return { valid: false, error: 'Số lượng phải lớn hơn 0' };
  if (price <= 0) return { valid: false, error: 'Giá phải lớn hơn 0' };

  // Với lệnh MUA không cần kiểm tra thêm (luôn hợp lệ nếu qty/price > 0)
  if (newTx.transaction_type === 'BUY') return { valid: true };

  // Với lệnh BÁN: chạy simulation với giao dịch mới để kiểm tra oversell
  const candidateTx: Transaction = {
    ...newTx,
    symbol,
    avg_cost:     null,
    realized_pnl: null,
    created_at:   newTx.trade_date ?? new Date().toISOString(),
    updated_at:   newTx.trade_date ?? new Date().toISOString(),
  };

  const result = simulateTransactions([...existingTransactions, candidateTx]);

  if (!result.valid) {
    return { valid: false, error: result.error ?? 'Giao dịch không hợp lệ' };
  }

  return { valid: true };
}

// ===========================================================================
// Legacy wrappers — giữ lại để không break code cũ đang import trực tiếp.
// Nội bộ chúng tái sử dụng derivePortfolio() nên chỉ chạy simulation 1 lần.
// ===========================================================================

export function deriveOpenHoldings(transactions: Transaction[]): OpenLot[] {
  const result = simulateTransactions(transactions);
  return result.valid ? result.openLots : [];
}

export function enrichTransactions(transactions: Transaction[]) {
  return derivePortfolio(transactions).enrichedTransactions;
}

export function calcRealizedSummary(transactions: Transaction[]) {
  return derivePortfolio(transactions).realizedSummary;
}

// ===========================================================================
// groupHoldingsBySymbol
// ===========================================================================
export function groupHoldingsBySymbol(holdings: OpenLot[]): PositionGroup[] {
  const grouped = new Map<string, OpenLot[]>();

  for (const holding of holdings) {
    const symbol = String(holding.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    const list = grouped.get(symbol) ?? [];
    list.push({ ...holding, symbol });
    grouped.set(symbol, list);
  }

  return [...grouped.entries()]
    .map(([symbol, items]) => {
      const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const totalBuy = items.reduce(
        (sum, item) => sum + Number(item.buy_price || 0) * Number(item.quantity || 0),
        0,
      );
      const avgBuyPrice = quantity > 0 ? totalBuy / quantity : 0;

      const latestBuyDate =
        [...items]
          .map((item) => item.buy_date)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null;

      const note =
        items
          .map((item) => item.note?.trim())
          .filter(Boolean)
          .at(-1) ?? null;

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

// ===========================================================================
// Calc helpers
// ===========================================================================

export function calcHolding(holding: OpenLot, prices: PriceMap) {
  const currentPrice = Number(prices[holding.symbol.toUpperCase()] || 0);
  const totalBuy     = Number(holding.buy_price) * Number(holding.quantity);
  const totalNow     = currentPrice * Number(holding.quantity);
  const pnl          = totalNow - totalBuy;
  const pnlPct       = totalBuy > 0 ? (pnl / totalBuy) * 100 : 0;
  return { currentPrice, totalBuy, totalNow, pnl, pnlPct };
}

export function calcPosition(position: PositionGroup, prices: PriceMap) {
  const currentPrice = Number(prices[position.symbol.toUpperCase()] || 0);
  const totalNow     = currentPrice * Number(position.quantity || 0);
  const pnl          = totalNow - Number(position.totalBuy || 0);
  const pnlPct       = position.totalBuy > 0 ? (pnl / position.totalBuy) * 100 : 0;
  return { currentPrice, totalBuy: position.totalBuy, totalNow, pnl, pnlPct };
}

export function calcSummary(openHoldings: OpenLot[], prices: PriceMap) {
  return groupHoldingsBySymbol(openHoldings).reduce(
    (acc, position) => {
      const row = calcPosition(position, prices);
      acc.totalBuy += row.totalBuy;
      acc.totalNow += row.totalNow;
      acc.totalPnl += row.pnl;
      return acc;
    },
    { totalBuy: 0, totalNow: 0, totalPnl: 0 },
  );
}

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

  const buyOutflow = transactions
    .filter((tx) => tx.transaction_type === 'BUY')
    .reduce((sum, tx) => sum + Number(tx.price || 0) * Number(tx.quantity || 0), 0);

  const sellInflow = transactions
    .filter((tx) => tx.transaction_type === 'SELL')
    .reduce((sum, tx) => sum + Number(tx.price || 0) * Number(tx.quantity || 0), 0);

  const netCapital     = deposits - withdraws;
  const calculatedCash = deposits - withdraws - buyOutflow + sellInflow;
  const cashAdjustment = Number(portfolioSettings?.cash_adjustment || 0);
  const actualCash     = calculatedCash + cashAdjustment;

  return { deposits, withdraws, buyOutflow, sellInflow, netCapital, calculatedCash, cashAdjustment, actualCash };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style:                 'currency',
    currency:              'VND',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

// ===========================================================================
//  — Rủi ro danh mục bằng ma trận hiệp phương sai (covariance)
// σ_p = sqrt(wᵀ Σ w) — có tính tương quan giữa các mã, annualized theo 252 phiên.
// ===========================================================================
export type PortfolioRisk = {
  volatilityPct: number;             // vol cả danh mục (annualized %) — đã tính tương quan
  weightedAvgVolPct: number;         // Σ wᵢ·σᵢ nếu các mã độc lập (không đa dạng hóa)
  diversificationBenefitPct: number; // weightedAvg − portfolio (>0 = lợi ích đa dạng hóa)
  topWeightSymbol: string | null;    // mã tỷ trọng lớn nhất
  topWeightPct: number;              // tỷ trọng mã lớn nhất (%)
  effectiveHoldings: number;         // 1/Σwᵢ² — số mã "hiệu dụng"
  basis: number;                     // số phiên return dùng để tính
};

const TRADING_DAYS = 252;

function dailyReturns(closes: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (prev > 0) r.push((closes[i] - prev) / prev);
  }
  return r;
}

export function calcPortfolioRisk(
  holdings: Array<{ symbol: string; weight: number; closes: number[] }>,
): PortfolioRisk {
  const empty: PortfolioRisk = {
    volatilityPct: 0, weightedAvgVolPct: 0, diversificationBenefitPct: 0,
    topWeightSymbol: null, topWeightPct: 0, effectiveHoldings: 0, basis: 0,
  };

  // Chỉ giữ mã có tỷ trọng > 0 và đủ chuỗi return (>= 20 phiên)
  const valid = holdings
    .map((h) => ({ symbol: h.symbol, weight: Math.max(0, h.weight), returns: dailyReturns(h.closes) }))
    .filter((h) => h.weight > 0 && h.returns.length >= 20);

  const totalW = valid.reduce((s, h) => s + h.weight, 0);
  if (valid.length === 0 || totalW <= 0) return empty;

  // Chuẩn hoá tỷ trọng về tổng = 1
  const w = valid.map((h) => h.weight / totalW);

  // Căn chỉnh chuỗi return về phần cuối chung (cùng số phiên)
  const L = Math.min(...valid.map((h) => h.returns.length));
  const rets = valid.map((h) => h.returns.slice(-L));
  const means = rets.map((r) => r.reduce((a, b) => a + b, 0) / L);

  // Ma trận hiệp phương sai (mẫu, chia L-1) — đối xứng
  const n = valid.length;
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let t = 0; t < L; t++) {
        s += (rets[i][t] - means[i]) * (rets[j][t] - means[j]);
      }
      const c = L > 1 ? s / (L - 1) : 0;
      cov[i][j] = c;
      cov[j][i] = c;
    }
  }

  // Phương sai danh mục = wᵀ Σ w
  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += w[i] * w[j] * cov[i][j];
    }
  }

  const annualize = Math.sqrt(TRADING_DAYS) * 100;
  const portfolioVol = Math.sqrt(Math.max(variance, 0)) * annualize;

  // Vol bình quân gia quyền (bỏ qua tương quan) để so sánh lợi ích đa dạng hóa
  const standaloneVol = valid.map((_, i) => Math.sqrt(Math.max(cov[i][i], 0)));
  const weightedAvgVol = w.reduce((s, wi, i) => s + wi * standaloneVol[i], 0) * annualize;

  // Tập trung tỷ trọng
  let topIdx = 0;
  for (let i = 1; i < n; i++) if (w[i] > w[topIdx]) topIdx = i;
  const hhi = w.reduce((s, wi) => s + wi * wi, 0);

  return {
    volatilityPct: Number(portfolioVol.toFixed(2)),
    weightedAvgVolPct: Number(weightedAvgVol.toFixed(2)),
    diversificationBenefitPct: Number((weightedAvgVol - portfolioVol).toFixed(2)),
    topWeightSymbol: valid[topIdx].symbol,
    topWeightPct: Number((w[topIdx] * 100).toFixed(1)),
    effectiveHoldings: Number((hhi > 0 ? 1 / hhi : 0).toFixed(1)),
    basis: L,
  };
    }
