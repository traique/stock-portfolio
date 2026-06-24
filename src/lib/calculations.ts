// src/lib/calculations.ts
// lcta — BẢN CẬP NHẬT
//
// 🧾 GIÁ VỐN & PHÍ:
// • Bạn CỘNG TRỰC TIẾP phí sàn vào giá mua (giá vốn) khi nhập giao dịch.
//   ⇒ Để mặc định, các field `fee`/`tax` = null/0 và code KHÔNG tự tính phí.
// • Nếu sau này muốn tách riêng: điền `fee` (phí) / `tax` (thuế 0,1% khi bán)
//   trên từng lệnh — code sẽ tự áp dụng theo lượng khớp THỰC.
//
// ✨ CỔ TỨC:
// • Cổ tức TIỀN MẶT → CashTransaction.transaction_type = 'DIVIDEND'
//   (cộng vào tiền mặt thực tế, KHÔNG cộng vào vốn gốc ⇒ tính là lãi).
// • Cổ tức CỔ PHIẾU / thưởng → Transaction.transaction_type = 'STOCK_DIVIDEND'
//   (tạo lô giá vốn = 0 ⇒ tổng vốn không đổi, số lượng tăng, giá vốn b/q giảm).
//   Số lượng được LÀM TRÒN XUỐNG số nguyên (đúng VSD/VPS/SSI); phần lẻ công ty
//   trả bằng tiền ⇒ bạn nhập riêng dưới dạng cổ tức tiền mặt.
//
// 🛡️ BÁN VƯỢT / BÁN ÂM:
// • simulateTransactions trả `sellQty` (lượng bán THỰC) cho từng lệnh bán.
// • Tiền bán (sellInflow) tính theo `sellQty` ⇒ không phát sinh "tiền ảo".
// • Luồng hiển thị (non-strict): bán tối đa phần đang có, KHÔNG để vị thế âm.
// • Luồng validate (strict): chặn cứng ngay khi nhập lệnh bán vượt.
//
// 💰 GIÁ VỐN KHI BÁN: theo BÌNH QUÂN GIA QUYỀN toàn bộ số đang nắm (gồm lô cổ
//   tức giá 0), trừ đều theo tỉ lệ — giá vốn b/q phần còn lại GIỮ NGUYÊN.

export type Broker = 'VPS' | 'DNSE' | string;

export type Transaction = {
	id: string;
	user_id: string;
	symbol: string;
	transaction_type: 'BUY' | 'SELL' | 'STOCK_DIVIDEND';
	price: number;
	quantity: number;
	trade_date: string | null;
	note: string | null;
	avg_cost: number | null;
	realized_pnl: number | null;
	created_at: string;
	updated_at: string;
	// Tùy chọn — phục vụ báo cáo / tách phí nếu cần. Mặc định bỏ trống.
	broker?: Broker | null;
	fee?: number | null; // phí giao dịch (để TRỐNG nếu đã cộng vào giá vốn)
	tax?: number | null; // thuế bán 0,1% (để TRỐNG nếu không tách riêng)
};

export type CashTransaction = {
	id: string;
	user_id: string;
	transaction_type: 'DEPOSIT' | 'WITHDRAW' | 'DIVIDEND';
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
	avgCost: number; // giá vốn b/q (đã gồm phí mua nếu bạn cộng vào giá)
	requestedQty: number; // số lượng theo lệnh nhập
	sellQty: number; // số lượng bán THỰC (đã chặn bán vượt)
	grossProceeds: number; // tiền bán gộp = sellQty * price
	fee: number; // phí bán đã áp (theo tỉ lệ khớp)
	tax: number; // thuế bán đã áp (theo tỉ lệ khớp)
	netProceeds: number; // tiền bán thực nhận = gross - fee - tax
	realizedPnl: number; // lãi/lỗ đã thực hiện (net)
	oversold: boolean; // true nếu lệnh bán vượt số đang nắm
};

export type SimulationResult = {
	valid: boolean;
	error?: string;
	openLots: OpenLot[];
	sellMetaById: Record<string, SellMeta>;
	buyOutflow: number; // tổng tiền đã chi để mua (gồm phí mua nếu nhập)
	sellGrossInflow: number; // tổng tiền bán gộp
	sellNetInflow: number; // tổng tiền bán thực nhận (đã trừ phí + thuế nếu nhập)
};

