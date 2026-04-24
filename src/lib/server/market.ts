import { z } from 'zod';
import TradingView from '@mathieuc/tradingview';

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
  provider?: 'tradingview' | 'yahoo';
};

export type PricesPayload = {
  prices: Record<string, number>;
  updatedAt: string;
  provider: string;        // 'tradingview' hoặc 'yahoo' hoặc 'mixed'
  debug: MarketResult[];
  cached?: boolean;
};

// ================= CONSTANTS =================

const CEILING_MULTIPLIER = 1.07;
const FLOOR_MULTIPLIER   = 0.93;

// TradingView client (public, không cần login cho giá cơ bản)
const tvClient = new TradingView();

// Yahoo constants (giữ nguyên logic cũ của bạn)
const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

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

function getTvSymbol(symbol: string): string {
  if (isVnIndexSymbol(symbol)) return 'HOSE:VNINDEX';
  return symbol;                    // VNM, VCB, SSI... hoạt động tốt
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

function buildErrorResult(symbol: string, error: unknown, provider: string): MarketResult {
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
    provider: provider as 'tradingview' | 'yahoo',
  };
}

// ================= FETCH TRADINGVIEW =================

async function fetchFromTradingView(baseSymbol: string): Promise<MarketResult> {
  const tvSymbol = getTvSymbol(baseSymbol);

  try {
    const bar = await tvClient.getBar(tvSymbol, 'D');

    const price = safeNumber(bar.close);
    const previousClose = safeNumber(bar.open);   // tạm dùng open của nến hiện tại

    if (!price) throw new Error(`No close price from TradingView for ${tvSymbol}`);

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
      dayHigh: safeNumber(bar.high),
      dayLow: safeNumber(bar.low),
      marketTime: bar.time ? bar.time * 1000 : null,
      currency: 'VND',
      volume: safeNumber(bar.volume),
      provider: 'tradingview',
    };
  } catch (error) {
    console.warn(`[TradingView failed] \( {baseSymbol} ( \){tvSymbol}):`, error);
    throw error;   // throw để fallback sang Yahoo
  }
}

// ================= FETCH YAHOO (giữ nguyên logic cũ của bạn) =================

async function fetchYahooTicker(baseSymbol: string, ticker: string): Promise<MarketResult> {
  const qs = `?interval=1m&range=1d&_=${Date.now()}`;
  const url = `\( {YAHOO_BASE_URL}/ \){encodeURIComponent(ticker)}${qs}`;

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);

  const data = await response.json();
  const meta = data?.chart?.result?.[0]?.meta;

  if (!meta) throw new Error(`Yahoo empty meta for ${ticker}`);

  const price = safeNumber(meta.regularMarketPrice);
  const previousClose = safeNumber(meta.previousClose);

  if (!price || !previousClose) throw new Error(`Missing data for ${ticker}`);

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

// ================= MAIN FUNCTION (ƯU TIÊN TV → YAHOO) =================

export async function fetchMarketPrices(
  symbols: string[],
  withCacheBust = false,
): Promise<PricesPayload> {
  const settled = await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        // Ưu tiên TradingView trước
        return await fetchFromTradingView(symbol);
      } catch (tvError) {
        // Nếu TradingView lỗi → fallback sang Yahoo
        try {
          return await fetchFromYahoo(symbol);
        } catch (yahooError) {
          console.error(`[Both failed] ${symbol}:`, { tvError, yahooError });
          return buildErrorResult(symbol, yahooError || tvError, 'yahoo');
        }
      }
    })
  );

  const results: MarketResult[] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return buildErrorResult(symbols[i], r.reason, 'yahoo');
  });

  const prices = Object.fromEntries(
    results
      .filter(item => item.price > 0)
      .map(item => [item.symbol, item.price]),
  );

  // Xác định provider tổng thể
  const usedProviders = new Set(results.map(r => r.provider).filter(Boolean));
  const finalProvider = usedProviders.size === 1 
    ? Array.from(usedProviders)[0] 
    : 'mixed';

  return {
    prices,
    updatedAt: new Date().toISOString(),
    provider: finalProvider,
    debug: results,
  } satisfies PricesPayload;
}
