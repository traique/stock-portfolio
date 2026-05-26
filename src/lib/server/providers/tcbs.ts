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

export async function getTCBSMarketData(
  symbol: string,
): Promise<MarketData> {
  const url =
    `https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/beta/overview/${symbol}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Referer: 'https://tcinvest.tcbs.com.vn/',
      Origin: 'https://tcinvest.tcbs.com.vn',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`TCBS HTTP ${response.status}`);
  }

  const data = await response.json();

  const price = safeNumber(
    data?.price
      || data?.close
      || data?.matchPrice
      || data?.marketPrice,
  );

  if (!price) {
    throw new Error(
      `TCBS invalid data for ${symbol}`,
    );
  }

  const previousClose = safeNumber(
    data?.referencePrice
      || data?.prevClosePrice
      || data?.previousClose,
  );

  const change = price - previousClose;

  const pct = previousClose
    ? (change / previousClose) * 100
    : 0;

  return {
    symbol,
    ticker: symbol,
    provider: 'tcbs',
    price,
    previousClose,
    change,
    pct,
    ceilingPriceEstimate:
      estimateCeiling(previousClose),
    floorPriceEstimate:
      estimateFloor(previousClose),
    dayHigh: safeNumber(
      data?.highestPrice || data?.high,
    ),
    dayLow: safeNumber(
      data?.lowestPrice || data?.low,
    ),
    marketTime: Date.now(),
    currency: 'VND',
    volume: safeNumber(
      data?.accumulatedTradingVolume
        || data?.volume,
    ),
  };
}
