// src/lib/server/price-cache-v2.ts
import { createClient } from '@supabase/supabase-js';

type MemCacheEntry<T> = { value: T; expiresAt: number };

const g = globalThis as typeof globalThis & {
  __priceCacheStoreV2__?: Map<string, MemCacheEntry<unknown>>;
};

function getMemStore() {
  if (!g.__priceCacheStoreV2__) g.__priceCacheStoreV2__ = new Map();
  return g.__priceCacheStoreV2__;
}

function getMemCached<T>(key: string): T | null {
  const entry = getMemStore().get(key) as MemCacheEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) {
    getMemStore().delete(key);
    return null;
  }
  return entry.value;
}

function setMemCached<T>(key: string, value: T, ttlMs: number) {
  getMemStore().set(key, { value, expiresAt: Date.now() + ttlMs });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVER_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getSupaCached<T>(cacheKey: string): Promise<T | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from('price_cache')
      .select('payload, expires_at')
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return data.payload as T;
  } catch { return null; }
}

async function setSupaCached<T>(cacheKey: string, value: T, ttlMs: number): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('price_cache').upsert(
      { cache_key: cacheKey, payload: value, expires_at: new Date(Date.now() + ttlMs).toISOString() },
      { onConflict: 'cache_key' },
    );
  } catch { /* cache write failure không làm hỏng main flow */ }
}

// Kiểm tra payload có giá hợp lệ không — không cache kết quả rỗng
function hasValidPrices(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  const prices = payload.prices as Record<string, number> | undefined;
  if (!prices) return false;
  // Phải có ít nhất 1 mã có giá > 0
  return Object.values(prices).some(p => Number(p) > 0);
}

export async function getCachedValue<T>(key: string): Promise<T | null> {
  const mem = getMemCached<T>(key);
  if (mem !== null) return mem;
  const supa = await getSupaCached<T>(key);
  if (supa !== null) {
    setMemCached(key, supa, 60_000);
    return supa;
  }
  return null;
}

export async function setCachedValue<T>(key: string, value: T, ttlMs: number): Promise<void> {
  // Không cache nếu tất cả giá đều = 0
  if (!hasValidPrices(value)) {
    console.warn(`[price-cache] Bỏ qua cache cho "${key}" vì không có giá hợp lệ`);
    return;
  }
  setMemCached(key, value, ttlMs);
  await setSupaCached(key, value, ttlMs);
}

export function buildPriceCacheKey(symbols: string[]): string {
  return symbols.slice().sort().join(',');
}
