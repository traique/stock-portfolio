const HEADER_PROFILES: Array<Record<string, string> | undefined> = [
  {
    Origin: 'https://sieutinhieu.vn',
    Referer: 'https://sieutinhieu.vn/',
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 11; SM-A705F Build/RP1A.200720.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  {
    Origin: 'https://sieutinhieu.vn',
    Referer: 'https://sieutinhieu.vn/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  undefined,
];

const DEFAULT_START = 1712824910;

type FetchAttemptOptions = {
  symbol: string;
  timeframe: string;
  limit: number;
  start: number;
  headers?: Record<string, string>;
};

export type BacktestTrade = {
  side?: string;
  entry_price?: number;
  exit_price?: number;
  pnl_pct?: number;
  entry_ts?: number;
  exit_ts?: number;
};

export type BacktestData = {
  symbol?: string;
  win_rate?: number;
  total_pnl_pct?: number;
  total_trades?: number;
  trades?: BacktestTrade[];
};

async function fetchPerformanceAttempt(options: FetchAttemptOptions): Promise<BacktestData> {
  const { symbol, timeframe, limit, start, headers } = options;
  const query = new URLSearchParams({
    symbol,
    timeframe,
    limit: String(limit),
    start: String(start),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`https://sieutinhieu.vn/api/v1/signals/performance?${query.toString()}`, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream failed: ${response.status}`);
    }

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error('Upstream returned non-JSON payload');
    }

    const data = (payload as { data?: BacktestData })?.data ?? (payload as BacktestData);
    if (!data || typeof data !== 'object') {
      throw new Error('Upstream returned empty payload');
    }

    return data as BacktestData;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchBacktestData(symbol: string, timeframe = '1D', limit = 5000, start = DEFAULT_START): Promise<BacktestData> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const normalizedTimeframe = timeframe.trim().toUpperCase() || '1D';
  const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(1, Math.trunc(limit)), 5000) : 5000;
  const normalizedStart = Number.isFinite(start) ? Math.max(1, Math.trunc(start)) : DEFAULT_START;

  if (!normalizedSymbol) {
    throw new Error('Missing symbol');
  }

  const fallbackStarts = [
    normalizedStart,
    DEFAULT_START,
    1712676508,
    Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60,
  ];

  let lastError = 'Unknown error';

  for (const startValue of fallbackStarts) {
    for (const headers of HEADER_PROFILES) {
      try {
        return await fetchPerformanceAttempt({
          symbol: normalizedSymbol,
          timeframe: normalizedTimeframe,
          limit: normalizedLimit,
          start: startValue,
          headers,
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }
    }
  }

  throw new Error(lastError);
}
