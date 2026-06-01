import { createClient } from '@supabase/supabase-js';
import { envServer } from '@/lib/env-server';

// ── Free tier constraints ─────────────────────────────────────────────────────
// Supabase Free: 500MB DB, ~50k rows tổng cộng
// Vercel Free: 100GB bandwidth, function timeout 10s
// → TTL dài hơn (ít write hơn), cleanup tích cực hơn, L1 ưu tiên tối đa

// AI cache TTL dài để giảm số lần gọi DB và gọi AI
const DB_MAX_ROWS       = 500;   // Không để ai_cache chiếm quá 500 rows
const CLEANUP_PROB      = 0.05;  // 5% chance cleanup chạy mỗi write (thay vì cron)
const L1_WARM_TTL_MS    = 5 * 60_000; // L1 warm 5 phút sau khi đọc từ DB

// ── Types ─────────────────────────────────────────────────────────────────────

type CacheEntry<T> = { expiresAt: number; value: T };

// ── In-memory layer (L1) ──────────────────────────────────────────────────────

const g = globalThis as typeof globalThis & {
  __aiCacheStore__?:     Map<string, CacheEntry<unknown>>;
  __aiRateLimitStore__?: Map<string, { count: number; windowStart: number }>;
};

function getMemStore() {
  if (!g.__aiCacheStore__) g.__aiCacheStore__ = new Map();
  return g.__aiCacheStore__;
}
function getRateLimitStore() {
  if (!g.__aiRateLimitStore__) g.__aiRateLimitStore__ = new Map();
  return g.__aiRateLimitStore__;
}

// ── Supabase layer (L2) ───────────────────────────────────────────────────────
// Dùng singleton để tránh tạo nhiều connection trên free tier

const g2 = globalThis as typeof globalThis & { __aiCacheClient__?: ReturnType<typeof createClient> };
function getServiceClient() {
  if (!g2.__aiCacheClient__) {
    g2.__aiCacheClient__ = createClient(
      envServer.NEXT_PUBLIC_SUPABASE_URL,
      envServer.SUPABASE_SERVER_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return g2.__aiCacheClient__;
}

// ── Probabilistic cleanup ─────────────────────────────────────────────────────
// Thay vì cron (cần Vercel Pro), cleanup ngẫu nhiên 5% mỗi write.
// Đủ để giữ table nhỏ mà không cần infrastructure thêm.

async function maybeCleanup() {
  if (Math.random() > CLEANUP_PROB) return;
  try {
    const db = getServiceClient();
    // Xóa entries hết hạn
    await db.from('ai_cache').delete().lt('expires_at', new Date().toISOString());

    // Nếu vẫn quá nhiều rows, xóa các entry cũ nhất
    const { count } = await db
      .from('ai_cache')
      .select('*', { count: 'exact', head: true });

    if (count && count > DB_MAX_ROWS) {
      const { data: oldest } = await db
        .from('ai_cache')
        .select('key')
        .order('expires_at', { ascending: true })
        .limit(count - DB_MAX_ROWS);

      if (oldest?.length) {
        const keys = (oldest as { key: string }[]).map(r => r.key);
        await db.from('ai_cache').delete().in('key', keys);
      }
    }
  } catch { /* cleanup failure không block main flow */ }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX_CALLS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

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

export function getRateLimitResetSeconds(userId: string): number {
  const entry = getRateLimitStore().get(userId);
  if (!entry) return 0;
  return Math.max(0, Math.ceil((RATE_LIMIT_WINDOW_MS - (Date.now() - entry.windowStart)) / 1000));
}

// ── Cache read — L1 → L2 ─────────────────────────────────────────────────────

export async function getAiCache<T>(key: string): Promise<T | null> {
  // L1: in-memory (không tốn DB call)
  const mem   = getMemStore();
  const entry = mem.get(key) as CacheEntry<T> | undefined;
  if (entry) {
    if (entry.expiresAt > Date.now()) return entry.value;
    mem.delete(key);
  }

  // L2: Supabase (chỉ khi L1 miss — cold start hoặc instance mới)
  try {
    const { data, error } = await getServiceClient()
      .from('ai_cache')
      .select('value, expires_at')
      .eq('key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle() as { data: { value: T; expires_at: string } | null; error: unknown };

    if (error || !data) return null;

    const value     = data.value;
    const expiresAt = new Date(data.expires_at).getTime();

    // Warm L1 với TTL ngắn hơn để tránh stale quá lâu
    mem.set(key, { value, expiresAt: Math.min(expiresAt, Date.now() + L1_WARM_TTL_MS) });
    return value;
  } catch {
    return null;
  }
}

// ── Cache write — L1 + L2 fire-and-forget ────────────────────────────────────

export async function setAiCache<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const ttl       = Math.max(1_000, ttlMs);
  const expiresAt = Date.now() + ttl;

  // L1 ngay lập tức
  getMemStore().set(key, { value, expiresAt });

  // L2 fire-and-forget — không await để không block response
  const expiresAtIso = new Date(expiresAt).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (getServiceClient().from('ai_cache') as any)
    .upsert({ key, value, expires_at: expiresAtIso }, { onConflict: 'key' })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn('[ai-cache] DB write failed:', error.message);
      else maybeCleanup();
    });
}

// ── Meta helper ───────────────────────────────────────────────────────────────

export function buildAiCacheMeta(ttlMs: number) {
  return {
    cached:            true,
    cache_ttl_seconds: Math.round(ttlMs / 1000),
    cached_at:         new Date().toISOString(),
  };
}

// ── Test exports ──────────────────────────────────────────────────────────────

export const _cacheInternals = { getMemStore, getRateLimitStore };
