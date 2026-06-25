// src/lib/calculations.ts
// 
// 🧾 GIÁ VỐN & PHÍ:
// • Nếu bạn CỘNG TRỰC TIẾP phí sàn vào giá mua khi nhập giao dịch:
//   để fee/tax = null/0, code KHÔNG tự tính thêm phí.
// • Nếu muốn tách riêng:
//   - BUY: fee được cộng vào giá vốn.
//   - SELL: fee/tax được trừ khỏi tiền bán thực nhận.
//   - Nếu SELL bị khớp một phần do bán vượt trong non-strict mode,
//     fee/tax được phân bổ theo tỷ lệ khớp thực.
//
// ✨ CỔ TỨC:
// • Cổ tức TIỀN MẶT → CashTransaction.transaction_type = 'DIVIDEND'
//   cộng vào tiền mặt thực tế, KHÔNG cộng vào vốn gốc.
// • Cổ tức CỔ PHIẾU / thưởng → Transaction.transaction_type = 'STOCK_DIVIDEND'
//   tạo lô giá vốn = 0.
// • Số lượng cổ tức cổ phiếu được làm tròn XUỐNG số nguyên.
//   Phần lẻ công ty trả bằng tiền thì nhập riêng là DIVIDEND.
//
// 🛡️ BÁN VƯỢT / BÁN ÂM:
// • simulateTransactions trả sellQty = lượng bán THỰC.
// • sellInflow tính theo sellQty, không bao giờ cộng tiền ảo.
// • Non-strict: bán tối đa phần đang có, không để vị thế âm.
// • Strict: chặn cứng bán vượt, dùng cho validate trước khi lưu.
//
// 📅 GIAO DỊCH KHÔNG CÓ NGÀY:
// • trade_date null/invalid được xếp CUỐI.
// • Trong cùng ngày hoặc cùng nhóm không ngày:
//   BUY và STOCK_DIVIDEND được xử lý trước SELL.
// • Việc này tránh lỗi giả khi lệnh mua không có ngày nhưng lệnh bán bị sort trước.
//
// 💰 GIÁ VỐN KHI BÁN:
// • Dùng bình quân gia quyền toàn bộ số đang nắm.
// • Khi bán, trừ đều theo tỷ lệ để giá vốn bình quân phần còn lại giữ nguyên.

export type Broker = 'VPS' | 'DNSE' | string

export type TransactionType = 'BUY' | 'SELL' | 'STOCK_DIVIDEND'
export type CashTransactionType = 'DEPOSIT' | 'WITHDRAW' | 'DIVIDEND'

export type Transaction = {
  id: string
  user_id: string
  symbol: string
  transaction_type: TransactionType
  price: number
  quantity: number
  trade_date: string | null
  note: string | null
  avg_cost: number | null
  realized_pnl: number | null
  created_at: string
  updated_at: string

  // Tùy chọn — phục vụ báo cáo / tách phí nếu cần.
  broker?: Broker | null

  // BUY: cộng vào giá vốn nếu nhập.
  // SELL: trừ khỏi tiền bán nếu nhập.
  // Để null/0 nếu bạn đã tự cộng phí vào giá nhập.
  fee?: number | null

  // SELL: thuế bán nếu nhập riêng.
  // Để null/0 nếu không tách riêng.
  tax?: number | null
}

