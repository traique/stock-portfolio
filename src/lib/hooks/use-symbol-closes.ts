'use client';
import { useEffect, useRef, useState } from 'react';

type ClosesMap = Record<string, number[]>;

/**
 * Hook chuyên trách tải lịch sử giá đóng cửa cho danh sách mã.
 * - Cache theo phiên: chỉ fetch mã CHƯA có dữ liệu.
 * - AbortController: hủy request khi đổi danh mục / unmount.
 * - Khóa ổn định: chỉ chạy lại khi *tập* mã đổi (bỏ qua khác thứ tự).
 */
export function useSymbolCloses(symbols: string[], days = 90): ClosesMap {
  const [closesMap, setClosesMap] = useState<ClosesMap>({});
  const cacheRef = useRef<Map<string, number[]>>(new Map());

  // Khóa ổn định cho effect.
  const key = [...symbols].sort().join(',');

  useEffect(() => {
    if (!symbols.length) {
      setClosesMap({});
      return;
    }

    const controller = new AbortController();
    const cache = cacheRef.current;

    // Chỉ fetch những mã CHƯA có trong cache.
    const missing = symbols.filter((s) => !cache.has(s));

    const buildFromCache = () =>
      Object.fromEntries(
        symbols.filter((s) => cache.has(s)).map((s) => [s, cache.get(s)!]),
      );

    // Mọi mã đã có cache → set ngay, không gọi mạng.
    if (missing.length === 0) {
      setClosesMap(buildFromCache());
      return;
    }

    Promise.allSettled(
      missing.map(async (sym) => {
        const res = await fetch(
          `/api/history/${encodeURIComponent(sym)}?days=${days}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error('skip');
        const json = await res.json();
        const closes: number[] = (json?.closes ?? [])
          .map(Number)
          .filter((v: number) => Number.isFinite(v) && v > 0);
        if (closes.length <= 5) throw new Error('skip');
        return [sym, closes] as const;
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      for (const r of results) {
        if (r.status === 'fulfilled') cache.set(r.value[0], r.value[1]);
      }
      setClosesMap(buildFromCache());
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, days]);

  return closesMap;
           }
