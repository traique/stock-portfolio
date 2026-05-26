import TradingView from '@mathieuc/tradingview';

import {
  getTradingViewSymbol,
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

export async function getTradingViewMarketData(
  symbol: string,
): Promise<MarketData> {
  const tvSymbol = getTradingViewSymbol(symbol);

  if (!tvSymbol) {
    throw new Error(`No TradingView symbol for ${symbol}`);
  }

  const client = new TradingView.Client();
  const chart = new client.Session.Chart();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.end();

      reject(
        new Error(`TradingView timeout for ${symbol}`),
      );
    }, 10000);

    chart.setMarket(tvSymbol, {
      timeframe: '1D',
    });

    chart.onError((err: unknown) => {
      clearTimeout(timeout);
      client.end();

      reject(
        err instanceof Error
          ? err
          : new Error('TradingView unknown error'),
      );
    });

    chart.onUpdate(() => {
      try {
        const candle = chart.periods[0];

        if (!candle?.close) {
          return;
        }

        const price = safeNumber(candle.close);

        const previousClose = safeNumber(
          candle.open || candle.close,
        );

        const change = price - previousClose;

        const pct = previousClose
          ? (change / previousClose) * 100
          : 0;

        clearTimeout(timeout);
        client.end();

        resolve({
          symbol,
          ticker: tvSymbol,
          provider: 'tradingview',
          price,
          previousClose,
          change,
          pct,
          ceilingPriceEstimate: estimateCeiling(
            previousClose,
          ),
          floorPriceEstimate: estimateFloor(
            previousClose,
          ),
          dayHigh: safeNumber(candle.max),
          dayLow: safeNumber(candle.min),
          marketTime: candle.time ?? null,
          currency: 'VND',
          volume: safeNumber(candle.volume),
        });
      } catch (err) {
        clearTimeout(timeout);
        client.end();

        reject(err);
      }
    });
  });
}

export function shouldUseTradingViewFirst(
  symbol: string,
): boolean {
  const exchange = getExchange(symbol);

  return exchange === 'HNX' || exchange === 'UPCOM';
}