export type CashTransaction = {
  id: string
  user_id: string
  transaction_type: CashTransactionType
  amount: number
  transaction_date: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export type PortfolioSettings = {
  user_id: string
  cash_adjustment: number
  created_at?: string
  updated_at?: string
}

export type PriceMap = Record<string, number>

export type OpenLot = {
  id: string
  user_id: string
  symbol: string
  buy_price: number
  quantity: number
  buy_date: string | null
  note: string | null
  created_at: string
  updated_at: string
  source_transaction_id: string
}

export type PositionGroup = {
  symbol: string
  holdings: OpenLot[]
  quantity: number
  avgBuyPrice: number
  totalBuy: number
  note: string | null
  latestBuyDate: string | null
}

export type SellMeta = {
  avgCost: number
  requestedQty: number
  sellQty: number
  grossProceeds: number
  fee: number
  tax: number
  netProceeds: number
  realizedPnl: number
  oversold: boolean
}

export type SimulationWarning =
  | {
      code: 'INVALID_TRANSACTION'
      transactionId: string
      symbol: string | null
      reason: string
    }
  | {
      code: 'OVERSELL'
      transactionId: string
      symbol: string
      requestedQty: number
      availableQty: number
      sellQty: number
      tradeDate: string | null
    }
  | {
      code: 'MISSING_MARKET_PRICE'
      symbol: string
    }

export type SimulationResult = {
  valid: boolean
  error?: string
  warnings: SimulationWarning[]
  openLots: OpenLot[]
  sellMetaById: Record<string, SellMeta>
  buyOutflow: number
  sellGrossInflow: number
  sellNetInflow: number
}

export type PortfolioDerivation = {
  positions: PositionGroup[]
  openLots: OpenLot[]
  enrichedTransactions: Transaction[]
  totalSellOrders: number
  totalRealizedPnl: number
  wins: number
  losses: number
  realizedSummary: {
    totalSellOrders: number
    totalRealizedPnl: number
    wins: number
    losses: number
  }
  warnings: SimulationWarning[]
  isReliable: boolean
}

export type TransactionValidationResult = {
  valid: boolean
  error?: string
}

export type CalculatedHolding = {
  symbol: string
  quantity: number
  buyPrice: number
  now: number
  currentPrice: number | null
  cost: number
  value: number
  pnl: number
  pnlPct: number
  isPriceMissing: boolean
}

export type CalculatedPosition = CalculatedHolding & {
  latestBuyDate: string | null
  note: string | null
}

export type PortfolioSummary = {
  totalCost: number
  totalNow: number
  totalPnl: number
  totalPnlPct: number
  missingPriceSymbols: string[]
  isPriceComplete: boolean
}

export type CashSummary = {
  deposits: number
  withdraws: number
  dividends: number
  buyOutflow: number
  sellInflow: number
  sellGrossInflow: number
  sellNetInflow: number
  netCapital: number
  calculatedCash: number
  cashAdjustment: number
  actualCash: number
  warnings: SimulationWarning[]
  isReliable: boolean
}

export type PortfolioRisk = {
  annualVolatility: number
  diversificationScore: number
  concentration: number

  // Expanded fields.
  volatilityPct: number
  weightedAvgVolatility: number
  diversificationBenefit: number
  topWeightSymbol: string
  topWeightPct: number
  effectiveHoldings: number
  basis: number
}

const EPSILON = 1e-9
const QTY_SCALE = 1e8
const TRADING_DAYS = 252
const MEANINGFUL_WEIGHT_THRESHOLD = 0.01

const TRANSACTION_TYPE_ORDER: Record<TransactionType, number> = {
  BUY: 0,
  STOCK_DIVIDEND: 1,
  SELL: 2,
}

function roundQty(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * QTY_SCALE) / QTY_SCALE
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  // VND thực tế không cần phần thập phân. Nếu DB đang lưu decimal,
  // đổi hàm này thành round 2 chữ số.
  return Math.round(value)
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toNonNegativeNumber(value: unknown, fieldName: string): number {
  const parsed = value == null || value === '' ? 0 : toFiniteNumber(value)

  if (parsed === null) {
    throw new Error(`${fieldName} không hợp lệ`)
  }

  if (parsed < 0) {
    throw new Error(`${fieldName} không được âm`)
  }

  return parsed
}

function toPositiveNumber(value: unknown, fieldName: string): number {
  const parsed = toFiniteNumber(value)

  if (parsed === null) {
    throw new Error(`${fieldName} không hợp lệ`)
  }

  if (parsed <= 0) {
    throw new Error(`${fieldName} phải lớn hơn 0`)
  }

  return parsed
}

function parseSymbol(value: unknown): string {
  const symbol = String(value ?? '').trim().toUpperCase()

  if (!symbol) {
    throw new Error('Mã cổ phiếu không được để trống')
  }

  // Cho phép số trong mã. Nếu bạn có mã đặc biệt hơn, mở rộng regex ở đây.
  if (!/^[A-Z0-9]{1,15}$/.test(symbol)) {
    throw new Error('Mã cổ phiếu không hợp lệ')
  }

  return symbol
}

function isTransactionType(value: unknown): value is TransactionType {
  return value === 'BUY' || value === 'SELL' || value === 'STOCK_DIVIDEND'
}

function isCashTransactionType(value: unknown): value is CashTransactionType {
  return value === 'DEPOSIT' || value === 'WITHDRAW' || value === 'DIVIDEND'
}

function getDateSortValue(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY

  // Ưu tiên ISO date từ input date picker / DB.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`)
    return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
  }

  // Nếu lỡ là ISO datetime thì vẫn xử lý được.
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function getCreatedAtSortValue(value: string): number {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

function buildOpenLots(
  lotsBySymbol: Map<string, Array<{ lot: OpenLot; remaining: number }>>,
): OpenLot[] {
  const openLots: OpenLot[] = []

  for (const queue of lotsBySymbol.values()) {
    for (const { lot, remaining } of queue) {
      if (remaining > EPSILON) {
        openLots.push({
          ...lot,
          symbol: lot.symbol.toUpperCase(),
          quantity: roundQty(remaining),
        })
      }
    }
  }

  return openLots
}

/**
 * Sort transaction ổn định cho nghiệp vụ danh mục.
 *
 * Rule quan trọng:
 * - Có ngày trước, không ngày sau.
 * - Trong cùng ngày hoặc cùng nhóm không ngày:
 *   BUY/STOCK_DIVIDEND trước SELL.
 *
 * Lý do:
 * Nếu giao dịch không có ngày, việc sort thuần theo created_at có thể làm SELL
 * chạy trước BUY và gây lỗi bán vượt giả. Rule này ưu tiên không làm âm vị thế
 * khi người dùng nhập thiếu ngày.
 */
export function sortTransactions(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    const dateA = getDateSortValue(a.trade_date)
    const dateB = getDateSortValue(b.trade_date)

    if (dateA !== dateB) return dateA - dateB

    const typeOrderA = isTransactionType(a.transaction_type)
      ? TRANSACTION_TYPE_ORDER[a.transaction_type]
      : 99
    const typeOrderB = isTransactionType(b.transaction_type)
      ? TRANSACTION_TYPE_ORDER[b.transaction_type]
      : 99

    if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB

    const createdA = getCreatedAtSortValue(a.created_at)
    const createdB = getCreatedAtSortValue(b.created_at)

    if (createdA !== createdB) return createdA - createdB

    return String(a.id).localeCompare(String(b.id))
  })
}

