import { NextRequest, NextResponse } from 'next/server';

function normalizeSymbols(raw: string) {
  return [...new Set(raw.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function toYahooSymbol(symbol: string) {
  return `${symbol}.VN`;
}

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function getYahooFinance(symbol: string, isStock = true) {
  const ticker = toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d&_=${Date.now()}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Yahoo request failed for ${ticker}: ${response.status}`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;

  if (!meta) {
    throw new Error(`Yahoo returned empty meta for ${ticker}`);
  }

  let price = safeNumber(meta.regularMarketPrice);
  let previousClose = safeNumber(meta.previousClose);
  let regularMarketVolume = safeNumber(meta.regularMarketVolume);

  if (!price || !previousClose) {
    throw new Error(`Missing market data for ${ticker}`);
  }

  let change = price - previousClose;
  const pct = previousClose ? (change / previousClose) * 100 : 0;

  if (isStock) {
    price = price / 1000;
    previousClose = previousClose / 1000;
    change = change / 1000;
  }

  return {
    symbol,
    ticker,
    price,
    change,
    pct,
    previousClose,
    marketTime: meta.regularMarketTime ?? null,
    currency: meta.currency ?? 'VND',
    volume: regularMarketVolume,
  };
}

export async function GET(request: NextRequest) {
  try {
    const symbols = normalizeSymbols(request.nextUrl.searchParams.get('symbols') || '');

    if (!symbols.length) {
      return NextResponse.json({
        prices: {},
        updatedAt: new Date().toISOString(),
        provider: 'yahoo-chart-empty',
        debug: [],
      });
    }

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          return await getYahooFinance(symbol, true);
        } catch (error) {
          return {
            symbol,
            ticker: toYahooSymbol(symbol),
            price: 0,
            change: 0,
            pct: 0,
            previousClose: 0,
            marketTime: null,
            currency: 'VND',
            volume: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const prices = Object.fromEntries(
      results.filter((item) => Number(item.price) > 0).map((item) => [item.symbol, item.price])
    );

    return NextResponse.json({
      prices,
      updatedAt: new Date().toISOString(),
      provider: 'yahoo-chart-v8',
      debug: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message, provider: 'yahoo-chart-v8' },
      { status: 500 }
    );
  }
}
