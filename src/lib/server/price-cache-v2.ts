type PriceCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const globalForPriceCache = globalThis as typeof globalThis & {
  __priceCacheStoreV2__?: Map<string, PriceCacheEntry<unknown>>;
};

function getStore() {
  if (!globalForPriceCache.__priceCacheStoreV2__) {
    globalForPriceCache.__priceCacheStoreV2__ = new Map();
  }
  return globalForPriceCache.__priceCacheStoreV2__;
}

export function getCachedValue<T>(key: string): T | null {
  const store = getStore();
  const entry = store.get(key) as PriceCacheEntry<T> | undefined;
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }

  return entry.value;
}

export function setCachedValue<T>(key: string, value: T, ttlMs: number) {
  const store = getStore();
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function buildPriceCacheKey(symbols: string[]) {
  return symbols.slice().sort().join(',');
}
