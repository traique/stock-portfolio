import { z } from 'zod';

import {
  getYahooMarketData,
  type MarketData,
} from './providers/yahoo';

import {
  getTradingViewMarketData,
} from './providers/tradingview';

import {
  getTCBSMarketData,
  isVietnamStock,
} from './providers/tcbs';

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
  // VN stock -> TCBS first
  if (isVietnamStock(symbol)) {
    try {
      return await getTCBSMarketData(symbol);
    } catch (tcbsError) {
      console.error(
        `[TCBS Fail] ${symbol}`,
        tcbsError,
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

  // TradingView fallback cuối
  try {
    return await getTradingViewMarketData(symbol);
  } catch (tvError) {
    console.error(
      `[TradingView Fail] ${symbol}`,
      tvError,
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
    provider: 'hybrid',
    debug: results,
  };
}
```ts
import { z } from 'zod';

import {
  getYahooMarketData,
  type MarketData,
} from './providers/yahoo';

import {
  getTradingViewMarketData,
  shouldUseTradingViewFirst,
} from './providers/tradingview';

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
  error: unknown,
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
  // HNX + UPCOM ưu tiên TradingView
  if (shouldUseTradingViewFirst(symbol)) {
    try {
      return await getTradingViewMarketData(symbol);
    } catch (tvError) {
      console.error(
        `[TradingView First Fail] ${symbol}`,
        tvError,
      );
    }
  }

  // Yahoo first
  try {
    return await getYahooMarketData(symbol);
  } catch (yahooError) {
    console.error(
      `[Yahoo Fail] ${symbol}`,
      yahooError,
    );
  }

  // fallback TradingView
  return getTradingViewMarketData(symbol);
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

      console.error(
        `[fetchMarketPrices] ${symbols[index]}`,
        result.reason,
      );

      return buildErrorResult(
        symbols[index],
        result.reason,
      );
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
    provider: 'hybrid',
    debug: results,
  };
  }
