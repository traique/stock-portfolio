const SIEUTINHIEU_HEADERS = {
  Origin: 'https://sieutinhieu.vn',
  Referer: 'https://sieutinhieu.vn/',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 11; SM-A705F Build/RP1A.200720.012; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/146.0.7680.177 Mobile Safari/537.36',
  Accept: '*/*',
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

export async function fetchBacktestData(symbol: string, timeframe = '1D'): Promise<BacktestData> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const normalizedTimeframe = timeframe.trim().toUpperCase() || '1D';

  if (!normalizedSymbol) {
    throw new Error('Missing symbol');
  }

  const upstream = `https://sieutinhieu.vn/api/v1/signals/performance?symbol=${encodeURIComponent(normalizedSymbol)}&timeframe=${normalizedTimeframe}&limit=5000&start=1712676508`;
  const response = await fetch(upstream, {
    headers: SIEUTINHIEU_HEADERS,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Upstream failed: ${response.status}`);
  }

  const payload = await response.json();
  return (payload?.data ?? payload) as BacktestData;
}
