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
  getExchange,
} from './exchanges/exchange';

import {
  getVciEdgeBatch,
} from './providers/vci-edge';

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

// VNINDEX + cổ phiếu VN đều có thể fallback snapshot
function canUseSnapshot(symbol: string): boolean {
  return isVnIndexSymbol(symbol) || isVietnamStock(symbol);
}

// HOSE → Yahoo (giá realtime). HNX/UPCOM → VCI Edge (Yahoo không có data).
// Nếu Yahoo fail (block, 404...) → VCI Edge làm fallback cho cả HOSE.
// Cuối cùng → snapshot từ Supabase (giá cũ nhưng vẫn hơn 0).

function isHoseStock(symbol: string): boolean {
  return getExchange(symbol) === 'HOSE';
}

function isVciStock(symbol: string): boolean {
  const ex = getExchange(symbol);
  return ex === 'HNX' || ex === 'UPCOM';
}

export async function fetchMarketPrices(symbols: string[]): Promise<PricesPayload> {
  const hoseSymbols = symbols.filter(isHoseStock);
  const vciSymbols  = symbols.filter(isVciStock);
  const otherSymbols = symbols.filter(s => !isHoseStock(s) && !isVciStock(s));

  // Bước 1a: Yahoo cho HOSE song song
  const yahooSettled = await Promise.allSettled(
    hoseSymbols.map(s => getYahooMarketData(s)),
  );

  // Bước 1b: VCI Edge cho HNX/UPCOM (primary) + HOSE bị Yahoo fail (fallback)
  const hoseMissed = hoseSymbols.filter((_, i) => {
    const r = yahooSettled[i];
    return r.status === 'rejected' || !(r as PromiseFulfilledResult<MarketData>).value?.price;
  });

  const vciEdgeSymbols = [...new Set([...vciSymbols, ...hoseMissed])];
  const vciEdgeMap = vciEdgeSymbols.length > 0
    ? await getVciEdgeBatch(vciEdgeSymbols).catch(err => {
        console.error('[VCI Edge Fail]', err);
        return new Map<string, MarketData>();
      })
    : new Map<string, MarketData>();

  // Bước 2: snapshot fallback cho những mã vẫn thiếu
  const stillMissed = symbols.filter(s => {
    if (isHoseStock(s)) {
      const i = hoseSymbols.indexOf(s);
      const yahooOk = i >= 0 && yahooSettled[i].status === 'fulfilled'
        && (yahooSettled[i] as PromiseFulfilledResult<MarketData>).value?.price > 0;
      return !yahooOk && !vciEdgeMap.has(s);
    }
    if (isVciStock(s)) return !vciEdgeMap.has(s);
    return canUseSnapshot(s);
  });

  const snapshotMap = stillMissed.length > 0
    ? await getSnapshotBatch(stillMissed).catch(err => {
        console.error('[Snapshot Fallback Fail]', err);
        return new Map<string, MarketData>();
      })
    : new Map<string, MarketData>();

  // Bước 3: gộp kết quả theo thứ tự ưu tiên
  const results: MarketData[] = symbols.map(symbol => {
    // HOSE: Yahoo → VCI Edge → snapshot
    if (isHoseStock(symbol)) {
      const i = hoseSymbols.indexOf(symbol);
      if (i >= 0) {
        const yr = yahooSettled[i];
        if (yr.status === 'fulfilled' && yr.value.price > 0) return yr.value;
      }
      const vci = vciEdgeMap.get(symbol);
      if (vci && vci.price > 0) return vci;
      return snapshotMap.get(symbol) ?? buildErrorResult(symbol);
    }

    // HNX/UPCOM: VCI Edge → snapshot
    if (isVciStock(symbol)) {
      const vci = vciEdgeMap.get(symbol);
      if (vci && vci.price > 0) return vci;
      return snapshotMap.get(symbol) ?? buildErrorResult(symbol);
    }

    // VNINDEX và các symbol khác (other): snapshot → error
    return snapshotMap.get(symbol) ?? buildErrorResult(symbol);
  });

  const prices = Object.fromEntries(
    results.filter(r => r.price > 0).map(r => [r.symbol, r.price]),
  );

  // Log provider mix để dễ debug
  const providerCounts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.provider] = (acc[r.provider] ?? 0) + 1;
    return acc;
  }, {});
  console.info('[fetchMarketPrices] providers:', providerCounts);

  return {
    prices,
    updatedAt: new Date().toISOString(),
    provider: 'yahoo+vci-edge+snapshot',
    debug: results,
  };
}
