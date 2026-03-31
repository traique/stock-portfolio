import { NextRequest, NextResponse } from 'next/server';

function normalizeSymbols(raw: string) {
  return [...new Set(raw.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
}

export async function GET(request: NextRequest) {
  try {
    const symbols = normalizeSymbols(request.nextUrl.searchParams.get('symbols') || '');

    if (!symbols.length) {
      return NextResponse.json({ prices: {}, updatedAt: new Date().toISOString(), provider: 'empty' });
    }

    const baseUrl = process.env.PRICE_API_BASE_URL;
    const apiKey = process.env.PRICE_API_KEY;

    if (!baseUrl) {
      const prices = Object.fromEntries(
        symbols.map((symbol, index) => [symbol, 20000 + index * 5000 + Math.floor(Math.random() * 3000)])
      );

      return NextResponse.json({ prices, updatedAt: new Date().toISOString(), provider: 'mock' });
    }

    const url = new URL(baseUrl);
    url.searchParams.set('symbols', symbols.join(','));

    const response = await fetch(url.toString(), {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Provider error: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();

    let prices: Record<string, number> = {};

    if (data?.prices && typeof data.prices === 'object') {
      prices = Object.fromEntries(
        Object.entries(data.prices).map(([symbol, price]) => [symbol.toUpperCase(), Number(price)])
      );
    } else if (Array.isArray(data?.data)) {
      prices = Object.fromEntries(
        data.data.map((item: { symbol: string; price: number }) => [item.symbol.toUpperCase(), Number(item.price)])
      );
    }

    return NextResponse.json({
      prices,
      updatedAt: data?.updatedAt || new Date().toISOString(),
      provider: 'remote',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
