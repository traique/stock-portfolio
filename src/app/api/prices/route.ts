import { NextRequest, NextResponse } from 'next/server';

function normalizeSymbols(raw: string) {
  return [...new Set(raw.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

function toYahooSymbol(symbol: string) {
  return `${symbol}.VN`;
}

function extractNumber(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
  }
  return 0;
}

function extractText(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

async function fetchYahooPagePrice(symbol: string) {
  const yahooSymbol = toYahooSymbol(symbol);
  const urls = [
    `https://sg.finance.yahoo.com/quote/${yahooSymbol}`,
    `https://uk.finance.yahoo.com/quote/${yahooSymbol}`,
    `https://finance.yahoo.com/quote/${yahooSymbol}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        cache: 'no-store',
      });

      if (!response.ok) continue;

      const html = await response.text();

      const price = extractNumber(html, [
        /"regularMarketPrice"\s*:\s*\{[^}]*"raw"\s*:\s*([0-9.]+)/,
        /"currentPrice"\s*:\s*\{[^}]*"raw"\s*:\s*([0-9.]+)/,
        /"financialData"\s*:\s*\{[\s\S]*?"currentPrice"\s*:\s*\{[^}]*"raw"\s*:\s*([0-9.]+)/,
      ]);

      const marketTime = extractText(html, [
        /"regularMarketTime"\s*:\s*\{[^}]*"fmt"\s*:\s*"([^"]+)"/,
        /"regularMarketTime"\s*:\s*\{[^}]*"raw"\s*:\s*([0-9]+)/,
      ]);

      if (price > 0) {
        return {
          symbol,
          price,
          marketTime,
          sourceUrl: url,
        };
      }
    } catch {
      continue;
    }
  }

  return {
    symbol,
    price: 0,
    marketTime: null,
    sourceUrl: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const symbols = normalizeSymbols(request.nextUrl.searchParams.get('symbols') || '');

    if (!symbols.length) {
      return NextResponse.json({
        prices: {},
        updatedAt: new Date().toISOString(),
        provider: 'yahoo-page-empty',
      });
    }

    const results = await Promise.all(symbols.map((symbol) => fetchYahooPagePrice(symbol)));

    const prices = Object.fromEntries(
      results.filter((item) => item.price > 0).map((item) => [item.symbol, item.price])
    );

    return NextResponse.json({
      prices,
      updatedAt: new Date().toISOString(),
      provider: 'yahoo-page-scrape',
      debug: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message, provider: 'yahoo-page-scrape' },
      { status: 500 }
    );
  }
}
