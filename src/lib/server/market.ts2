import { z } from 'zod';

import {
  getYahooMarketData,
  type MarketData,
} from './providers/yahoo';

import {
  getSSIMarketData,
  isVietnamStock,
} from './providers/ssi';

import {
  normalizeSymbol,
} from './exchanges/exchange';

export const symbolsQuerySchema = z.object({
  symbols: z.string().optional().default(''),
});

export type PricesPayload = {
  prices: Record<string, number>;
  updatedAt: string;
  provider: string;
  debug: MarketData[];
};

function buildErrorResult(
  symbol: string,
): MarketData {
  return {
    symbol,
    ticker: symbol,
    provider: 'error',
    price: 0,
    previousClose: 0,
    change: 0,
    pct: 0,
    ceilingPriceEstimate: 0,
    floorPriceEstimate: 0,
    dayHigh: 0,
    dayLow: 0,
    marketTime: null,
    currency: 'VND',
    volume: 0,
  };
}

export function normalizeSymbols(
  raw: string,
): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map(normalizeSymbol)
        .filter(Boolean),
    ),
  ];
}

async function getMarketData(
  symbol: string,
): Promise<MarketData> {
  // VN stock -> SSI
  if (isVietnamStock(symbol)) {
    try {
      return await getSSIMarketData(symbol);
    } catch (ssiError) {
      console.error(
        `[SSI Fail] ${symbol}`,
        ssiError,
      );
    }
  }

  // Yahoo fallback
  try {
    return await getYahooMarketData(symbol);
  } catch (yahooError) {
    console.error(
      `[Yahoo Fail] ${symbol}`,
      yahooError,
    );
  }

  return buildErrorResult(symbol);
}

export async function fetchMarketPrices(
  symbols: string[],
): Promise<PricesPayload> {
  const settled = await Promise.allSettled(
    symbols.map(getMarketData),
  );

  const results: MarketData[] = settled.map(
    (result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      return buildErrorResult(symbols[index]);
    },
  );

  const prices = Object.fromEntries(
    results
      .filter(item => item.price > 0)
      .map(item => [item.symbol, item.price]),
  );

  return {
    prices,
    updatedAt: new Date().toISOString(),
    provider: 'ssi+yahoo',
    debug: results,
  };
}
