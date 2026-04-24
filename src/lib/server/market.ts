import { z } from 'zod';
import * as TradingViewModule from '@mathieuc/tradingview';   // Import tất cả để debug dễ

// ================= TYPES =================

export const symbolsQuerySchema = z.object({
  symbols: z.string().optional().default(''),
});

export type MarketResult = {
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
  provider: 'tradingview' | 'yahoo';
};

export type PricesPayload = {
  prices: Record<string, number>;
  updatedAt: string;
  provider: 'tradingview' | 'yahoo' | 'mixed';
  debug: MarketResult[];
  cached?: boolean;
};

// ================= CONSTANTS =================

const CEILING_MULTIPLIER = 1.07;
const FLOOR_MULTIPLIER   = 0.93;

// Khởi tạo TradingView client một cách an toàn (fix lỗi "not a constructor")
const tvClient = (() => {
  // Cách 1: Default export là constructor
  if (typeof TradingViewModule.default === 'function') {
    return new (TradingViewModule.default as any)();
  }
  // Cách 2: Named export TradingView
  if (typeof (TradingViewModule as any).TradingView === 'function') {
    return new (TradingViewModule as any).TradingView();
  }
  // Cách 3: Default là object có method (một số version)
  if (TradingViewModule.default && typeof TradingViewModule.default.getBar === 'function') {
    return TradingViewModule.default;
  }
  // Fallback
  console.warn('[TradingView] Using raw module as client');
  return TradingViewModule.default || TradingViewModule;
})();

// Yahoo constants
const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

// ================= UTILS (giữ nguyên) =================

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

function getTvSymbol(symbol: string): string {
  if (isVnIndexSymbol(symbol)) return 'HOSE:VNINDEX';
  return symbol;
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

function buildErrorResult(symbol: string, error: unknown, provider: 'tradingview' | 'yahoo'): MarketResult {
  return {
    symbol,
    ticker: provider === 'tradingview' ? getTvSymbol(symbol) : (isVnIndexSymbol(symbol) ? '^VNINDEX' : `${symbol}.VN`),
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
    provider,
  };
}

// ================= FETCH FROM TRADINGVIEW =================

async function fetchFromTradingView(baseSymbol: string): Promise<MarketResult> {
  const tvSymbol = getTvSymbol(baseSymbol);

  try {
    // Gọi getBar an toàn
    const bar = await tvClient.getBar(tvSymbol, 'D');

    const price = safeNumber(bar?.close);
    const previousClose = safeNumber(bar?.open);

    if (price === 0) {
      throw new Error(`No valid close price from TradingView for ${tvSymbol}`);
    }

    const change = price - previousClose;
    const pct = previousClose > 0 ? (change / previousClose) * 100 : 0;

    return {
      symbol: baseSymbol,
      ticker: tvSymbol,
      price,
      change,
      pct,
      previousClose,
      ceilingPriceEstimate: estimateCeiling(previousClose || price),
      floorPriceEstimate: estimateFloor(previousClose || price),
      dayHigh: safeNumber(bar?.high),
      dayLow: safeNumber(bar?.low),
      marketTime: bar?.time ? bar.time * 1000 : null,
      currency: 'VND',
      volume: safeNumber(bar?.volume),
      provider: 'tradingview',
    };
  } catch (error) {
    console.warn(`[TradingView failed] \( {baseSymbol} ( \){tvSymbol}):`, error);
    throw error;
  }
}

// ================= FETCH FROM YAHOO (giữ nguyên) =================

async function fetchYahooTicker(baseSymbol: string, ticker: string): Promise<MarketResult> {
  const qs = `?interval=1m&range=1d&_=${Date.now()}`;
  const url = `\( {YAHOO_BASE_URL}/ \){encodeURIComponent(ticker)}${qs}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status} for ${ticker}`);

  const data = await response.json();
  const meta = data?.chart?.result?.[0]?.meta;

  if (!meta) throw new Error(`Yahoo empty meta for ${ticker}`);

  const price = safeNumber(meta.regularMarketPrice);
  const previousClose = safeNumber(meta.previousClose);

  if (price === 0 || previousClose === 0) throw new Error(`Missing data for ${ticker}`);

  const change = price - previousClose;
  const pct = (change / previousClose) * 100;

  return {
    symbol: baseSymbol,
    ticker,
    price,
    change,
    pct,
    previousClose,
    ceilingPriceEstimate: estimateCeiling(previousClose),
    floorPriceEstimate: estimateFloor(previousClose),
    dayHigh: safeNumber(meta.regularMarketDayHigh),
    dayLow: safeNumber(meta.regularMarketDayLow),
    marketTime: meta.regularMarketTime ?? null,
    currency: meta.currency ?? 'VND',
    volume: safeNumber(meta.regularMarketVolume),
    provider: 'yahoo',
  };
}

async function fetchFromYahoo(baseSymbol: string): Promise<MarketResult> {
  const candidates = getYahooCandidates(baseSymbol);
  let lastError: Error = new Error(`No Yahoo ticker matched for ${baseSymbol}`);

  for (const ticker of candidates) {
    try {
      return await fetchYahooTicker(baseSymbol, ticker);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown Yahoo error');
    }
  }
  throw lastError;
}

// ================= MAIN PUBLIC API =================

export async function fetchMarketPrices(
  symbols: string[],
  withCacheBust = false,
): Promise<PricesPayload> {
  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        return await fetchFromTradingView(symbol);
      } catch (tvError) {
        try {
          return await fetchFromYahoo(symbol);
        } catch (yahooError) {
          console.error(`[Both sources failed] ${symbol}:`, { tvError, yahooError });
          return buildErrorResult(symbol, yahooError || tvError, 'yahoo');
        }
      }
    })
  );

  const results: MarketResult[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`[fetchMarketPrices] ${symbols[i]} failed:`, r.reason);
    return buildErrorResult(symbols[i], r.reason, 'yahoo');
  });

  const prices = Object.fromEntries(
    results
      .filter(item => item.price > 0)
      .map(item => [item.symbol, item.price]),
  );

  const usedProviders = new Set(results.map(r => r.provider));
  const finalProvider: 'tradingview' | 'yahoo' | 'mixed' =
    usedProviders.size === 1
      ? Array.from(usedProviders)[0]
      : usedProviders.size === 0
        ? 'yahoo'
        : 'mixed';

  return {
    prices,
    updatedAt: new Date().toISOString(),
    provider: finalProvider,
    debug: results,
  } satisfies PricesPayload;
                                                                              }