export type PortfolioDerivation = {
	positions: PositionGroup[];
	openLots: OpenLot[];
	enrichedTransactions: Transaction[];
	totalSellOrders: number;
	totalRealizedPnl: number;
	wins: number;
	losses: number;
	realizedSummary: { totalSellOrders: number; totalRealizedPnl: number; wins: number; losses: number };
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
		const da = a.trade_date;
		const db = b.trade_date;
		// Giao dịch KHÔNG có ngày → xếp CUỐI (coi như mới nhất).
		if (da !== db) {
			if (!da) return 1;
			if (!db) return -1;
			return da < db ? -1 : 1;
		}
		if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}

// Mô phỏng toàn bộ lịch sử giao dịch → lô còn mở + lãi/lỗ + dòng tiền nhất quán.
export function simulateTransactions(
	transactions: Transaction[],
	options?: { strict?: boolean },
): SimulationResult {
	const strict = options?.strict === true;
	const lotsBySymbol = new Map<string, Array<{ lot: OpenLot; remaining: number }>>();
	const sellMetaById: Record<string, SellMeta> = {};
	let buyOutflow = 0;
	let sellGrossInflow = 0;
	let sellNetInflow = 0;

	for (const tx of sortTransactions(transactions)) {
		const symbol = String(tx.symbol || '').trim().toUpperCase();
		const rawQty = roundQty(Number(tx.quantity || 0));
		const price = Number(tx.price || 0);
		const isStockDividend = tx.transaction_type === 'STOCK_DIVIDEND';
		if (!symbol || rawQty <= 0) continue;
		if (!isStockDividend && price <= 0) continue;

		// ── BUY / STOCK_DIVIDEND → tạo lô mở mới ──
		if (tx.transaction_type === 'BUY' || isStockDividend) {
			// ✨ Cổ phiếu lẻ từ cổ tức → làm tròn XUỐNG số nguyên. Phần lẻ trả tiền
			//    ⇒ nhập riêng dưới dạng cổ tức tiền mặt (DIVIDEND).
			const lotQty = isStockDividend ? Math.floor(rawQty) : rawQty;
			if (lotQty <= 0) continue;

			// Phí mua (tùy chọn). Để TRỐNG nếu bạn đã cộng phí vào giá vốn ⇒ buyFee = 0.
			const buyFee = isStockDividend ? 0 : Math.max(0, Number(tx.fee || 0));
			const grossCost = isStockDividend ? 0 : price * lotQty + buyFee;
			const effBuyPrice = isStockDividend ? 0 : grossCost / lotQty;

			buyOutflow += grossCost;

			const lot: OpenLot = {
				id: `${tx.id}:lot`,
				user_id: tx.user_id,
				symbol,
				buy_price: effBuyPrice,
				quantity: lotQty,
				buy_date: tx.trade_date || null,
				note: tx.note || null,
				created_at: tx.created_at,
				updated_at: tx.updated_at,
				source_transaction_id: tx.id,
			};
			const queue = lotsBySymbol.get(symbol) ?? [];
			queue.push({ lot, remaining: lotQty });
			lotsBySymbol.set(symbol, queue);
			continue;
		}

		// ── SELL ── giá vốn theo BÌNH QUÂN GIA QUYỀN của toàn bộ lô đang mở ──
		const queue = lotsBySymbol.get(symbol) ?? [];
		const available = roundQty(queue.reduce((s, e) => s + e.remaining, 0));
		const oversold = rawQty > available + EPSILON;

		if (oversold && strict) {
			return {
				valid: false,
				error: `Lệnh bán ${symbol} (${rawQty}) vượt quá số lượng đang nắm giữ (${available}) tại ngày ${tx.trade_date ?? '--'}`,
				openLots: [],
				sellMetaById: {},
				buyOutflow: 0,
				sellGrossInflow: 0,
				sellNetInflow: 0,
			};
		}

		// Luồng hiển thị: bán tối đa phần đang có, KHÔNG để vị thế âm.
		const sellQty = Math.min(rawQty, available);

		const totalCost = queue.reduce((s, e) => s + e.remaining * e.lot.buy_price, 0);
		const avgCost = available > 0 ? totalCost / available : 0;
		const costBasis = sellQty * avgCost;

		// Phí + thuế bán (tùy chọn). Áp theo TỈ LỆ KHỚP để không lệch khi bán vượt.
		const fillRatio = rawQty > 0 ? sellQty / rawQty : 0;
		const fee = Math.max(0, Number(tx.fee || 0)) * fillRatio;
		const tax = Math.max(0, Number(tx.tax || 0)) * fillRatio;

		const grossProceeds = sellQty * price;
		const netProceeds = grossProceeds - fee - tax;

		// Trừ đều theo tỉ lệ ⇒ các lô còn lại GIỮ nguyên giá vốn bình quân.
		const remainRatio = available > 0 ? (available - sellQty) / available : 0;
		for (const entry of queue) {
			entry.remaining = roundQty(entry.remaining * remainRatio);
		}

		sellGrossInflow += grossProceeds;
		sellNetInflow += netProceeds;

		sellMetaById[tx.id] = {
			avgCost,
			requestedQty: rawQty,
			sellQty,
			grossProceeds,
			fee,
			tax,
			netProceeds,
			realizedPnl: netProceeds - costBasis,
			oversold,
		};
	}

	const openLots: OpenLot[] = [];
	for (const queue of lotsBySymbol.values()) {
		for (const { lot, remaining } of queue) {
			if (remaining > EPSILON) {
				openLots.push({ ...lot, symbol: lot.symbol.toUpperCase(), quantity: roundQty(remaining) });
			}
		}
	}

	return { valid: true, openLots, sellMetaById, buyOutflow, sellGrossInflow, sellNetInflow };
}

