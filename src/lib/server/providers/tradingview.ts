import TradingView from '@mathieuc/tradingview';

import {
  getTradingViewSymbol,
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

// TradingView chỉ dùng fallback cuối
// Không dùng main provider trên Vercel
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
    }, 3000);

    chart.setMarket(tvSymbol, {
      timeframe: '1',
    });

    const interval = setInterval(() => {
      try {
        const candle = chart.periods[0];

        if (!candle?.close) {
          return;
        }

        clearTimeout(timeout);
        clearInterval(interval);
        client.end();

        const price = safeNumber(candle.close);

        const previousClose = safeNumber(
          candle.open || candle.close,
        );

        const change = price - previousClose;

        const pct = previousClose
          ? (change / previousClose) * 100
          : 0;

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
        clearInterval(interval);
        client.end();

        reject(err);
      }
    }, 200);
  });
}
