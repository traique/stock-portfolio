'use client';

import { useEffect, useState } from 'react';

// Cache trong RAM (dùng chung mọi card) + localStorage (giữ qua F5).
const memCache = new Map<string, string | null>();

function readSeed(key: string): string | null {
  if (memCache.has(key)) return memCache.get(key) ?? null;
  if (typeof window !== 'undefined') {
    const ls = window.localStorage.getItem(`lcta_cname_${key}`);
    if (ls) {
      memCache.set(key, ls);
      return ls;
    }
  }
  return null;
}

function persist(key: string, value: string | null) {
  if (!value) return;
  memCache.set(key, value);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`lcta_cname_${key}`, value);
  }
}

/**
 * Lấy tên công ty của 1 mã từ DNSE (qua /api/company/[symbol]).
 * Trả null nếu chưa có / không lấy được -> UI hiện fallback.
 */
export function useCompanyName(symbol: string): string | null {
  const key = (symbol ?? '').trim().toUpperCase();
  const [name, setName] = useState<string | null>(() => readSeed(key));

  useEffect(() => {
    if (!key) return;

    const cached = readSeed(key);
    if (cached) {
      setName(cached);
      return;
    }

    let cancelled = false;
    fetch(`/api/company/${key}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { name?: string | null } | null) => {
        const v = data?.name ?? null;
        persist(key, v);
        if (!cancelled) setName(v);
      })
      .catch(() => {
        if (!cancelled) setName(null);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return name;
}

/**
 * Lấy tên công ty cho NHIỀU mã cùng lúc -> trả map { SYMBOL: name }.
 * Dùng ở Holdings để không phải gọi hook trong vòng lặp .map().
 * Tự seed từ cache, chỉ gọi API cho mã chưa có.
 */
export function useCompanyNames(symbols: string[]): Record<string, string | null> {
  // Key ổn định theo nội dung (đã sort + dedupe) để tránh fetch lặp mỗi render.
  const key = Array.from(
    new Set(symbols.map((s) => (s ?? '').trim().toUpperCase()).filter(Boolean)),
  )
    .sort()
    .join(',');

  const [names, setNames] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!list.length) return;

    let cancelled = false;

    // 1) Seed ngay từ cache
    const seeded: Record<string, string | null> = {};
    for (const s of list) {
      const c = readSeed(s);
      if (c) seeded[s] = c;
    }
    if (Object.keys(seeded).length) {
      setNames((prev) => ({ ...prev, ...seeded }));
    }

    // 2) Chỉ gọi API cho mã chưa có cache
    const missing = list.filter((s) => !readSeed(s));
    if (missing.length) {
      Promise.allSettled(
        missing.map(async (s) => {
          const r = await fetch(`/api/company/${s}`);
          const data = r.ok ? ((await r.json()) as { name?: string | null }) : null;
          const v = data?.name ?? null;
          persist(s, v);
          return { s, v };
        }),
      ).then((results) => {
        if (cancelled) return;
        const map: Record<string, string | null> = {};
        results.forEach((res) => {
          if (res.status === 'fulfilled') map[res.value.s] = res.value.v;
        });
        setNames((prev) => ({ ...prev, ...map }));
      });
    }

    return () => {
      cancelled = true;
    };
  }, [key]);

  return names;
        }