type ParsedTransaction = {
  id: string
  userId: string
  symbol: string
  type: TransactionType
  price: number
  requestedQty: number
  lotQty: number
  fee: number
  tax: number
  tradeDate: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

function parseTransactionForSimulation(tx: Transaction): ParsedTransaction {
  const symbol = parseSymbol(tx.symbol)

  if (!isTransactionType(tx.transaction_type)) {
    throw new Error('Loại giao dịch không hợp lệ')
  }

  const requestedQty = roundQty(toPositiveNumber(tx.quantity, 'Số lượng'))
  const isStockDividend = tx.transaction_type === 'STOCK_DIVIDEND'

  const price = isStockDividend ? 0 : toPositiveNumber(tx.price, 'Giá')
  const fee = isStockDividend ? 0 : toNonNegativeNumber(tx.fee, 'Phí')
  const tax = isStockDividend ? 0 : toNonNegativeNumber(tx.tax, 'Thuế')

  const lotQty = isStockDividend ? Math.floor(requestedQty) : requestedQty

  if (isStockDividend && lotQty <= 0) {
    throw new Error('Số lượng cổ tức cổ phiếu sau khi làm tròn phải lớn hơn 0')
  }

  return {
    id: tx.id,
    userId: tx.user_id,
    symbol,
    type: tx.transaction_type,
    price,
    requestedQty,
    lotQty,
    fee,
    tax,
    tradeDate: tx.trade_date ?? null,
    note: tx.note ?? null,
    createdAt: tx.created_at,
    updatedAt: tx.updated_at,
  }
}

/**
 * Mô phỏng toàn bộ lịch sử giao dịch.
 *
 * strict = true:
 * - Dùng cho validate trước khi lưu.
 * - Gặp giao dịch lỗi hoặc SELL vượt số lượng thì trả valid=false.
 *
 * strict = false:
 * - Dùng cho hiển thị dashboard.
 * - Giao dịch lỗi được bỏ qua và đưa vào warnings.
 * - SELL vượt chỉ khớp phần đang có, không tạo vị thế âm, không cộng tiền ảo.
 */
export function simulateTransactions(
  transactions: Transaction[],
  options: { strict?: boolean } = {},
): SimulationResult {
  const strict = options.strict === true
  const lotsBySymbol = new Map<string, Array<{ lot: OpenLot; remaining: number }>>()
  const sellMetaById: Record<string, SellMeta> = {}
  const warnings: SimulationWarning[] = []

  let buyOutflow = 0
  let sellGrossInflow = 0
  let sellNetInflow = 0

  for (const tx of sortTransactions(transactions)) {
    let parsed: ParsedTransaction

    try {
      parsed = parseTransactionForSimulation(tx)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Giao dịch không hợp lệ'
      const symbol = String(tx.symbol ?? '').trim().toUpperCase() || null

      if (strict) {
        return {
          valid: false,
          error: reason,
          warnings,
          openLots: [],
          sellMetaById: {},
          buyOutflow: 0,
          sellGrossInflow: 0,
          sellNetInflow: 0,
        }
      }

      warnings.push({
        code: 'INVALID_TRANSACTION',
        transactionId: tx.id,
        symbol,
        reason,
      })

      continue
    }

    const {
      id,
      userId,
      symbol,
      type,
      price,
      requestedQty,
      lotQty,
      fee,
      tax,
      tradeDate,
      note,
      createdAt,
      updatedAt,
    } = parsed

    if (type === 'BUY' || type === 'STOCK_DIVIDEND') {
      const grossCost = type === 'STOCK_DIVIDEND' ? 0 : roundMoney(price * lotQty + fee)
      const effectiveBuyPrice = type === 'STOCK_DIVIDEND' ? 0 : grossCost / lotQty

      buyOutflow += grossCost

      const lot: OpenLot = {
        id: `${id}:lot`,
        user_id: userId,
        symbol,
        buy_price: effectiveBuyPrice,
        quantity: lotQty,
        buy_date: tradeDate,
        note,
        created_at: createdAt,
        updated_at: updatedAt,
        source_transaction_id: id,
      }

      const queue = lotsBySymbol.get(symbol) ?? []
      queue.push({ lot, remaining: lotQty })
      lotsBySymbol.set(symbol, queue)

      continue
    }

    const queue = lotsBySymbol.get(symbol) ?? []
    const available = roundQty(queue.reduce((sum, entry) => sum + entry.remaining, 0))
    const oversold = requestedQty > available + EPSILON

    if (oversold && strict) {
      return {
        valid: false,
        error: `Lệnh bán ${symbol} (${requestedQty}) vượt quá số lượng đang nắm giữ (${available}) tại ngày ${tradeDate ?? '--'}`,
        warnings: [
          ...warnings,
          {
            code: 'OVERSELL',
            transactionId: id,
            symbol,
            requestedQty,
            availableQty: available,
            sellQty: available,
            tradeDate,
          },
        ],
        openLots: [],
        sellMetaById: {},
        buyOutflow: 0,
        sellGrossInflow: 0,
        sellNetInflow: 0,
      }
    }

    // Non-strict: bán tối đa phần đang có.
    const sellQty = roundQty(Math.min(requestedQty, available))

    if (oversold) {
      warnings.push({
        code: 'OVERSELL',
        transactionId: id,
        symbol,
        requestedQty,
        availableQty: available,
        sellQty,
        tradeDate,
      })
    }

    const totalCost = queue.reduce(
      (sum, entry) => sum + entry.remaining * entry.lot.buy_price,
      0,
    )
    const avgCost = available > 0 ? totalCost / available : 0
    const costBasis = sellQty * avgCost

    // fee/tax đang là phí cho cả lệnh nhập. Nếu chỉ khớp một phần,
    // phân bổ theo tỷ lệ khớp để không trừ phí/thuế quá mức.
    const fillRatio = requestedQty > 0 ? sellQty / requestedQty : 0
    const appliedFee = fee * fillRatio
    const appliedTax = tax * fillRatio

    const grossProceeds = roundMoney(sellQty * price)
    const netProceeds = roundMoney(grossProceeds - appliedFee - appliedTax)

    if (sellQty > EPSILON && available > EPSILON) {
      const remainRatio = (available - sellQty) / available

      for (const entry of queue) {
        entry.remaining = roundQty(entry.remaining * remainRatio)
      }
    }

    sellGrossInflow += grossProceeds
    sellNetInflow += netProceeds

    sellMetaById[id] = {
      avgCost,
      requestedQty,
      sellQty,
      grossProceeds,
      fee: appliedFee,
      tax: appliedTax,
      netProceeds,
      realizedPnl: netProceeds - costBasis,
      oversold,
    }
  }

  const openLots = buildOpenLots(lotsBySymbol)

  return {
    valid: warnings.length === 0,
    warnings,
    openLots,
    sellMetaById,
    buyOutflow,
    sellGrossInflow,
    sellNetInflow,
  }
}

/**
 * Lấy kết quả mô phỏng + gắn avg_cost / realized_pnl vào các lệnh SELL.
 */
export function derivePortfolio(transactions: Transaction[]): PortfolioDerivation {
  const sim = simulateTransactions(transactions)

  const enrichedTransactions = transactions.map((tx) => {
    if (tx.transaction_type !== 'SELL') return tx

    const meta = sim.sellMetaById[tx.id]
    if (!meta) return tx

    return {
      ...tx,
      avg_cost: meta.avgCost,
      realized_pnl: meta.realizedPnl,
    }
  })

  let totalSellOrders = 0
  let totalRealizedPnl = 0
  let wins = 0
  let losses = 0

  for (const tx of enrichedTransactions) {
    if (tx.transaction_type !== 'SELL') continue

    const meta = sim.sellMetaById[tx.id]

    // Bỏ qua lệnh bán rỗng, ví dụ bán khi available = 0 ở non-strict mode.
    // Không cho nó làm bẩn win-rate.
    if (!meta || meta.sellQty <= EPSILON) continue

    totalSellOrders += 1
    totalRealizedPnl += meta.realizedPnl

    if (meta.realizedPnl > EPSILON) wins += 1
    else if (meta.realizedPnl < -EPSILON) losses += 1
  }

  return {
    positions: groupHoldingsBySymbol(sim.openLots),
    openLots: sim.openLots,
    enrichedTransactions,
    totalSellOrders,
    totalRealizedPnl,
    wins,
    losses,
    realizedSummary: {
      totalSellOrders,
      totalRealizedPnl,
      wins,
      losses,
    },
    warnings: sim.warnings,
    isReliable: sim.valid,
  }
}

/**
 * Validate giao dịch mới trước khi lưu.
 *
 * Quan trọng:
 * - Giao dịch không có ngày không bị lỗi giả nữa, vì sortTransactions xử lý
 *   BUY/STOCK_DIVIDEND trước SELL trong nhóm không ngày.
 * - SELL vượt số lượng vẫn bị chặn cứng.
 */
export function validateNewTransaction(
  existingTransactions: Transaction[],
  newTx: Pick<
    Transaction,
    | 'id'
    | 'user_id'
    | 'transaction_type'
    | 'symbol'
    | 'price'
    | 'quantity'
    | 'trade_date'
    | 'note'
    | 'fee'
    | 'tax'
  >,
): TransactionValidationResult {
  try {
    const symbol = parseSymbol(newTx.symbol)

    if (!isTransactionType(newTx.transaction_type)) {
      return { valid: false, error: 'Loại giao dịch không hợp lệ' }
    }

    const quantity = roundQty(toPositiveNumber(newTx.quantity, 'Số lượng'))

    if (newTx.transaction_type === 'STOCK_DIVIDEND') {
      if (Math.floor(quantity) <= 0) {
        return {
          valid: false,
          error: 'Số lượng cổ tức cổ phiếu sau khi làm tròn phải lớn hơn 0',
        }
      }

      return { valid: true }
    }

    const price = toPositiveNumber(newTx.price, 'Giá')
    const fee = toNonNegativeNumber(newTx.fee, 'Phí')
    const tax = toNonNegativeNumber(newTx.tax, 'Thuế')

    if (newTx.transaction_type === 'BUY') {
      return { valid: true }
    }

    const now = new Date().toISOString()

    const candidateTx: Transaction = {
      ...newTx,
      symbol,
      price,
      quantity,
      fee,
      tax,
      avg_cost: null,
      realized_pnl: null,
      created_at: now,
      updated_at: now,
    }

    const sim = simulateTransactions([...existingTransactions, candidateTx], {
      strict: true,
    })

    if (!sim.valid) {
      return {
        valid: false,
        error: sim.error ?? 'Giao dịch không hợp lệ',
      }
    }

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Giao dịch không hợp lệ',
    }
  }
}

