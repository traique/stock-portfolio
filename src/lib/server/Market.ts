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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Đọc từ price_snapshots ──────────────────────────────────────────────────
// Đây là nguồn chính cho tất cả mã VN.
// Data được cron job cập nhật mỗi 30 phút trong giờ giao dịch.

async function getSnapshotBatch(
  symbols: string[],
): Promise<Map<string, MarketData>> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from('price_snapshots')
    .select('symbol, price, ref, change, pct, ceiling, floor, high, low, volume, fetched_at')
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

// ─── Main ────────────────────────────────────────────────────────────────────

export async function fetchMarketPrices(
  symbols: string[],
): Promise<PricesPayload> {
  const vnSymbols     = symbols.filter(isVietnamStock);
  const globalSymbols = symbols.filter(s => !isVietnamStock(s));

  // VN: đọc từ snapshot DB (1 query)
  const snapshotMap = new Map<string, MarketData>();
  if (vnSymbols.length > 0) {
    try {
      const fetched = await getSnapshotBatch(vnSymbols);
      for (const [sym, data] of fetched) snapshotMap.set(sym, data);
    } catch (err) {
      console.error('[Snapshot Read Fail]', err);
    }
  }

  // Non-VN: Yahoo song song
  const globalSettled = await Promise.allSettled(
    globalSymbols.map(s =>
      getYahooMarketData(s).catch(err => {
        console.error(`[Yahoo Fail] ${s}`, err);
        throw err;
      }),
    ),
  );

  // Gộp đúng thứ tự
  const results: MarketData[] = symbols.map(symbol => {
    if (isVietnamStock(symbol)) {
      return snapshotMap.get(symbol) ?? buildErrorResult(symbol);
    }
    const i = globalSymbols.indexOf(symbol);
    const s = globalSettled[i];
    return s?.status === 'fulfilled' ? s.value : buildErrorResult(symbol);
  });

  const prices = Object.fromEntries(
    results.filter(r => r.price > 0).map(r => [r.symbol, r.price]),
  );

  return {
    prices,
    updatedAt: new Date().toISOString(),
    provider: 'snapshot+yahoo',
    debug: results,
  };
        }
