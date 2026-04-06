import { NextRequest, NextResponse } from 'next/server';
import { buildPriceCacheKey, getCachedValue, setCachedValue } from '@/lib/server/price-cache-v2';

const PRICE_CACHE_TTL_MS = 60 * 1000;

type YahooResult = {
  symbol: string;
  ticker: string;
  price: number;
  change: number;
  pct: number;
  previousClose: number;
  ceilingPriceEstimate: number;
  floorPriceEstimate: number;
  dayHigh: number;
  dayLow: number;
  marketTime: number | null;
  currency: string;
  volume: number;
  error?: string;
};

type PricesPayload = {
  prices: Record<string, number>;
  updatedAt: string;
  provider: string;
  debug: YahooResult[];
  cached?: boolean;
};

function normalizeSymbols(raw: string) {
  return [...new Set(raw.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function isVnIndexSymbol(symbol: string) {
  return symbol === 'VNINDEX' || symbol === '^VNINDEX';
}

function getYahooCandidates(symbol: string) {
  if (isVnIndexSymbol(symbol)) {
    return ['^VNINDEX', '^VNINDEX.VN', 'VNINDEX', 'VNINDEX.VN'];
  }
  return [symbol + '.VN'];
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundPrice(value: number) {
  return Math.round(value / 10) * 10;
}

function estimateCeiling(previousClose: number) {
  return roundPrice(previousClose * 1.07);
}

function estimateFloor(previousClose: number) {
  return roundPrice(previousClose * 0.93);
}

async function fetchYahooTicker(baseSymbol: string, ticker: string) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?interval=1m&range=1d';

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Yahoo request failed for ' + ticker + ': ' + response.status);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;

  if (!meta) {
    throw new Error('Yahoo returned empty meta for ' + ticker);
  }

  const price = safeNumber(meta.regularMarketPrice);
  const previousClose = safeNumber(meta.previousClose);
  const regularMarketVolume = safeNumber(meta.regularMarketVolume);
  const dayHigh = safeNumber(meta.regularMarketDayHigh);
  const dayLow = safeNumber(meta.regularMarketDayLow);

  if (!price || !previousClose) {
    throw new Error('Missing market data for ' + ticker);
  }

  const change = price - previousClose;
  const pct = previousClose ? (change / previousClose) * 100 : 0;

  return {
    symbol: baseSymbol,
    ticker,
    price,
    change,
    pct,
    previousClose,
    ceilingPriceEstimate: estimateCeiling(previousClose),
    floorPriceEstimate: estimateFloor(previousClose),
    dayHigh,
    dayLow,
    marketTime: meta.regularMarketTime ?? null,
    currency: meta.currency ?? 'VND',
    volume: regularMarketVolume,
  };
}

async function getYahooFinance(symbol: string) {
  const candidates = getYahooCandidates(symbol);
  let lastError: Error | null = null;

  for (const ticker of candidates) {
    try {
      return await fetchYahooTicker(symbol, ticker);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
    }
  }

  throw lastError || new Error('No Yahoo ticker matched for ' + symbol);
}

export async function GET(request: NextRequest) {
  try {
    const symbols = normalizeSymbols(request.nextUrl.searchParams.get('symbols') || '');

    if (!symbols.length) {
      return NextResponse.json({
        prices: {},
        updatedAt: new Date().toISOString(),
        provider: 'market',
        debug: [],
      });
    }

    const cacheKey = buildPriceCacheKey(symbols);
    const cached = getCachedValue<PricesPayload>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          return await getYahooFinance(symbol);
        } catch (error) {
          return {
            symbol,
            ticker: getYahooCandidates(symbol)[0],
            price: 0,
            change: 0,
            pct: 0,
            previousClose: 0,
            ceilingPriceEstimate: 0,
            floorPriceEstimate: 0,
            dayHigh: 0,
            dayLow: 0,
            marketTime: null,
            currency: 'VND',
            volume: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const prices = Object.fromEntries(
      results.filter((item) => Number(item.price) > 0).map((item) => [item.symbol, item.price])
    );

    const payload: PricesPayload = {
      prices,
      updatedAt: new Date().toISOString(),
      provider: 'market',
      debug: results,
      cached: false,
    };

    setCachedValue(cacheKey, payload, PRICE_CACHE_TTL_MS);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message, provider: 'market' }, { status: 500 });
  }
}