/**
 * Gom các lô mở theo mã → vị thế tổng hợp.
 */
export function groupHoldingsBySymbol(openLots: OpenLot[]): PositionGroup[] {
  const grouped = new Map<string, OpenLot[]>()

  for (const lot of openLots) {
    const symbol = String(lot.symbol ?? '').trim().toUpperCase()
    if (!symbol) continue

    const quantity = roundQty(toFiniteNumber(lot.quantity) ?? 0)
    if (quantity <= EPSILON) continue

    const list = grouped.get(symbol) ?? []
    list.push({
      ...lot,
      symbol,
      quantity,
      buy_price: toFiniteNumber(lot.buy_price) ?? 0,
    })
    grouped.set(symbol, list)
  }

  const groups: PositionGroup[] = []

  for (const [symbol, holdings] of grouped.entries()) {
    const quantity = roundQty(
      holdings.reduce((sum, holding) => sum + (toFiniteNumber(holding.quantity) ?? 0), 0),
    )

    if (quantity <= EPSILON) continue

    const totalBuy = holdings.reduce((sum, holding) => {
      const buyPrice = toFiniteNumber(holding.buy_price) ?? 0
      const lotQuantity = toFiniteNumber(holding.quantity) ?? 0
      return sum + buyPrice * lotQuantity
    }, 0)

    const avgBuyPrice = quantity > 0 ? totalBuy / quantity : 0

    let latestBuyDate: string | null = null

    for (const holding of holdings) {
      if (holding.buy_date && (!latestBuyDate || holding.buy_date > latestBuyDate)) {
        latestBuyDate = holding.buy_date
      }
    }

    const note = holdings.find((holding) => holding.note)?.note ?? null

    groups.push({
      symbol,
      holdings,
      quantity,
      avgBuyPrice,
      totalBuy,
      note,
      latestBuyDate,
    })
  }

  groups.sort((a, b) => a.symbol.localeCompare(b.symbol))

  return groups
}

