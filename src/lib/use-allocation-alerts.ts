// src/lib/use-allocation-alerts.ts
//
// Hook tính cảnh báo tỷ trọng danh mục.
// Tự động phát hiện khi 1 mã vượt ngưỡng % NAV hoặc % market value.
//
// Cách dùng:
//   const alerts = useAllocationAlerts({ positions, prices, totalAssets, settings });

import { useMemo } from 'react';
import { calcPosition, PositionGroup, PriceMap } from '@/lib/calculations';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AllocationAlertLevel = 'warning' | 'danger';

export type AllocationAlert = {
  symbol:       string;
  pct:          number;   // % tỷ trọng hiện tại
  threshold:    number;   // ngưỡng đã vượt
  level:        AllocationAlertLevel;
  totalNow:     number;   // giá trị thị trường của vị thế
};

export type AllocationAlertSettings = {
  /** % tỷ trọng tính trên tổng tài sản. Default: warning=25, danger=40 */
  warningPct?: number;
  dangerPct?:  number;
  /** Bỏ qua cảnh báo nếu totalAssets quá nhỏ (tránh noise khi mới bắt đầu) */
  minTotalAssets?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAllocationAlerts({
  positions,
  prices,
  totalAssets,
  settings = {},
}: {
  positions:   PositionGroup[];
  prices:      PriceMap;
  totalAssets: number;
  settings?:   AllocationAlertSettings;
}): AllocationAlert[] {
  const {
    warningPct     = 25,
    dangerPct      = 40,
    minTotalAssets = 1_000_000, // 1 triệu VNĐ
  } = settings;

  return useMemo(() => {
    if (!totalAssets || totalAssets < minTotalAssets) return [];

    const alerts: AllocationAlert[] = [];

    for (const pos of positions) {
      const { totalNow } = calcPosition(pos, prices);
      if (!totalNow) continue;

      const pct = (totalNow / totalAssets) * 100;

      if (pct >= dangerPct) {
        alerts.push({ symbol: pos.symbol, pct, threshold: dangerPct, level: 'danger', totalNow });
      } else if (pct >= warningPct) {
        alerts.push({ symbol: pos.symbol, pct, threshold: warningPct, level: 'warning', totalNow });
      }
    }

    // Sort: danger trước, rồi theo pct giảm dần
    return alerts.sort((a, b) => {
      if (a.level !== b.level) return a.level === 'danger' ? -1 : 1;
      return b.pct - a.pct;
    });
  }, [positions, prices, totalAssets, warningPct, dangerPct, minTotalAssets]);
}
