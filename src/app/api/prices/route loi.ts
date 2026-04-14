import yahooFinance from "yahoo-finance2";

const VNSTOCK_API_URL = process.env.VNSTOCK_API_URL || "";

/**
 * Fetch từ Yahoo Finance
 */
async function fetchYahoo(symbol: string) {
  try {
    const ticker = `${symbol}.VN`;

    const quote: any = await yahooFinance.quote(ticker);

    if (!quote || !quote.regularMarketPrice) {
      throw new Error("No Yahoo price");
    }

    return {
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange || 0,
      pct: quote.regularMarketChangePercent || 0,
      volume: quote.regularMarketVolume || 0,
      previousClose: quote.regularMarketPreviousClose || 0,
      source: "yahoo",
    };
  } catch (err: any) {
    throw new Error(`Yahoo failed: ${err.message}`);
  }
}

/**
 * Fetch từ VNStock (Python API)
 */
async function fetchVnstock(symbol: string) {
  try {
    if (!VNSTOCK_API_URL) {
      throw new Error("VNSTOCK_API_URL not set");
    }

    const res = await fetch(
      `${VNSTOCK_API_URL}?symbols=${symbol}`,
      {
        cache: "no-store",
      }
    );

    const data = await res.json();

    if (!data || !data[symbol]) {
      throw new Error("No VNStock price");
    }

    return {
      price: data[symbol],
      change: 0,
      pct: 0,
      volume: 0,
      previousClose: 0,
      source: "vnstock",
    };
  } catch (err: any) {
    throw new Error(`VNStock failed: ${err.message}`);
  }
}

/**
 * Hybrid logic: Yahoo → fallback VNStock
 */
async function getPrice(symbol: string) {
  // 1. Try Yahoo trước
  try {
    const yahoo = await fetchYahoo(symbol);

    // reject nếu giá = 0 (case lỗi phổ biến)
    if (!yahoo.price || yahoo.price === 0) {
      throw new Error("Invalid Yahoo price");
    }

    return yahoo;
  } catch (yahooError: any) {
    console.log(`Yahoo failed for ${symbol}:`, yahooError.message);

    // 2. fallback VNStock
    try {
      const vn = await fetchVnstock(symbol);
      return vn;
    } catch (vnError: any) {
      console.error(`VNStock failed for ${symbol}:`, vnError.message);

      return {
        price: 0,
        change: 0,
        pct: 0,
        volume: 0,
        previousClose: 0,
        source: "none",
        error: "Both Yahoo and VNStock failed",
      };
    }
  }
}

/**
 * API handler
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get("symbols") || "";

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const prices: Record<string, number> = {};
  const debug: any[] = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      const result = await getPrice(symbol);

      prices[symbol] = result.price;

      debug.push({
        symbol,
        ticker: `${symbol}.VN`,
        ...result,
      });
    })
  );

  return Response.json({
    prices,
    updatedAt: new Date().toISOString(),
    provider: "hybrid",
    debug,
  });
        }
