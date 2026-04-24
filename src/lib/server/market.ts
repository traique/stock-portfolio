import { z } from 'zod';

// ⚠️ KHÔNG import trực tiếp để tránh crash SSR
let TradingViewModule: any = null;

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

// ================= CONFIG =================

const CEILING_MULTIPLIER = 1.07;
const FLOOR_MULTIPLIER = 0.93;

const TIMEOUT = 4000;
const RETRY = 1;

const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

// ================= SAFE CLIENT =================

let tvClient: any = null;
let tvInitTried = false;

function getTvClient(): any | null {
  if (tvInitTried) return tvClient;
  tvInitTried = true;

  try {
    TradingViewModule = require('@mathieuc/tradingview');

    const mod = TradingViewModule?.default || TradingViewModule;

    if (typeof mod === 'function') {
      tvClient = new mod();
      return tvClient;
    }

    if (typeof mod?.TradingView === 'function') {
      tvClient = new mod.TradingView();
      return tvClient;
    }

    if (typeof mod?.Client === 'function') {
      tvClient = new mod.Client();
      return tvClient;
    }

    if (typeof mod?.getBar === 'function') {
      tvClient = mod;
      return tvClient;
    }

    console.warn('[TV] Unknown module shape');
    return null;
  } catch (e) {
    console.warn('[TV] init failed:', e);
    return null;
  }
}

// ================= UTILS =================

export function normalizeSymbols(raw?: string): string[] {
  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

function safeNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundPrice(v: number) {
  return Math.round(v / 10) * 10;
}

function estimateCeiling(p: number) {
  return roundPrice(p * CEILING_MULTIPLIER);
}

function estimateFloor(p: number) {
  return roundPrice(p * FLOOR_MULTIPLIER);
}

function isVNIndex(symbol: string) {
  return symbol === 'VNINDEX' || symbol === '^VNINDEX';
}

function getTvSymbol(symbol: string) {
  return isVNIndex(symbol) ? 'HOSE:VNINDEX' : symbol;
}

function getYahooCandidates(symbol: string) {
  if (isVNIndex(symbol)) return ['^VNINDEX', 'VNINDEX.VN'];
  return [`${symbol}.VN`];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ================= NETWORK =================

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error('Fetch timeout or network error');
  } finally {
    clearTimeout(id);
  }
}

async function retry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;

  for (let i = 0; i <= RETRY; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < RETRY) await sleep(150);
    }
  }

  throw lastErr;
}

// ================= TRADINGVIEW =================

async function fetchFromTradingView(symbol: string): Promise<MarketResult> {
  const client = getTvClient();
  if (!client) throw new Error('TV unavailable');

  const fn = client.getBar || client.getBars;
  if (typeof fn !== 'function') throw new Error('TV method missing');

  const bar = await retry(() => fn.call(client, getTvSymbol(symbol), 'D'));

  const price = safeNumber(bar?.close ?? bar?.c);
  const prev = safeNumber(bar?.open ?? bar?.o);

  if (!price) throw new Error('TV invalid price');

  const change = price - prev;

  return {
    symbol,
    ticker: getTvSymbol(symbol),
    price,
    change,
    pct: prev ? (change / prev) * 100 : 0,
    previousClose: prev,
    ceilingPriceEstimate: estimateCeiling(prev || price),
    floorPriceEstimate: estimateFloor(prev || price),
    dayHigh: safeNumber(bar?.high ?? bar?.h),
    dayLow: safeNumber(bar?.low ?? bar?.l),
    marketTime: bar?.time ? bar.time * 1000 : null,
    currency: 'VND',
    volume: safeNumber(bar?.volume ?? bar?.v),
    provider: 'tradingview',
  };
}

// ================= YAHOO =================

async function fetchFromYahoo(symbol: string): Promise<MarketResult> {
  let lastErr: unknown;

  for (const ticker of getYahooCandidates(symbol)) {
    try {
      const url = `${YAHOO_URL}/${encodeURIComponent(ticker)}?interval=1m&range=1d`;

      const res = await retry(() =>
        fetchWithTimeout(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;

      if (!meta) throw new Error('No meta');

      const price = safeNumber(meta.regularMarketPrice);
      const prev = safeNumber(meta.previousClose);

      if (!price || !prev) throw new Error('Invalid Yahoo data');

      const change = price - prev;

      return {
        symbol,
        ticker,
        price,
        change,
        pct: (change / prev) * 100,
        previousClose: prev,
        ceilingPriceEstimate: estimateCeiling(prev),
        floorPriceEstimate: estimateFloor(prev),
        dayHigh: safeNumber(meta.regularMarketDayHigh),
        dayLow: safeNumber(meta.regularMarketDayLow),
        marketTime: meta.regularMarketTime ?? null,
        currency: meta.currency ?? 'VND',
        volume: safeNumber(meta.regularMarketVolume),
        provider: 'yahoo',
      };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr;
}

// ================= CORE =================

async function fetchOne(symbol: string): Promise<MarketResult> {
  const [tv, yahoo] = await Promise.allSettled([
    fetchFromTradingView(symbol),
    fetchFromYahoo(symbol),
  ]);

  if (tv.status === 'fulfilled') return tv.value;
  if (yahoo.status === 'fulfilled') return yahoo.value;

  return {
    symbol,
    ticker: symbol,
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
    error: 'All providers failed',
    provider: 'yahoo',
  };
}

// ================= PUBLIC =================

export async function fetchMarketPrices(
  symbols: string[],
  _withCacheBust?: boolean
): Promise<PricesPayload> {
  if (!symbols || symbols.length === 0) {
    return {
      prices: {},
      updatedAt: new Date().toISOString(),
      provider: 'yahoo',
      debug: [],
    };
  }

  const results = await Promise.all(symbols.map(fetchOne));

  const prices = Object.fromEntries(
    results
      .filter((r) => r.price > 0)
      .map((r) => [r.symbol, r.price])
  );

  const providers = new Set(results.map((r) => r.provider));

  const provider =
    providers.size === 1
      ? [...providers][0]
      : providers.size === 0
        ? 'yahoo'
        : 'mixed';

  return {
    prices,
    updatedAt: new Date().toISOString(),
    provider,
    debug: results,
  };
    }
