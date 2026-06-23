import { describe, it, expect } from 'vitest';
import {
  simulateTransactions,
  derivePortfolio,
  validateNewTransaction,
  groupHoldingsBySymbol,
  calcHolding,
  calcPosition,
  calcSummary,
  calcCashSummary,
  formatCurrency,
  type Transaction,
  type CashTransaction,
  type OpenLot,
} from '../calculations';
// ⚠️ calcRealizedSummary / enrichTransactions không còn được export riêng —
// chức năng tương đương đã gộp vào derivePortfolio() (.realizedSummary / .enrichedTransactions).

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

let _id = 0;
function tx(
  type: 'BUY' | 'SELL',
  symbol: string,
  qty: number,
  price: number,
  trade_date = '2024-01-01',
  id?: string,
): Transaction {
  const txId = id ?? `tx-${++_id}`;
  return {
    id: txId,
    user_id: 'u1',
    symbol,
    transaction_type: type,
    price,
    quantity: qty,
    trade_date,
    note: null,
    avg_cost: null,
    realized_pnl: null,
    created_at: `${trade_date}T00:00:00Z`,
    updated_at: `${trade_date}T00:00:00Z`,
  };
}

function cashTx(
  type: 'DEPOSIT' | 'WITHDRAW',
  amount: number,
  date = '2024-01-01',
): CashTransaction {
  return {
    id: `c-${++_id}`,
    user_id: 'u1',
    transaction_type: type,
    amount,
    transaction_date: date,
    note: null,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// simulateTransactions
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateTransactions', () => {
  describe('BUY only', () => {
    it('tạo open lot đúng từ 1 lệnh BUY', () => {
      const r = simulateTransactions([tx('BUY', 'VNM', 100, 80_000)]);
      expect(r.valid).toBe(true);
      expect(r.openLots).toHaveLength(1);
      expect(r.openLots[0].quantity).toBe(100);
      expect(r.openLots[0].buy_price).toBe(80_000);
      expect(r.openLots[0].symbol).toBe('VNM');
    });

    it('tạo 2 open lots độc lập từ 2 lệnh BUY khác ngày', () => {
      const r = simulateTransactions([
        tx('BUY', 'VNM', 100, 80_000, '2024-01-01'),
        tx('BUY', 'VNM', 50,  85_000, '2024-01-02'),
      ]);
      expect(r.valid).toBe(true);
      expect(r.openLots).toHaveLength(2);
    });

    it('xử lý nhiều mã khác nhau độc lập', () => {
      const r = simulateTransactions([
        tx('BUY', 'VNM', 100, 80_000),
        tx('BUY', 'HPG', 200, 20_000),
        tx('BUY', 'TCB', 300, 30_000),
      ]);
      expect(r.valid).toBe(true);
      expect(r.openLots).toHaveLength(3);
      const symbols = r.openLots.map(l => l.symbol).sort();
      expect(symbols).toEqual(['HPG', 'TCB', 'VNM']);
    });
  });

  // ⚠️ Code hiện tại tính giá vốn khi bán theo BÌNH QUÂN GIA QUYỀN trên TOÀN BỘ
  // lô đang mở (không phải FIFO): khi bán, mọi lô bị trừ ĐỀU theo tỉ lệ
  // (sellQty / available), nên các lô cũ không "hết trước" — chúng chỉ co lại
  // theo cùng tỉ lệ và avgCost của phần còn lại GIỮ NGUYÊN. Block dưới đây test
  // đúng hành vi này (xem comment đầu file calculations.ts, mục "GIÁ VỐN KHI BÁN").
  describe('Bán theo bình quân gia quyền (weighted-average, KHÔNG phải FIFO)', () => {
    it('bán một phần → mọi lô co lại theo CÙNG tỉ lệ, không lô nào hết trước', () => {
      const r = simulateTransactions([
        tx('BUY',  'VNM', 100, 80_000, '2024-01-01'),
        tx('BUY',  'VNM',  50, 90_000, '2024-01-02'),
        tx('SELL', 'VNM', 100, 95_000, '2024-01-03'),
      ]);
      expect(r.valid).toBe(true);
      // available=150, bán 100 → còn lại 50 chia đều tỉ lệ cho CẢ 2 lô (1/3 mỗi lô)
      expect(r.openLots).toHaveLength(2);
      const lotA = r.openLots.find(l => l.buy_price === 80_000)!;
      const lotB = r.openLots.find(l => l.buy_price === 90_000)!;
      expect(lotA.quantity).toBeCloseTo(100 / 3, 6);
      expect(lotB.quantity).toBeCloseTo(50 / 3, 6);
      expect(lotA.quantity + lotB.quantity).toBeCloseTo(50, 6);
    });

    it('avgCost khi bán = bình quân gia quyền trên TOÀN BỘ lô đang mở tại thời điểm bán', () => {
      const sell = tx('SELL', 'VNM', 100, 95_000, '2024-01-03', 's1');
      const r = simulateTransactions([
        tx('BUY', 'VNM', 100, 80_000, '2024-01-01'),
        tx('BUY', 'VNM',  50, 90_000, '2024-01-02'),
        sell,
      ]);
      const expectedAvgCost = (100 * 80_000 + 50 * 90_000) / 150; // = 83_333.33...
      expect(r.sellMetaById['s1'].avgCost).toBeCloseTo(expectedAvgCost, 6);
      expect(r.sellMetaById['s1'].realizedPnl).toBeCloseTo(100 * 95_000 - 100 * expectedAvgCost, 6);
    });

    it('bán vắt qua 2 lô (cross-lot) → avgCost tính trên cả 2 lô, cả 2 lô cùng co lại', () => {
      const sell = tx('SELL', 'HPG', 150, 25_000, '2024-01-03', 's1');
      const r = simulateTransactions([
        tx('BUY', 'HPG', 100, 20_000, '2024-01-01'),
        tx('BUY', 'HPG', 100, 22_000, '2024-01-02'),
        sell,
      ]);
      expect(r.valid).toBe(true);
      // available=200, bán 150 → còn lại 50, chia đều tỉ lệ 25% cho mỗi lô 100
      expect(r.openLots).toHaveLength(2);
      expect(r.openLots.map(l => l.quantity).sort((a, b) => a - b)).toEqual([25, 25]);

      const expectedAvgCost = (100 * 20_000 + 100 * 22_000) / 200; // = 21_000 (chẵn)
      expect(r.sellMetaById['s1'].avgCost).toBe(expectedAvgCost);
      expect(r.sellMetaById['s1'].realizedPnl).toBe(150 * 25_000 - 150 * expectedAvgCost);
    });

    it('bán đúng bằng tổng tất cả lô → 0 lô còn lại', () => {
      const r = simulateTransactions([
        tx('BUY',  'MBB', 100, 20_000, '2024-01-01'),
        tx('BUY',  'MBB', 100, 22_000, '2024-01-02'),
        tx('SELL', 'MBB', 200, 25_000, '2024-01-03'),
      ]);
      expect(r.valid).toBe(true);
      expect(r.openLots).toHaveLength(0);
    });

    it('nhiều lệnh bán liên tiếp → avgCost phần còn lại GIỮ NGUYÊN qua mỗi lần bán', () => {
      const s1 = tx('SELL', 'VIC', 100, 50_000, '2024-01-03', 's1');
      const s2 = tx('SELL', 'VIC', 100, 55_000, '2024-01-04', 's2');
      const r = simulateTransactions([
        tx('BUY', 'VIC', 100, 40_000, '2024-01-01'),
        tx('BUY', 'VIC', 100, 45_000, '2024-01-02'),
        s1, s2,
      ]);
      expect(r.valid).toBe(true);
      expect(r.openLots).toHaveLength(0);
      // Vì cả 2 lô co lại CÙNG tỉ lệ ở mỗi lần bán, avgCost không đổi giữa s1 và s2.
      const expectedAvgCost = (100 * 40_000 + 100 * 45_000) / 200; // = 42_500
      expect(r.sellMetaById['s1'].avgCost).toBe(expectedAvgCost);
      expect(r.sellMetaById['s2'].avgCost).toBe(expectedAvgCost);
    });

    it('thứ tự sort: giao dịch cùng ngày sort theo created_at, không phụ thuộc thứ tự mảng đầu vào', () => {
      // Truyền mảng KHÔNG theo thứ tự thời gian (b2 trước b1) — hàm phải tự sort lại
      // theo trade_date rồi created_at trước khi simulate.
      const b1 = { ...tx('BUY', 'VNM', 100, 40_000, '2024-01-01', 'aaa'), created_at: '2024-01-01T08:00:00Z' };
      const b2 = { ...tx('BUY', 'VNM', 100, 50_000, '2024-01-01', 'bbb'), created_at: '2024-01-01T09:00:00Z' };
      const sell = tx('SELL', 'VNM', 100, 60_000, '2024-01-02', 's1');
      const r = simulateTransactions([b2, b1, sell]);
      expect(r.valid).toBe(true);
      const expectedAvgCost = (100 * 40_000 + 100 * 50_000) / 200; // = 45_000
      expect(r.sellMetaById['s1'].avgCost).toBe(expectedAvgCost);
    });
  });

  // ⚠️ Theo mặc định (không truyền option), simulateTransactions KHÔNG chặn bán
  // vượt — nó chỉ giới hạn sellQty = min(rawQty, available) để hiển thị (xem
  // comment đầu file: "Luồng hiển thị (non-strict): bán tối đa phần đang có").
  // Chỉ khi truyền { strict: true } mới trả valid:false ngay khi gặp lệnh bán vượt
  // — đây là chế độ dùng trong validateNewTransaction() khi nhập liệu mới.
  describe('Oversell validation (strict mode)', () => {
    it('bán vượt số lượng → valid: false + error message', () => {
      const r = simulateTransactions([
        tx('BUY',  'TCB', 100, 20_000),
        tx('SELL', 'TCB', 101, 25_000),
      ], { strict: true });
      expect(r.valid).toBe(false);
      expect(r.error).toContain('TCB');
      expect(r.openLots).toHaveLength(0);
      expect(r.sellMetaById).toEqual({});
    });

    it('bán khi chưa có lô nào → valid: false', () => {
      const r = simulateTransactions([
        tx('SELL', 'VNM', 100, 25_000),
      ], { strict: true });
      expect(r.valid).toBe(false);
    });

    it('bán đúng sau khi đã bán hết trước đó → valid: false', () => {
      const r = simulateTransactions([
        tx('BUY',  'HPG', 100, 20_000, '2024-01-01'),
        tx('SELL', 'HPG', 100, 25_000, '2024-01-02'),
        tx('SELL', 'HPG',   1, 26_000, '2024-01-03'), // không còn gì để bán
      ], { strict: true });
      expect(r.valid).toBe(false);
    });

    it('lệnh oversell làm dừng TOÀN BỘ simulation (trả invalid toàn cục, không chỉ riêng mã đó)', () => {
      const r = simulateTransactions([
        tx('BUY',  'VNM', 100, 80_000),
        tx('BUY',  'HPG', 100, 20_000),
        tx('SELL', 'VNM', 200, 90_000), // oversell VNM
      ], { strict: true });
      // Toàn bộ simulation dừng lại khi gặp lỗi — kể cả dữ liệu của HPG cũng không trả về.
      expect(r.valid).toBe(false);
    });

    it('không truyền strict (mặc định) → KHÔNG chặn, chỉ giới hạn sellQty về phần đang có', () => {
      const r = simulateTransactions([
        tx('BUY',  'TCB', 100, 20_000, '2024-01-01'),
        tx('SELL', 'TCB', 150, 25_000, '2024-01-02', 's1'),
      ]); // không có { strict: true }
      expect(r.valid).toBe(true);
      expect(r.sellMetaById['s1'].requestedQty).toBe(150);
      expect(r.sellMetaById['s1'].sellQty).toBe(100); // cắt về đúng số đang có
      expect(r.sellMetaById['s1'].oversold).toBe(true);
      expect(r.openLots).toHaveLength(0); // không để vị thế âm
    });
  });

  describe('Floating-point edge cases', () => {
    it('bán đúng 0.1+0.2=0.3 không bị lỗi floating-point', () => {
      const r = simulateTransactions([
        tx('BUY',  'VNM', 0.1, 80_000, '2024-01-01'),
        tx('BUY',  'VNM', 0.2, 85_000, '2024-01-02'),
        tx('SELL', 'VNM', 0.3, 90_000, '2024-01-03'),
      ]);
      expect(r.valid).toBe(true);
      expect(r.openLots).toHaveLength(0);
    });

    it('remaining sau nhiều giao dịch không xuống âm', () => {
      const r = simulateTransactions([
        tx('BUY',  'TCB', 1000, 20_000, '2024-01-01'),
        tx('SELL', 'TCB',  333, 25_000, '2024-01-02'),
        tx('SELL', 'TCB',  333, 26_000, '2024-01-03'),
        tx('SELL', 'TCB',  334, 27_000, '2024-01-04'),
      ]);
      expect(r.valid).toBe(true);
      expect(r.openLots).toHaveLength(0);
    });
  });

  describe('Immutability', () => {
    it('không mutate mảng giao dịch gốc', () => {
      const txs = [
        tx('BUY',  'VNM', 100, 80_000),
        tx('SELL', 'VNM',  50, 90_000),
      ];
      const originalQty0 = txs[0].quantity;
      const originalQty1 = txs[1].quantity;
      simulateTransactions(txs);
      expect(txs[0].quantity).toBe(originalQty0);
      expect(txs[1].quantity).toBe(originalQty1);
    });

    it('gọi 2 lần cùng input → cùng kết quả (idempotent)', () => {
      const txs = [
        tx('BUY',  'HPG', 100, 20_000),
        tx('SELL', 'HPG',  60, 25_000),
      ];
      const r1 = simulateTransactions(txs);
      const r2 = simulateTransactions(txs);
      expect(r1.openLots[0].quantity).toBe(r2.openLots[0].quantity);
      expect(r1.openLots[0].buy_price).toBe(r2.openLots[0].buy_price);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// derivePortfolio
// ─────────────────────────────────────────────────────────────────────────────

describe('derivePortfolio', () => {
  it('trả đủ các trường kết quả', () => {
    const r = derivePortfolio([tx('BUY', 'VNM', 100, 80_000)]);
    expect(r).toHaveProperty('openLots');
    expect(r).toHaveProperty('enrichedTransactions');
    expect(r).toHaveProperty('positions');
    expect(r).toHaveProperty('realizedSummary');
    expect(r).toHaveProperty('totalSellOrders');
    expect(r).toHaveProperty('totalRealizedPnl');
    expect(r).toHaveProperty('wins');
    expect(r).toHaveProperty('losses');
  });

  it('totalSellOrders/totalRealizedPnl/wins/losses ở top-level khớp với realizedSummary', () => {
    const r = derivePortfolio([
      tx('BUY',  'VNM', 100, 80_000, '2024-01-01'),
      tx('SELL', 'VNM', 100, 90_000, '2024-01-02'),
    ]);
    expect(r.totalSellOrders).toBe(r.realizedSummary.totalSellOrders);
    expect(r.totalRealizedPnl).toBe(r.realizedSummary.totalRealizedPnl);
    expect(r.wins).toBe(r.realizedSummary.wins);
    expect(r.losses).toBe(r.realizedSummary.losses);
  });

  it('simulation chỉ chạy 1 lần — enrichedTxs nhất quán với openLots', () => {
    const sellTx = tx('SELL', 'VNM', 100, 90_000, '2024-01-02', 's1');
    const r = derivePortfolio([
      tx('BUY', 'VNM', 100, 80_000, '2024-01-01'),
      sellTx,
    ]);
    const enrichedSell = r.enrichedTransactions.find(t => t.id === 's1');
    expect(enrichedSell?.realized_pnl).toBe(100 * 90_000 - 100 * 80_000);
    expect(enrichedSell?.avg_cost).toBe(80_000);
    expect(r.openLots).toHaveLength(0);
  });

  it('realizedSummary đếm wins/losses đúng', () => {
    const r = derivePortfolio([
      tx('BUY',  'VNM', 100, 80_000, '2024-01-01'),
      tx('SELL', 'VNM',  50, 90_000, '2024-01-02'), // lãi
      tx('BUY',  'HPG', 100, 25_000, '2024-01-01'),
      tx('SELL', 'HPG',  50, 20_000, '2024-01-03'), // lỗ
    ]);
    expect(r.realizedSummary.wins).toBe(1);
    expect(r.realizedSummary.losses).toBe(1);
    expect(r.realizedSummary.totalSellOrders).toBe(2);
  });

  it('positions = groupHoldingsBySymbol(openLots)', () => {
    const r = derivePortfolio([
      tx('BUY', 'VNM', 100, 80_000),
      tx('BUY', 'HPG', 200, 20_000),
    ]);
    expect(r.positions).toHaveLength(2);
    expect(r.positions.map(p => p.symbol).sort()).toEqual(['HPG', 'VNM']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateNewTransaction
// ─────────────────────────────────────────────────────────────────────────────

describe('validateNewTransaction', () => {
  const base = {
    id: 'new-1',
    user_id: 'u1',
    note: null,
    trade_date: '2024-01-05',
  };

  it('BUY hợp lệ luôn pass', () => {
    const r = validateNewTransaction([], {
      ...base, transaction_type: 'BUY', symbol: 'VNM', quantity: 100, price: 80_000,
    });
    expect(r.valid).toBe(true);
  });

  it('SELL hợp lệ khi đủ số lượng', () => {
    const existing = [tx('BUY', 'VNM', 100, 80_000, '2024-01-01')];
    const r = validateNewTransaction(existing, {
      ...base, transaction_type: 'SELL', symbol: 'VNM', quantity: 100, price: 90_000,
    });
    expect(r.valid).toBe(true);
  });

  it('SELL vượt số lượng → valid: false + error', () => {
    const existing = [tx('BUY', 'VNM', 100, 80_000, '2024-01-01')];
    const r = validateNewTransaction(existing, {
      ...base, transaction_type: 'SELL', symbol: 'VNM', quantity: 101, price: 90_000,
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.error).toContain('VNM');
  });

  it('SELL khi chưa có lô → valid: false', () => {
    const r = validateNewTransaction([], {
      ...base, transaction_type: 'SELL', symbol: 'VNM', quantity: 1, price: 90_000,
    });
    expect(r.valid).toBe(false);
  });

  it('symbol rỗng → valid: false', () => {
    const r = validateNewTransaction([], {
      ...base, transaction_type: 'BUY', symbol: '', quantity: 100, price: 80_000,
    });
    expect(r.valid).toBe(false);
  });

  it('quantity = 0 → valid: false', () => {
    const r = validateNewTransaction([], {
      ...base, transaction_type: 'BUY', symbol: 'VNM', quantity: 0, price: 80_000,
    });
    expect(r.valid).toBe(false);
  });

  it('price = 0 → valid: false', () => {
    const r = validateNewTransaction([], {
      ...base, transaction_type: 'BUY', symbol: 'VNM', quantity: 100, price: 0,
    });
    expect(r.valid).toBe(false);
  });

  it('symbol lowercase → tự uppercase, vẫn valid', () => {
    const existing = [tx('BUY', 'VNM', 100, 80_000, '2024-01-01')];
    const r = validateNewTransaction(existing, {
      ...base, transaction_type: 'SELL', symbol: 'vnm', quantity: 50, price: 90_000,
    });
    expect(r.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupHoldingsBySymbol
// ─────────────────────────────────────────────────────────────────────────────

describe('groupHoldingsBySymbol', () => {
  function lot(symbol: string, qty: number, buyPrice: number, buyDate = '2024-01-01'): OpenLot {
    return {
      id: `lot-${++_id}`, user_id: 'u1', symbol, buy_price: buyPrice,
      quantity: qty, buy_date: buyDate, note: null,
      created_at: `${buyDate}T00:00:00Z`, updated_at: `${buyDate}T00:00:00Z`,
      source_transaction_id: `tx-${_id}`,
    };
  }

  it('gộp đúng 2 lô cùng mã → avgBuyPrice bình quân gia quyền', () => {
    const positions = groupHoldingsBySymbol([
      lot('VNM', 100, 80_000),
      lot('VNM',  50, 90_000),
    ]);
    expect(positions).toHaveLength(1);
    const p = positions[0];
    expect(p.symbol).toBe('VNM');
    expect(p.quantity).toBe(150);
    expect(p.totalBuy).toBe(100 * 80_000 + 50 * 90_000);
    expect(p.avgBuyPrice).toBeCloseTo((100 * 80_000 + 50 * 90_000) / 150, 6);
  });

  it('2 mã khác nhau → 2 position', () => {
    const positions = groupHoldingsBySymbol([
      lot('VNM', 100, 80_000),
      lot('HPG', 200, 20_000),
    ]);
    expect(positions).toHaveLength(2);
  });

  it('symbol lowercase → normalize thành uppercase', () => {
    const positions = groupHoldingsBySymbol([lot('vnm', 100, 80_000)]);
    expect(positions[0].symbol).toBe('VNM');
  });

  it('sort theo symbol (alphabet)', () => {
    const positions = groupHoldingsBySymbol([
      lot('VNM', 100, 80_000),
      lot('ACB', 100, 20_000),
      lot('HPG', 100, 25_000),
    ]);
    expect(positions.map(p => p.symbol)).toEqual(['ACB', 'HPG', 'VNM']);
  });

  it('holdings giữ đúng thứ tự đầu vào (KHÔNG tự sort lại theo buy_date)', () => {
    const positions = groupHoldingsBySymbol([
      lot('VNM', 50, 85_000, '2024-01-03'),
      lot('VNM', 100, 80_000, '2024-01-01'),
    ]);
    // groupHoldingsBySymbol chỉ gom theo symbol, không sort lại holdings[] —
    // nếu cần hiển thị theo thời gian, phải tự sort ở phía gọi.
    expect(positions[0].holdings[0].buy_date).toBe('2024-01-03');
    expect(positions[0].holdings[1].buy_date).toBe('2024-01-01');
    // latestBuyDate thì luôn đúng (tính max), không phụ thuộc thứ tự holdings.
    expect(positions[0].latestBuyDate).toBe('2024-01-03');
  });

  it('mảng rỗng → mảng rỗng', () => {
    expect(groupHoldingsBySymbol([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcHolding, calcPosition, calcSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('calcHolding', () => {
  function openLot(symbol: string, qty: number, buyPrice: number): OpenLot {
    return {
      id: `lot-${++_id}`, user_id: 'u1', symbol, buy_price: buyPrice,
      quantity: qty, buy_date: '2024-01-01', note: null,
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
      source_transaction_id: `tx-${_id}`,
    };
  }

  it('tính P&L đúng khi có giá hiện tại', () => {
    const r = calcHolding(openLot('VNM', 100, 80_000), { VNM: 90_000 });
    expect(r.cost).toBe(8_000_000);
    expect(r.value).toBe(9_000_000);
    expect(r.pnl).toBe(1_000_000);
    expect(r.pnlPct).toBeCloseTo(12.5, 6);
  });

  it('pnl âm khi giá giảm', () => {
    const r = calcHolding(openLot('VNM', 100, 80_000), { VNM: 70_000 });
    expect(r.pnl).toBe(-1_000_000);
    expect(r.pnlPct).toBeCloseTo(-12.5, 6);
  });

  it('giá hiện tại không có trong price map → fallback về buyPrice (pnl=0, không NaN)', () => {
    // calcHolding dùng `prices[symbol] ?? buyPrice` — thiếu giá thì coi như chưa
    // đổi giá (breakeven), KHÔNG phải value=0.
    const r = calcHolding(openLot('VNM', 100, 80_000), {});
    expect(r.now).toBe(80_000);
    expect(r.value).toBe(8_000_000);
    expect(r.pnl).toBe(0);
    expect(Number.isFinite(r.pnlPct)).toBe(true);
  });
});

describe('calcPosition', () => {
  it('tính đúng P&L từ PositionGroup', () => {
    const { positions } = derivePortfolio([
      tx('BUY', 'VNM', 100, 80_000, '2024-01-01'),
      tx('BUY', 'VNM',  50, 90_000, '2024-01-02'),
    ]);
    const r = calcPosition(positions[0], { VNM: 85_000 });
    expect(r.cost).toBe(100 * 80_000 + 50 * 90_000);
    expect(r.value).toBe(150 * 85_000);
    expect(r.pnl).toBe(150 * 85_000 - (100 * 80_000 + 50 * 90_000));
  });
});

describe('calcSummary', () => {
  it('tổng hợp tất cả position đúng', () => {
    // calcSummary nhận PositionGroup[] (không phải OpenLot[]) — lấy từ .positions
    const { positions } = derivePortfolio([
      tx('BUY', 'VNM', 100, 80_000),
      tx('BUY', 'HPG', 200, 20_000),
    ]);
    const r = calcSummary(positions, { VNM: 90_000, HPG: 22_000 });
    expect(r.totalCost).toBe(100 * 80_000 + 200 * 20_000);
    expect(r.totalNow).toBe(100 * 90_000 + 200 * 22_000);
    expect(r.totalPnl).toBe(r.totalNow - r.totalCost);
  });

  it('không có holdings → tất cả bằng 0', () => {
    const r = calcSummary([], {});
    expect(r).toEqual({ totalCost: 0, totalNow: 0, totalPnl: 0, totalPnlPct: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcCashSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('calcCashSummary', () => {
  it('tính tiền mặt đúng: deposit - withdraw - buy + sell', () => {
    const cash = [cashTx('DEPOSIT', 10_000_000), cashTx('WITHDRAW', 1_000_000)];
    const txs  = [
      tx('BUY',  'VNM', 100, 80_000),  // -8_000_000
      tx('SELL', 'VNM',  50, 90_000),  // +4_500_000
    ];
    const r = calcCashSummary(cash, txs);
    expect(r.deposits).toBe(10_000_000);
    expect(r.withdraws).toBe(1_000_000);
    expect(r.buyOutflow).toBe(8_000_000);
    expect(r.sellInflow).toBe(4_500_000);
    expect(r.netCapital).toBe(9_000_000);
    expect(r.calculatedCash).toBe(10_000_000 - 1_000_000 - 8_000_000 + 4_500_000);
    expect(r.actualCash).toBe(r.calculatedCash); // no adjustment
  });

  it('cash_adjustment được cộng vào actualCash', () => {
    const cash = [cashTx('DEPOSIT', 10_000_000)];
    const r    = calcCashSummary(cash, [], { user_id: 'u1', cash_adjustment: 500_000 });
    expect(r.actualCash).toBe(10_000_000 + 500_000);
  });

  it('cash_adjustment âm trừ vào actualCash', () => {
    const cash = [cashTx('DEPOSIT', 10_000_000)];
    const r    = calcCashSummary(cash, [], { user_id: 'u1', cash_adjustment: -200_000 });
    expect(r.actualCash).toBe(10_000_000 - 200_000);
  });

  it('không có giao dịch nào → tất cả bằng 0', () => {
    const r = calcCashSummary([], []);
    expect(r.actualCash).toBe(0);
    expect(r.netCapital).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcRealizedSummary & enrichTransactions (legacy wrappers)
// ─────────────────────────────────────────────────────────────────────────────

describe('derivePortfolio().realizedSummary (thay calcRealizedSummary cũ)', () => {
  it('tổng hợp wins/losses/totalPnl đúng', () => {
    const txs = [
      tx('BUY',  'VNM', 100, 80_000, '2024-01-01'),
      tx('SELL', 'VNM',  50, 90_000, '2024-01-02'), // lãi 500k
      tx('BUY',  'HPG', 100, 25_000, '2024-01-01'),
      tx('SELL', 'HPG',  50, 20_000, '2024-01-03'), // lỗ 250k
    ];
    const r = derivePortfolio(txs).realizedSummary;
    expect(r.totalSellOrders).toBe(2);
    expect(r.wins).toBe(1);
    expect(r.losses).toBe(1);
    expect(r.totalRealizedPnl).toBe(50 * 90_000 - 50 * 80_000 + 50 * 20_000 - 50 * 25_000);
  });

  it('không có lệnh SELL → tất cả bằng 0', () => {
    const r = derivePortfolio([tx('BUY', 'VNM', 100, 80_000)]).realizedSummary;
    expect(r).toEqual({ totalSellOrders: 0, totalRealizedPnl: 0, wins: 0, losses: 0 });
  });
});

describe('derivePortfolio().enrichedTransactions (thay enrichTransactions cũ)', () => {
  it('gắn avg_cost và realized_pnl cho lệnh SELL', () => {
    const txs = [
      tx('BUY',  'VNM', 100, 80_000, '2024-01-01'),
      { ...tx('SELL', 'VNM', 100, 90_000, '2024-01-02'), id: 's1' },
    ];
    const enriched = derivePortfolio(txs).enrichedTransactions;
    const sell     = enriched.find(t => t.id === 's1')!;
    expect(sell.avg_cost).toBe(80_000);
    expect(sell.realized_pnl).toBe(100 * 90_000 - 100 * 80_000);
  });

  it('không thay đổi lệnh BUY', () => {
    const txs      = [tx('BUY', 'VNM', 100, 80_000)];
    const enriched = derivePortfolio(txs).enrichedTransactions;
    expect(enriched[0].avg_cost).toBeNull();
    expect(enriched[0].realized_pnl).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatCurrency
// ─────────────────────────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('format số dương thành chuỗi VND', () => {
    const s = formatCurrency(1_000_000);
    expect(s).toContain('1');
    // vi-VN locale dùng ký hiệu ₫ (U+20AB)
    expect(s).toMatch(/₫|VND|đ/);
  });

  it('format 0 không crash', () => {
    expect(() => formatCurrency(0)).not.toThrow();
  });

  it('format NaN/Infinity không crash, trả về chuỗi', () => {
    expect(typeof formatCurrency(NaN)).toBe('string');
    expect(typeof formatCurrency(Infinity)).toBe('string');
  });
});
