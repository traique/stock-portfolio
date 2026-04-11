const SIEUTINHIEU_HEADERS = {
  Origin: 'https://sieutinhieu.vn',
  Referer: 'https://sieutinhieu.vn/',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 11; SM-A705F Build/RP1A.200720.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
};

const DEFAULT_START = 1712824910;

type FetchAttemptOptions = {
  symbol: string;
  timeframe: string;
  limit: number;
  start: number;
  useHeaders: boolean;
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
  const { symbol, timeframe, limit, start, useHeaders } = options;
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
      headers: useHeaders ? SIEUTINHIEU_HEADERS : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream failed: ${response.status}`);
    }

    const payload = await response.json();
    return (payload?.data ?? payload) as BacktestData;
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

  try {
    return await fetchPerformanceAttempt({
      symbol: normalizedSymbol,
      timeframe: normalizedTimeframe,
      limit: normalizedLimit,
      start: normalizedStart,
      useHeaders: true,
    });
  } catch {
    return fetchPerformanceAttempt({
      symbol: normalizedSymbol,
      timeframe: normalizedTimeframe,
      limit: normalizedLimit,
      start: normalizedStart,
      useHeaders: false,
    });
  }
}
