import { NextRequest, NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

function normalizeSymbols(raw: string) {
  return [...new Set(raw.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function toYahooSymbol(symbol: string) {
  return `${symbol}.VN`;
}

export async function GET(request: NextRequest) {
  try {
    const symbols = normalizeSymbols(request.nextUrl.searchParams.get('symbols') || '');

    if (!symbols.length) {
      return NextResponse.json({
        prices: {},
        updatedAt: new Date().toISOString(),
        provider: 'yahoo-empty',
      });
    }

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const quote: any = await yahooFinance.quote(toYahooSymbol(symbol));
          const price = Number(
            quote?.regularMarketPrice ??
              quote?.postMarketPrice ??
              quote?.preMarketPrice ??
              0
          );

          return {
            symbol,
            price,
            currency: quote?.currency || 'VND',
            marketTime: quote?.regularMarketTime || null,
          };
        } catch {
          return {
            symbol,
            price: 0,
            currency: 'VND',
            marketTime: null,
          };
        }
      })
    );

    const prices = Object.fromEntries(
      results.filter((item) => item.price > 0).map((item) => [item.symbol, item.price])
    );

    return NextResponse.json({
      prices,
      updatedAt: new Date().toISOString(),
      provider: 'yahoo-finance2',
      debug: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message, provider: 'yahoo-finance2' },
      { status: 500 }
    );
  }
}
