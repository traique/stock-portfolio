import {
  getExchange,
} from '../exchanges/exchange';

import type { MarketData } from './yahoo';

const CEILING_MULTIPLIER = 1.07;
const FLOOR_MULTIPLIER = 0.93;

function safeNumber(value: unknown): number {
  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
}

function roundPrice(value: number): number {
  return Math.round(value / 10) * 10;
}

function estimateCeiling(previousClose: number): number {
  return roundPrice(previousClose * CEILING_MULTIPLIER);
}

function estimateFloor(previousClose: number): number {
  return roundPrice(previousClose * FLOOR_MULTIPLIER);
}

export function isVietnamStock(symbol: string): boolean {
  return getExchange(symbol) !== null;
}

export async function getSSIMarketData(
  symbol: string,
): Promise<MarketData> {
  const exchange = getExchange(symbol);

  if (!exchange) {
    throw new Error(
      `Unknown exchange for ${symbol}`,
    );
  }

  const url =
    `https://fc-data.ssi.com.vn/api/v2/Market/Quote?symbol=${symbol}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      `SSI HTTP ${response.status}`,
    );
  }

  const json = await response.json();

  const data = json?.data?.[0];

  if (!data) {
    throw new Error(
      `SSI empty data for ${symbol}`,
    );
  }

  const price = safeNumber(
    data?.MatchedPrice
      || data?.ClosePrice
      || data?.MarketPrice,
  );

  if (!price) {
    throw new Error(
      `SSI invalid price for ${symbol}`,
    );
  }

  const previousClose = safeNumber(
    data?.ReferencePrice,
  );

  const change = price - previousClose;

  const pct = previousClose
    ? (change / previousClose) * 100
    : 0;

  return {
    symbol,
    ticker: symbol,
    provider: 'ssi',
    price,
    previousClose,
    change,
    pct,
    ceilingPriceEstimate:
      estimateCeiling(previousClose),
    floorPriceEstimate:
      estimateFloor(previousClose),
    dayHigh: safeNumber(data?.HighestPrice),
    dayLow: safeNumber(data?.LowestPrice),
    marketTime: Date.now(),
    currency: 'VND',
    volume: safeNumber(data?.TotalShare),
  };
    }
