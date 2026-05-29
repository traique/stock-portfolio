import { z } from 'zod';

import {
  getYahooMarketData,
  type MarketData,
} from './providers/yahoo';

import {
  getVciEdgeBatch,
} from './providers/vci-edge';

import {
  isVnIndexSymbol,
  normalizeSymbol,
  getExchange,
} from './exchanges/exchange';

// ─────────────────────────────────────────────
// Schema / Types
// ─────────────────────────────────────────────

export const symbolsQuerySchema = z.object({
  symbols: z.string().optional().default(''),
});

export type PricesPayload = {
  prices: Record<string, number>;
  updatedAt: string;
  provider: string;
  debug: MarketData[];
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildErrorResult(symbol: string): MarketData {
  return {
    symbol, ticker: symbol, provider: 'error',
    price: 0, previousClose: 0, change: 0, pct: 0,
    ceilingPriceEstimate: 0, floorPriceEstimate: 0,
    dayHigh: 0, dayLow: 0, marketTime: null, currency: 'VND', volume: 0,
  };
}

export function normalizeSymbols(raw: string): string[] {
  return [
    ...new Set(raw.split(',').map(normalizeSymbol).filter(Boolean)),
  ];
}

/**
 * Mã VN = có trong EXCHANGE_MAP (HOSE/HNX/UPCOM) hoặc là VNINDEX.
 * Dùng để quyết định có fallback sang VCI Edge hay không.
 */
function isVietnamSymbol(symbol: string): boolean {
  return isVnIndexSymbol(symbol) || getExchange(symbol) !== null;
}

// ─────────────────────────────────────────────
// Main fetch — Yahoo → VCI Edge fallback
// ─────────────────────────────────────────────

export async function fetchMarketPrices(symbols: string[]): Promise<PricesPayload> {
  // Bước 1: gọi Yahoo song song cho tất cả mã
  const yahooSettled = await Promise.allSettled(
    symbols.map(s => getYahooMarketData(s)),
  );

  // Bước 2: tìm mã VN bị Yahoo miss (lỗi hoặc giá = 0)
  const vciNeeded = symbols.filter((s, i) => {
    const r = yahooSettled[i];
    const failed =
      r.status === 'rejected' ||
      !(r as PromiseFulfilledResult<MarketData>).value?.price;
    return failed && isVietnamSymbol(s);
  });

  // Bước 3: gọi VCI Edge một batch duy nhất (tránh nhiều request)
  let vciMap = new Map<string, MarketData>();
  if (vciNeeded.length > 0) {
    vciMap = await getVciEdgeBatch(vciNeeded).catch(err => {
      console.error('[VCI Edge Fallback Fail]', err);
      return new Map<string, MarketData>();
    });
  }

  // Bước 4: gộp kết quả — Yahoo ưu tiên, VCI Edge bù vào chỗ thiếu
  const results: MarketData[] = symbols.map((symbol, i) => {
    const yahoo = yahooSettled[i];
    if (yahoo.status === 'fulfilled' && yahoo.value.price > 0) {
      return yahoo.value;
    }
    return vciMap.get(symbol) ?? buildErrorResult(symbol);
  });

  const prices = Object.fromEntries(
    results.filter(r => r.price > 0).map(r => [r.symbol, r.price]),
  );

  return {
    prices,
    updatedAt: new Date().toISOString(),
    provider: 'yahoo+vci-edge',
    debug: results,
  };
        }
