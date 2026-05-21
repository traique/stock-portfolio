// src/lib/server/price-cache-v2.ts
//
// Price cache 2 tầng:
//   1. In-memory (globalThis) — instant, nhưng mất khi instance cold start
//   2. Supabase table `price_cache` — persist qua mọi serverless instance
//
// TTL: 60 giây (giá CK không cần realtime hơn)
//
// Schema Supabase (chạy 1 lần):
// ─────────────────────────────────────────────────────
// create table if not exists price_cache (
//   cache_key   text primary key,
//   payload     jsonb not null,
//   expires_at  timestamptz not null
// );
// -- Auto-cleanup: xóa row cũ khi upsert (optional, dùng pg_cron nếu muốn)
// create index if not exists price_cache_expires_idx on price_cache (expires_at);
// ─────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

type MemCacheEntry<T> = {
  value:     T;
  expiresAt: number;  // epoch ms
};

// ─── Tầng 1: In-memory ───────────────────────────────────────────────────────

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

// ─── Tầng 2: Supabase ────────────────────────────────────────────────────────

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
  } catch {
    return null;
  }
}

async function setSupaCached<T>(cacheKey: string, value: T, ttlMs: number): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;

    await sb.from('price_cache').upsert(
      {
        cache_key:  cacheKey,
        payload:    value,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      },
      { onConflict: 'cache_key' },
    );
  } catch {
    // cache write failure không được làm hỏng main flow
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getCachedValue<T>(key: string): Promise<T | null> {
  // Tầng 1: memory hit → trả ngay
  const mem = getMemCached<T>(key);
  if (mem !== null) return mem;

  // Tầng 2: Supabase hit → nạp lại memory rồi trả
  const supa = await getSupaCached<T>(key);
  if (supa !== null) {
    setMemCached(key, supa, 60_000); // repopulate memory cache
    return supa;
  }

  return null;
}

export async function setCachedValue<T>(key: string, value: T, ttlMs: number): Promise<void> {
  setMemCached(key, value, ttlMs);
  await setSupaCached(key, value, ttlMs);
}

export function buildPriceCacheKey(symbols: string[]): string {
  return symbols.slice().sort().join(',');
      }