function getMarketPrice(prices: PriceMap, symbol: string): number | null {
  const price = toFiniteNumber(prices[symbol])

  if (price === null || price <= 0) {
    return null
  }

  return price
}

/**
 * Tính một lot.
 *
 * Backward-compatible:
 * - Vẫn trả now/value/pnl dạng number để UI cũ không vỡ.
 *
 * Thêm:
 * - currentPrice = null nếu thiếu giá thị trường.
 * - isPriceMissing = true nếu đang fallback now = buyPrice.
 */
export function calcHolding(lot: OpenLot, prices: PriceMap): CalculatedHolding {
  const symbol = String(lot.symbol ?? '').trim().toUpperCase()
  const quantity = roundQty(toFiniteNumber(lot.quantity) ?? 0)
  const buyPrice = toFiniteNumber(lot.buy_price) ?? 0
  const currentPrice = getMarketPrice(prices, symbol)

  // Giữ tương thích UI cũ: nếu thiếu giá, fallback về buyPrice.
  // Nhưng phải nhìn isPriceMissing/currentPrice để biết đây không phải giá thật.
  const now = currentPrice ?? buyPrice
  const cost = buyPrice * quantity
  const value = now * quantity
  const pnl = value - cost
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0

  return {
    symbol,
    quantity,
    buyPrice,
    now,
    currentPrice,
    cost,
    value,
    pnl,
    pnlPct,
    isPriceMissing: currentPrice === null,
  }
}

