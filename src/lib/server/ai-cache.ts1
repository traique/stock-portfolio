type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

// ── Rate limit store ─────────────────────────────────────────────────────────
// Tracks per-user AI call counts within a sliding window.
// Uses globalThis so the Map survives across hot-reloads in dev.

const g = globalThis as typeof globalThis & {
  __aiCacheStore__?:     Map<string, CacheEntry<unknown>>;
  __aiRateLimitStore__?: Map<string, { count: number; windowStart: number }>;
};

function getCacheStore() {
  if (!g.__aiCacheStore__) g.__aiCacheStore__ = new Map();
  return g.__aiCacheStore__;
}

function getRateLimitStore() {
  if (!g.__aiRateLimitStore__) g.__aiRateLimitStore__ = new Map();
  return g.__aiRateLimitStore__;
}

// ── Config ───────────────────────────────────────────────────────────────────
const RATE_LIMIT_MAX_CALLS   = 10;   // max AI calls per user per window
const RATE_LIMIT_WINDOW_MS   = 60_000; // 1-minute sliding window

// ── Rate limit check ─────────────────────────────────────────────────────────
// Returns true when the user is within limits, false when they have exceeded it.
// Call BEFORE invoking the AI — only increment on actual AI calls (cache hits bypass).

export function checkAiRateLimit(userId: string): boolean {
  const store = getRateLimitStore();
  const now   = Date.now();
  const entry = store.get(userId);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    store.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_CALLS) return false;

  entry.count += 1;
  return true;
}

// Returns seconds until the rate limit window resets for a user.
export function getRateLimitResetSeconds(userId: string): number {
  const entry = getRateLimitStore().get(userId);
  if (!entry) return 0;
  const elapsed = Date.now() - entry.windowStart;
  return Math.max(0, Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000));
}

// ── Cache ────────────────────────────────────────────────────────────────────

export function getAiCache<T>(key: string): T | null {
  const store = getCacheStore();
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry.value;
}

export function setAiCache<T>(key: string, value: T, ttlMs: number) {
  getCacheStore().set(key, {
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
