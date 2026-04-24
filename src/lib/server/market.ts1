import { z } from 'zod';

// ================= TYPES =================

export const symbolsQuerySchema = z.object({
  symbols: z.string().optional().default(''),
});

export type YahooResult = {
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

export type PricesPayload = {
  prices: Record<string, number>;
  updatedAt: string;
  provider: string;
  debug: YahooResult[];
  cached?: boolean;
};

// ================= CONSTANTS =================

const CEILING_MULTIPLIER = 1.07;
const FLOOR_MULTIPLIER   = 0.93;
const YAHOO_BASE_URL     = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT         =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// ================= UTILS =================

export function normalizeSymbols(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}

function isVnIndexSymbol(symbol: string): boolean {
  return symbol === 'VNINDEX' || symbol === '^VNINDEX';
}

function getYahooCandidates(symbol: string): string[] {
  if (isVnIndexSymbol(symbol)) {
    return ['^VNINDEX', '^VNINDEX.VN', 'VNINDEX', 'VNINDEX.VN'];
  }
  return [`${symbol}.VN`];
}

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

function buildErrorResult(symbol: string, error: unknown): YahooResult {
  return {
    symbol,
    ticker: isVnIndexSymbol(symbol) ? '^VNINDEX' : `${symbol}.VN`,
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

// ================= FETCH =================

async function fetchYahooTicker(
  baseSymbol: string,
  ticker: string,
  withCacheBust: boolean,
): Promise<YahooResult> {
  const qs = withCacheBust
    ? `?interval=1m&range=1d&_=${Date.now()}`
    : '?interval=1m&range=1d';

  const url = `${YAHOO_BASE_URL}/${encodeURIComponent(ticker)}${qs}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Yahoo HTTP ${response.status} for ${ticker}`);
  }

  const data = await response.json();
  const meta = data?.chart?.result?.[0]?.meta;

  if (!meta) {
    throw new Error(`Yahoo returned empty meta for ${ticker}`);
  }

  const price         = safeNumber(meta.regularMarketPrice);
  const previousClose = safeNumber(meta.previousClose);

  if (!price || !previousClose) {
    throw new Error(`Missing market data for ${ticker}`);
  }

  const change = price - previousClose;
  const pct    = (change / previousClose) * 100;

  return {
    symbol:               baseSymbol,
    ticker,
    price,
    change,
    pct,
    previousClose,
    ceilingPriceEstimate: estimateCeiling(previousClose),
    floorPriceEstimate:   estimateFloor(previousClose),
    dayHigh:              safeNumber(meta.regularMarketDayHigh),
    dayLow:               safeNumber(meta.regularMarketDayLow),
    marketTime:           meta.regularMarketTime ?? null,
    currency:             meta.currency ?? 'VND',
    volume:               safeNumber(meta.regularMarketVolume),
  };
}

async function getYahooFinance(
  symbol: string,
  withCacheBust: boolean,
): Promise<YahooResult> {
  const candidates = getYahooCandidates(symbol);
  let lastError: Error = new Error(`No Yahoo ticker matched for ${symbol}`);

  for (const ticker of candidates) {
    try {
      return await fetchYahooTicker(symbol, ticker, withCacheBust);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
    }
  }

  throw lastError;
}

// ================= PUBLIC API =================

export async function fetchMarketPrices(
  symbols: string[],
  withCacheBust = false,
): Promise<PricesPayload> {
  // Promise.allSettled so one bad ticker never blocks the rest
  const settled = await Promise.allSettled(
    symbols.map(symbol => getYahooFinance(symbol, withCacheBust)),
  );

  const results: YahooResult[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`[fetchMarketPrices] ${symbols[i]}:`, r.reason);
    return buildErrorResult(symbols[i], r.reason);
  });

  const prices = Object.fromEntries(
    results
      .filter(item => item.price > 0)
      .map(item => [item.symbol, item.price]),
  );

  return {
    prices,
    updatedAt: new Date().toISOString(),
    provider: 'yahoo',          // was 'market' — should reflect actual source
    debug: results,
  } satisfies PricesPayload;
}
