// src/lib/server/providers/vci-chart.ts
//
// OHLCV lịch sử cho HOSE / HNX / UPCOM / VNINDEX qua DNSE Entrade
// (public, không auth, không bị geo-block, chạy tốt từ Vercel).
// DNSE trả giá theo NGHÌN VND (18.3) -> nhân PRICE_SCALE để ra VND thô (18300).

import { normalizeSymbol, isVnIndexSymbol } from '../exchanges/exchange';

// ✨ DNSE tách endpoint theo loại: cổ phiếu = /ohlcs/stock, chỉ số = /ohlcs/index.
// Gửi 'VNINDEX' vào /ohlcs/stock sẽ bị 400 BAD_REQUEST "invalid symbol".
const DNSE_OHLC_BASE = 'https://' + 'services.entrade.com.vn/chart-api/v2/ohlcs';

const PRICE_SCALE = 1000;

const REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};

export type OhlcvSeries = {
  symbol: string;
  count: number;
  timestamps: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
  trade_dates: string[];
};

function toNumberArray(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => Number(x)) : [];
}

function toSeconds(ts: number): number {
  return ts > 1e12 ? Math.floor(ts / 1000) : ts;
}

function toVnd(price: number): number {
  return Math.round(price * PRICE_SCALE);
}

function emptySeries(symbol: string): OhlcvSeries {
  return {
    symbol,
    count: 0,
    timestamps: [],
    opens: [],
    highs: [],
    lows: [],
    closes: [],
    volumes: [],
    trade_dates: [],
  };
}

/**
 * Lấy OHLCV ngày (1D) cho 1 mã. Giá trả về ở đơn vị VND thô.
 */
export async function getVciChartOHLCV(
  symbol: string,
  days = 90,
): Promise<OhlcvSeries> {
  const sym = normalizeSymbol(symbol);
  const isIndex = isVnIndexSymbol(sym);
  const dnseSymbol = isIndex ? 'VNINDEX' : sym;
  // ✨ Chỉ số dùng /ohlcs/index; cổ phiếu dùng /ohlcs/stock (tránh 400 invalid symbol).
  const endpoint = isIndex ? `${DNSE_OHLC_BASE}/index` : `${DNSE_OHLC_BASE}/stock`;

  const to = Math.floor(Date.now() / 1000);
  const from = to - Math.ceil(days * 1.6 + 10) * 86400;

  const url =
    `${endpoint}?from=${from}&to=${to}` +
    `&symbol=${encodeURIComponent(dnseSymbol)}&resolution=1D`;

  const res = await fetch(url, {
    method: 'GET',
    headers: REQUEST_HEADERS,
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DNSE OHLC HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();

  const t = toNumberArray(data?.t);
  if (t.length === 0) return emptySeries(sym);

  const o = toNumberArray(data.o);
  const h = toNumberArray(data.h);
  const l = toNumberArray(data.l);
  const c = toNumberArray(data.c);
  const v = toNumberArray(data.v);

  const bars = t
    .map((ts, i) => ({
      t: toSeconds(ts),
      o: o[i],
      h: h[i],
      l: l[i],
      c: c[i],
      v: v[i] ?? 0,
    }))
    .filter((b) => Number.isFinite(b.c) && b.c > 0)
    .sort((a, b) => a.t - b.t);

  const sliced = bars.slice(-days);

  return {
    symbol: sym,
    count: sliced.length,
    timestamps: sliced.map((b) => b.t),
    opens: sliced.map((b) => toVnd(Number.isFinite(b.o) && b.o > 0 ? b.o : b.c)),
    highs: sliced.map((b) => toVnd(Number.isFinite(b.h) && b.h > 0 ? b.h : b.c)),
    lows: sliced.map((b) => toVnd(Number.isFinite(b.l) && b.l > 0 ? b.l : b.c)),
    closes: sliced.map((b) => toVnd(b.c)),
    volumes: sliced.map((b) => (Number.isFinite(b.v) ? b.v : 0)),
    trade_dates: sliced.map((b) =>
      new Date(b.t * 1000).toISOString().slice(0, 10),
    ),
  };
}