/**
 * Tính một vị thế đã gom theo mã.
 */
export function calcPosition(group: PositionGroup, prices: PriceMap): CalculatedPosition {
  const symbol = String(group.symbol ?? '').trim().toUpperCase()
  const quantity = roundQty(toFiniteNumber(group.quantity) ?? 0)
  const buyPrice = toFiniteNumber(group.avgBuyPrice) ?? 0
  const currentPrice = getMarketPrice(prices, symbol)

  const now = currentPrice ?? buyPrice
  const cost = toFiniteNumber(group.totalBuy) ?? buyPrice * quantity
  const value = now * quantity
  const pnl = value - cost
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0

  return {
    symbol,
    quantity,
    buyPrice,
    now,
    currentPrice,
    cost,
    value,
    pnl,
    pnlPct,
    isPriceMissing: currentPrice === null,
    latestBuyDate: group.latestBuyDate,
    note: group.note,
  }
}

/**
 * Tổng hợp danh mục.
 *
 * Vẫn giữ totalNow là number để UI cũ không vỡ.
 * Nếu thiếu giá, mã đó đang fallback về giá vốn và được liệt kê trong missingPriceSymbols.
 */
export function calcSummary(groups: PositionGroup[], prices: PriceMap): PortfolioSummary {
  let totalCost = 0
  let totalNow = 0
  const missingPriceSymbols: string[] = []

  for (const group of groups) {
    const position = calcPosition(group, prices)

    totalCost += position.cost
    totalNow += position.value

    if (position.isPriceMissing) {
      missingPriceSymbols.push(position.symbol)
    }
  }

  const totalPnl = totalNow - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  return {
    totalCost,
    totalNow,
    totalPnl,
    totalPnlPct,
    missingPriceSymbols,
    isPriceComplete: missingPriceSymbols.length === 0,
  }
}

