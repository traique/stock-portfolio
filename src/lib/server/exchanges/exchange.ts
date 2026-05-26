import { EXCHANGE_MAP } from './exchange-map';

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function isVnIndexSymbol(symbol: string): boolean {
  const s = normalizeSymbol(symbol);

  return s === 'VNINDEX' || s === '^VNINDEX';
}

export function getExchange(symbol: string): string | null {
  const s = normalizeSymbol(symbol);

  return EXCHANGE_MAP[s] ?? null;
}

export function getTradingViewSymbol(
  symbol: string,
): string | null {
  const s = normalizeSymbol(symbol);

  if (isVnIndexSymbol(s)) {
    return 'HOSE:VNINDEX';
  }

  const exchange = getExchange(s);

  if (!exchange) {
    return null;
  }

  return `${exchange}:${s}`;
}

export function getYahooSymbol(symbol: string): string {
  const s = normalizeSymbol(symbol);

  if (isVnIndexSymbol(s)) {
    return '^VNINDEX';
  }

  return `${s}.VN`;
}
