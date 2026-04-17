type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const aiCacheStore = new Map<string, CacheEntry<unknown>>();

export function getAiCache<T>(key: string): T | null {
  const entry = aiCacheStore.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    aiCacheStore.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setAiCache<T>(key: string, value: T, ttlMs: number) {
  aiCacheStore.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1_000, ttlMs),
  });
}

export function buildAiCacheMeta(ttlMs: number) {
  return {
    cached: true,
    cache_ttl_seconds: Math.round(ttlMs / 1000),
    cached_at: new Date().toISOString(),
  };
}