/**
 * Tổng hợp tiền mặt.
 *
 * Điểm quan trọng:
 * - Mua/bán lấy từ simulateTransactions.
 * - SELL bán vượt chỉ tính sellQty thực khớp.
 * - Không phát sinh tiền ảo.
 */
export function calcCashSummary(
  cashTransactions: CashTransaction[],
  transactions: Transaction[],
  portfolioSettings?: PortfolioSettings | null,
): CashSummary {
  const sim = simulateTransactions(transactions)

  const deposits = sumCashTransactions(cashTransactions, 'DEPOSIT')
  const withdraws = sumCashTransactions(cashTransactions, 'WITHDRAW')
  const dividends = sumCashTransactions(cashTransactions, 'DIVIDEND')

  const buyOutflow = sim.buyOutflow
  const sellInflow = sim.sellNetInflow

  // Vốn gốc: tiền nạp - rút. Cổ tức không cộng vào vốn gốc.
  const netCapital = deposits - withdraws

  // Tiền mặt thực tế: nạp - rút + cổ tức - mua + bán.
  const calculatedCash = deposits - withdraws + dividends - buyOutflow + sellInflow

  const cashAdjustment = toFiniteNumber(portfolioSettings?.cash_adjustment) ?? 0
  const actualCash = calculatedCash + cashAdjustment

  return {
    deposits,
    withdraws,
    dividends,
    buyOutflow,
    sellInflow,
    sellGrossInflow: sim.sellGrossInflow,
    sellNetInflow: sim.sellNetInflow,
    netCapital,
    calculatedCash,
    cashAdjustment,
    actualCash,
    warnings: sim.warnings,
    isReliable: sim.valid,
  }
}

function sumCashTransactions(
  cashTransactions: CashTransaction[],
  type: CashTransactionType,
): number {
  return cashTransactions
    .filter((tx) => {
      if (!isCashTransactionType(tx.transaction_type)) return false
      return tx.transaction_type === type
    })
    .reduce((sum, tx) => {
      const amount = toFiniteNumber(tx.amount)
      if (amount === null || amount <= 0) return sum
      return sum + amount
    }, 0)
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(toFiniteNumber(value) ?? 0)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0

  const avg = mean(values)
  return (
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    (values.length - 1)
  )
}

function calculateDailyReturns(closes: number[]): number[] {
  const returns: number[] = []

  for (let index = 1; index < closes.length; index++) {
    const previous = closes[index - 1]
    const current = closes[index]

    if (
      Number.isFinite(previous) &&
      Number.isFinite(current) &&
      previous > 0 &&
      current > 0
    ) {
      returns.push(current / previous - 1)
    }
  }

  return returns
}

/**
 * Rủi ro danh mục:
 * - annualVolatility: volatility danh mục năm hóa.
 * - concentration: HHI, càng cao càng tập trung.
 * - diversificationScore: 1 - HHI.
 * - weightedAvgVolatility: trung bình volatility từng mã theo tỷ trọng, đơn vị %.
 * - diversificationBenefit: mức giảm volatility do đa dạng hóa, đơn vị %.
 */
