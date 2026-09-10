import { getYahooSymbol } from '../exchanges/exchange';

const YAHOO_BASE_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

const CEILING_MULTIPLIER = 1.07;
const FLOOR_MULTIPLIER = 0.93;

export type MarketData = {
  symbol: string;
  ticker: string;
  provider: string;
  price: number;
  previousClose: number;
  change: number;
  pct: number;
  ceilingPriceEstimate: number;
  floorPriceEstimate: number;
  dayHigh: number;
  dayLow: number;
  marketTime: number | null;
  currency: string;
  volume: number;
};

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

export async function getYahooMarketData(
  symbol: string,
): Promise<MarketData> {
  const ticker = getYahooSymbol(symbol);

  const url = `${YAHOO_BASE_URL}/${encodeURIComponent(
    ticker,
  )}?interval=1m&range=1d&_=${Date.now()}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: '*/*',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Yahoo HTTP ${response.status}`);
  }

  const data = await response.json();

  const meta = data?.chart?.result?.[0]?.meta;

  if (!meta) {
    throw new Error(`Yahoo empty data for ${ticker}`);
  }

  const price = safeNumber(meta.regularMarketPrice);
  const previousClose = safeNumber(meta.previousClose);

  if (!price || !previousClose) {
    throw new Error(`Yahoo invalid price for ${ticker}`);
  }

  const change = price - previousClose;
  const pct = (change / previousClose) * 100;

  return {
    symbol,
    ticker,
    provider: 'yahoo',
    price,
    previousClose,
    change,
    pct,
    ceilingPriceEstimate: estimateCeiling(previousClose),
    floorPriceEstimate: estimateFloor(previousClose),
    dayHigh: safeNumber(meta.regularMarketDayHigh),
    dayLow: safeNumber(meta.regularMarketDayLow),
    marketTime: meta.regularMarketTime ?? null,
    currency: meta.currency ?? 'VND',
    volume: safeNumber(meta.regularMarketVolume),
  };
}
