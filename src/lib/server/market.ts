import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

import {
  getYahooMarketData,
  type MarketData,
} from './providers/yahoo';

import {
  isVietnamStock,
} from './providers/ssi';

import {
  isVnIndexSymbol,
  normalizeSymbol,
} from './exchanges/exchange';

export const symbolsQuerySchema = z.object({
  symbols: z.string().optional().default(''),
});

export type PricesPayload = {
  prices: Record<string, number>;
  updatedAt: string;
  provider: string;
  debug: MarketData[];
};

function buildErrorResult(symbol: string): MarketData {
  return {
    symbol, ticker: symbol, provider: 'error',
    price: 0, previousClose: 0, change: 0, pct: 0,
    ceilingPriceEstimate: 0, floorPriceEstimate: 0,
    dayHigh: 0, dayLow: 0, marketTime: null, currency: 'VND', volume: 0,
  };
}

export function normalizeSymbols(raw: string): string[] {
  return [
    ...new Set(raw.split(',').map(normalizeSymbol).filter(Boolean)),
  ];
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVER_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getSnapshotBatch(symbols: string[]): Promise<Map<string, MarketData>> {
  if (!symbols.length) return new Map();
  const sb = getSupabase();
  const { data, error } = await sb
    .from('price_snapshots')
    .select('symbol,price,ref,change,pct,ceiling,floor,high,low,volume,fetched_at')
    .in('symbol', symbols);

  if (error) throw new Error(`Supabase read: ${error.message}`);

  const map = new Map<string, MarketData>();
  for (const row of data ?? []) {
    map.set(row.symbol, {
      symbol:               row.symbol,
      ticker:               row.symbol,
      provider:             'snapshot',
      price:                Number(row.price),
      previousClose:        Number(row.ref),
      change:               Number(row.change),
      pct:                  Number(row.pct),
      ceilingPriceEstimate: Number(row.ceiling),
      floorPriceEstimate:   Number(row.floor),
      dayHigh:              Number(row.high),
      dayLow:               Number(row.low),
      marketTime:           new Date(row.fetched_at).getTime(),
      currency:             'VND',
      volume:               Number(row.volume),
    });
  }
  return map;
}

export async function fetchMarketPrices(symbols: string[]): Promise<PricesPayload> {
  // Bước 1: thử Yahoo cho tất cả (VNINDEX dùng ^VNINDEX, cổ phiếu VN dùng .VN)
  const yahooSettled = await Promise.allSettled(
    symbols.map(s => getYahooMarketData(s)),
  );

  // Bước 2: tìm các mã Yahoo không trả được giá → fallback snapshot DB
  const missedSymbols = symbols.filter((_, i) => {
    const s = yahooSettled[i];
    return s.status === 'rejected' || (s.status === 'fulfilled' && !(s.value.price > 0));
  });

  // Bước 3: lấy snapshot cho các mã bị miss (chỉ mã VN mới có trong DB)
  const snapshotMap = new Map<string, MarketData>();
  const vnMissed = missedSymbols.filter(s => isVietnamStock(s) && !isVnIndexSymbol(s));
  if (vnMissed.length > 0) {
    try {
      const fetched = await getSnapshotBatch(vnMissed);
      for (const [sym, data] of fetched) snapshotMap.set(sym, data);
    } catch (err) {
      console.error('[Snapshot Fallback Fail]', err);
    }
  }

  // Bước 4: gộp kết quả — Yahoo ưu tiên, snapshot bù vào chỗ thiếu
  const results: MarketData[] = symbols.map((symbol, i) => {
    const yahoo = yahooSettled[i];
    if (yahoo.status === 'fulfilled' && yahoo.value.price > 0) {
      return yahoo.value;
    }
    return snapshotMap.get(symbol) ?? buildErrorResult(symbol);
  });

  const prices = Object.fromEntries(
    results.filter(r => r.price > 0).map(r => [r.symbol, r.price]),
  );

  return {
    prices,
    updatedAt: new Date().toISOString(),
    provider: 'yahoo+snapshot',
    debug: results,
  };
}
