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

/**
 * Lấy tên công ty của mã từ DNSE (qua /api/company/[symbol]).
 * Trả null nếu chưa có / không lấy được -> UI hiện "Cổ phiếu".
 */
export function useCompanyName(symbol: string): string | null {
  const key = (symbol ?? '').trim().toUpperCase();
  const [name, setName] = useState<string | null>(() => readSeed(key));

  useEffect(() => {
    if (!key) return;

    // Đã có tên trong cache -> dùng luôn, khỏi gọi lại
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
        if (v) {
          memCache.set(key, v);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(`lcta_cname_${key}`, v);
          }
        }
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