export function calcPortfolioRisk(
  holdings: Array<{
    symbol: string
    weight: number
    closes: number[]
    value?: number
  }>,
): PortfolioRisk {
  const valid = holdings
    .map((holding) => ({
      ...holding,
      symbol: String(holding.symbol ?? '').trim().toUpperCase(),
      weight: toFiniteNumber(holding.weight) ?? 0,
      value: toFiniteNumber(holding.value) ?? 0,
      closes: Array.isArray(holding.closes)
        ? holding.closes
            .map((close) => toFiniteNumber(close))
            .filter((close): close is number => close !== null && close > 0)
        : [],
    }))
    .filter(
      (holding) =>
        holding.symbol &&
        holding.weight > 0 &&
        holding.closes.length > 2,
    )

  if (valid.length === 0) {
    return {
      annualVolatility: 0,
      diversificationScore: 0,
      concentration: 0,
      volatilityPct: 0,
      weightedAvgVolatility: 0,
      diversificationBenefit: 0,
      topWeightSymbol: '',
      topWeightPct: 0,
      effectiveHoldings: 0,
      basis: 0,
    }
  }

  const rawWeightSum = valid.reduce((sum, holding) => sum + holding.weight, 0)
  const weights = valid.map((holding) => holding.weight / (rawWeightSum || 1))
  const symbols = valid.map((holding) => holding.symbol)
  const basis = valid.reduce((sum, holding) => sum + holding.value, 0)

  const dailyReturns = valid.map((holding) => calculateDailyReturns(holding.closes))
  const minLen = Math.min(...dailyReturns.map((returns) => returns.length))
  const concentration = weights.reduce((sum, weight) => sum + weight * weight, 0)
  const diversificationScore = Math.max(0, 1 - concentration)

  const topIdx = weights.indexOf(Math.max(...weights))
  const topWeightSymbol = symbols[topIdx] ?? ''
  const topWeightPct = (weights[topIdx] ?? 0) * 100
  const effectiveHoldings = weights.filter(
    (weight) => weight > MEANINGFUL_WEIGHT_THRESHOLD,
  ).length

  if (minLen < 2) {
    return {
      annualVolatility: 0,
      diversificationScore,
      concentration,
      volatilityPct: 0,
      weightedAvgVolatility: 0,
      diversificationBenefit: 0,
      topWeightSymbol,
      topWeightPct,
      effectiveHoldings,
      basis,
    }
  }

  // Cắt cùng độ dài ở phần đuôi để align theo thời gian gần nhất.
  const trimmedReturns = dailyReturns.map((returns) => returns.slice(-minLen))
  const means = trimmedReturns.map((returns) => mean(returns))

  const individualVolatilities = trimmedReturns.map((returns) => {
    return Math.sqrt(sampleVariance(returns)) * Math.sqrt(TRADING_DAYS)
  })

  const n = valid.length
  const covarianceMatrix: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0),
  )

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let covariance = 0

      for (let k = 0; k < minLen; k++) {
        covariance +=
          (trimmedReturns[i][k] - means[i]) *
          (trimmedReturns[j][k] - means[j])
      }

      covariance /= minLen - 1

      covarianceMatrix[i][j] = covariance
      covarianceMatrix[j][i] = covariance
    }
  }

  let portfolioVariance = 0

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      portfolioVariance += weights[i] * weights[j] * covarianceMatrix[i][j]
    }
  }

  portfolioVariance = Math.max(0, portfolioVariance)

  const annualVolatility = Math.sqrt(portfolioVariance) * Math.sqrt(TRADING_DAYS)

  const weightedAvgVolatilityDecimal = weights.reduce(
    (sum, weight, index) => sum + weight * individualVolatilities[index],
    0,
  )

  const diversificationBenefit =
    weightedAvgVolatilityDecimal > 0
      ? Math.max(
          0,
          ((weightedAvgVolatilityDecimal - annualVolatility) /
            weightedAvgVolatilityDecimal) *
            100,
        )
      : 0

  return {
    annualVolatility,
    diversificationScore,
    concentration,
    volatilityPct: annualVolatility * 100,
    weightedAvgVolatility: weightedAvgVolatilityDecimal * 100,
    diversificationBenefit,
    topWeightSymbol,
    topWeightPct,
    effectiveHoldings,
    basis,
  }
  }
