import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validationErrorResponse } from '@/lib/server/api-utils';
import {
  fetchMarketPrices,
  normalizeSymbols,
  symbolsQuerySchema,
} from '@/lib/server/market';

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

    const payload = await fetchMarketPrices(symbols, true);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message, provider: 'market' }, { status: 500 });
  }
}
