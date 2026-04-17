import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildPriceCacheKey,
  getCachedValue,
  setCachedValue,
} from '@/lib/server/price-cache-v2';
import { validationErrorResponse } from '@/lib/server/api-utils';
import {
  fetchMarketPrices,
  normalizeSymbols,
  PricesPayload,
  symbolsQuerySchema,
} from '@/lib/server/market';

const PRICE_CACHE_TTL_MS = 60 * 1000;

const querySchema = symbolsQuerySchema.extend({
  symbols: z.string().optional().default(''),
});

export async function GET(request: NextRequest) {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) return validationErrorResponse(parsed.error);

    const symbols = normalizeSymbols(parsed.data.symbols);

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

    const payload = await fetchMarketPrices(symbols, false);
    setCachedValue(cacheKey, payload, PRICE_CACHE_TTL_MS);

    return NextResponse.json({ ...payload, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message, provider: 'market' }, { status: 500 });
  }
}