// Lấy kết quả mô phỏng + gắn avg_cost / realized_pnl vào các lệnh SELL.
export function derivePortfolio(transactions: Transaction[]): PortfolioDerivation {
	const sim = simulateTransactions(transactions);

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
		// Bỏ qua lệnh bán RỖNG (bán từ số 0) để không làm sai win-rate.
		if (!meta || meta.sellQty <= EPSILON) continue;
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
		realizedSummary: { totalSellOrders, totalRealizedPnl, wins, losses },
	};
}

// Validate giao dịch mới trước khi lưu (chặn oversell cho SELL).
export function validateNewTransaction(
	existingTransactions: Transaction[],
	newTx: Pick<Transaction, 'id' | 'user_id' | 'transaction_type' | 'symbol' | 'price' | 'quantity' | 'trade_date' | 'note'>,
): TransactionValidationResult {
	const symbol = String(newTx.symbol || '').trim().toUpperCase();
	const qty = roundQty(Number(newTx.quantity || 0));
	const price = Number(newTx.price || 0);

	if (!symbol) return { valid: false, error: 'Mã cổ phiếu không được để trống' };
	if (qty <= 0) return { valid: false, error: 'Số lượng phải lớn hơn 0' };

	// ✨ Cổ tức cổ phiếu: giá = 0 hợp lệ, chỉ cần qty > 0.
	if (newTx.transaction_type === 'STOCK_DIVIDEND') return { valid: true };
	if (price <= 0) return { valid: false, error: 'Giá phải lớn hơn 0' };

	// Lệnh MUA: không cần kiểm tra thêm.
	if (newTx.transaction_type === 'BUY') return { valid: true };

	// Lệnh BÁN: chạy simulation STRICT để chặn oversell ngay khi nhập.
	const candidateTx: Transaction = {
		...newTx,
		symbol,
		avg_cost: null,
		realized_pnl: null,
		created_at: newTx.trade_date ?? new Date().toISOString(),
		updated_at: newTx.trade_date ?? new Date().toISOString(),
	};
	const sim = simulateTransactions([...existingTransactions, candidateTx], { strict: true });
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

// Tổng hợp tiền mặt. Dòng tiền mua/bán lấy từ simulation ⇒ nhất quán, không "tiền ảo".
export function calcCashSummary(
	cashTransactions: CashTransaction[],
	transactions: Transaction[],
	portfolioSettings?: PortfolioSettings | null,
) {
	const sim = simulateTransactions(transactions);

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

	// Mua: tổng tiền đã chi (gồm phí mua nếu nhập). Bán: tiền thực nhận (đã trừ phí + thuế nếu nhập).
	const buyOutflow = sim.buyOutflow;
	const sellInflow = sim.sellNetInflow;

	// Vốn gốc CHỈ gồm tiền nạp − rút (KHÔNG gồm cổ tức) ⇒ cổ tức được tính là lãi.
	const netCapital = deposits - withdraws;
	// Tiền mặt thực tế CÓ cộng cổ tức tiền mặt đã nhận.
	const calculatedCash = deposits - withdraws + dividends - buyOutflow + sellInflow;
	const cashAdjustment = Number(portfolioSettings?.cash_adjustment || 0);
	const actualCash = calculatedCash + cashAdjustment;

	return {
		deposits,
		withdraws,
		dividends,
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
	annualVolatility: number;       // ← volatilityPct (%)
	diversificationScore: number;   // ← giá trị 0-1 (1 = perfectly diversified)
	concentration: number;          // ← HHI (Herfindahl index), 0-1
	// ✨ Expanded fields (Phase 3 — thêm theo prompt AI):
	volatilityPct: number;          // annualVolatility × 100
	weightedAvgVolatility: number;  // ← weightedAvgVolPct: trung bình vol của từng mã, weighted
	diversificationBenefit: number; // ← diversificationBenefitPct: % lợi thế từ đa dạng
	topWeightSymbol: string;        // ← mã chiếm tỷ trọng cao nhất
	topWeightPct: number;           // ← tỷ trọng cao nhất (0-100)
	effectiveHoldings: number;      // ← số lượng mã có tỷ trọng > threshold
	basis: number;                  // ← tổng vốn (VND)
};

const TRADING_DAYS = 252;
const MEANINGFUL_WEIGHT_THRESHOLD = 0.01; // 1% để tính effectiveHoldings

// Rủi ro danh mục: biến động năm hóa từ ma trận hiệp phương sai + độ tập trung + thêm fields cho AI.
export function calcPortfolioRisk(
	holdings: Array<{ symbol: string; weight: number; closes: number[]; value?: number }>,
): PortfolioRisk {
	const valid = holdings.filter((h) => h.closes && h.closes.length > 2 && h.weight > 0);
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
		};
	}

	const weightSum = valid.reduce((s, h) => s + h.weight, 0);
	const weights = valid.map((h) => h.weight / (weightSum || 1));
	const symbols = valid.map((h) => h.symbol);

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
		const topIdx = weights.indexOf(Math.max(...weights));
		const basis = valid.reduce((s, h) => s + (h.value ?? 0), 0);
		return {
			annualVolatility: 0,
			diversificationScore: 1 - concentration,
			concentration,
			volatilityPct: 0,
			weightedAvgVolatility: 0,
			diversificationBenefit: 0,
			topWeightSymbol: symbols[topIdx] ?? '',
			topWeightPct: weights[topIdx] * 100,
			effectiveHoldings: weights.filter(w => w > MEANINGFUL_WEIGHT_THRESHOLD).length,
			basis,
		};
	}

	const trimmed = dailyReturns.map((r) => r.slice(r.length - minLen));
	const means = trimmed.map((r) => r.reduce((s, x) => s + x, 0) / r.length);

	// ✨ Tính volatility từng mã để dùng cho weightedAvgVolatility
	const individualVolatilities = trimmed.map((r, i) => {
		const variance = r.reduce((s, x) => s + (x - means[i]) ** 2, 0) / (r.length - 1);
		return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS);
	});

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

	// ✨ Weighted average volatility (từng mã weighted theo tỷ trọng)
	const weightedAvgVolatility = weights.reduce((s, w, i) => s + w * individualVolatilities[i], 0);

	// ✨ Diversification benefit: % lợi thế từ đa dạng
	// Công thức: (vol_avg - vol_portfolio) / vol_avg * 100
	const diversificationBenefit =
		weightedAvgVolatility > 0
			? Math.max(0, (weightedAvgVolatility - annualVolatility) / weightedAvgVolatility * 100)
			: 0;

	// ✨ Top weight
	const topIdx = weights.indexOf(Math.max(...weights));
	const topWeightSymbol = symbols[topIdx] ?? '';
	const topWeightPct = weights[topIdx] * 100;

	// ✨ Effective holdings (có tỷ trọng > 1%)
	const effectiveHoldings = weights.filter(w => w > MEANINGFUL_WEIGHT_THRESHOLD).length;

	// ✨ Basis (tổng vốn)
	const basis = valid.reduce((s, h) => s + (h.value ?? 0), 0);

	return {
		annualVolatility,
		diversificationScore,
		concentration,
		volatilityPct: annualVolatility * 100,
		weightedAvgVolatility: weightedAvgVolatility * 100,
		diversificationBenefit,
		topWeightSymbol,
		topWeightPct,
		effectiveHoldings,
		basis,
	};
}

