// src/lib/server/providers/vci-edge.ts
//
// Gọi Supabase Edge Function "vci-prices" (chạy ở Singapore)
// để lấy giá HOSE + HNX + UPCOM mà không bị geo-block.

import type { MarketData } from './yahoo';

function safeNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getEdgeUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL chưa được set');
  return `${base.replace(/\/$/, '')}/functions/v1/quick-task`;
}

function getAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY chưa được set');
  return key;
}

interface VciDetail {
  symbol: string;
  price: number;
  ref: number;
  ceiling: number;
  floor: number;
  high: number;
  low: number;
  volume: number;
  exchange: string;
  change: number;
  pct: number;
}

interface VciEdgeResponse {
  prices: Record<string, number>;
  detail: VciDetail[];
  updatedAt: string;
  provider: string;
  error?: string;
}

/**
 * Lấy giá nhiều mã cùng lúc qua Edge Function.
 * Trả về map { symbol → MarketData }.
 */
export async function getVciEdgeBatch(
  symbols: string[],
): Promise<Map<string, MarketData>> {
  const url = getEdgeUrl();
  const key = getAnonKey();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ symbols }),
    // Next.js fetch cache — không cache giá chứng khoán
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`VCI Edge HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data: VciEdgeResponse = await res.json();

  if (data.error) {
    throw new Error(`VCI Edge error: ${data.error}`);
  }

  const resultMap = new Map<string, MarketData>();

  for (const d of data.detail ?? []) {
    const price = safeNumber(d.price);
    if (!price) continue;

    const ref = safeNumber(d.ref);
    const change = price - ref;
    const pct = ref ? (change / ref) * 100 : 0;

    resultMap.set(d.symbol, {
      symbol: d.symbol,
      ticker: d.symbol,
      provider: 'vci-edge',
      price,
      previousClose: ref,
      change,
      pct,
      ceilingPriceEstimate: safeNumber(d.ceiling),
      floorPriceEstimate: safeNumber(d.floor),
      dayHigh: safeNumber(d.high),
      dayLow: safeNumber(d.low),
      marketTime: Date.now(),
      currency: 'VND',
      volume: safeNumber(d.volume),
    });
  }

  return resultMap;
}

/**
 * Lấy giá một mã duy nhất — dùng trong fallback chain của market.ts
 */
export async function getVciEdgeMarketData(
  symbol: string,
): Promise<MarketData> {
  const map = await getVciEdgeBatch([symbol]);
  const data = map.get(symbol);

  if (!data) {
    throw new Error(`VCI Edge: không có dữ liệu cho ${symbol}`);
  }

  return data;
}
