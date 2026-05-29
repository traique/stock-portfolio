// src/lib/server/providers/ssi.ts
//
// Helper nhận diện mã cổ phiếu Việt Nam (HOSE / HNX / UPCOM).
// Dùng EXCHANGE_MAP — cùng nguồn với exchange.ts — để kiểm tra.

import { EXCHANGE_MAP } from '../exchanges/exchange-map';
import { isVnIndexSymbol, normalizeSymbol } from '../exchanges/exchange';

/**
 * Trả về true nếu symbol là mã VN niêm yết trên HOSE / HNX / UPCOM.
 * VNINDEX không phải cổ phiếu nên trả false.
 */
export function isVietnamStock(symbol: string): boolean {
  const s = normalizeSymbol(symbol);
  if (isVnIndexSymbol(s)) return false;
  return s in EXCHANGE_MAP;
}
