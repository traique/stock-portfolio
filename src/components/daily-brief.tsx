'use client';

// ─────────────────────────────────────────────────────────────
// Daily Brief — khối mở đầu dashboard nhằm giữ chân người dùng:
//  1. Lời chào theo giờ trong ngày (cá nhân hoá)
//  2. Streak "quay lại mỗi ngày" (đếm ở localStorage — nhẹ, không cần backend;
//     nếu muốn chống reset máy khác thì nâng lên lưu vào portfolio_settings)
//  3. Insight 1 dòng từ dữ liệu danh mục hiện có → lý do đọc tiếp
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Flame, TrendingUp, TrendingDown, Sunrise } from 'lucide-react';

const STREAK_KEY = (userId: string) => `lcta_streak_${userId}`;
const LAST_SEEN_KEY = (userId: string) => `lcta_last_seen_${userId}`;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function greet(): string {
  // Giờ VN bất kể múi giờ máy
  const hour = Number(
    new Date().toLocaleString('en-US', {
      hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh',
    }),
  );
  if (hour >= 5 && hour < 12)  return 'Chào buổi sáng';
  if (hour >= 12 && hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

type Props = {
  userId: string;
  totalAssets: number;
  totalPnlPct: number;
  dayPnl: number;
  positionsCount: number;
};

export function DailyBrief({ userId, totalAssets, totalPnlPct, dayPnl, positionsCount }: Props) {
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    try {
      const today     = dayKey(new Date());
      const yesterday = dayKey(new Date(Date.now() - 86_400_000));
      const last      = localStorage.getItem(LAST_SEEN_KEY(userId));
      let current     = Number(localStorage.getItem(STREAK_KEY(userId)) ?? '0');

      if (last !== today) {
        current = last === yesterday ? current + 1 : 1;
        localStorage.setItem(STREAK_KEY(userId), String(current));
        localStorage.setItem(LAST_SEEN_KEY(userId), today);
      }
      setStreak(Math.max(current, 1));
    } catch { /* localStorage chặn (private mode) → ẩn streak, không vỡ UI */ }
  }, [userId]);

  const hasData   = totalAssets > 0;
  const pnlUp     = dayPnl > 0;
  const pnlDown   = dayPnl < 0;
  const fmt       = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

  const insight = !hasData
    ? positionsCount === 0
      ? 'Thêm giao dịch mua đầu tiên để AI bắt đầu theo dõi danh mục của bạn.'
      : 'Danh mục của bạn đang ở trạng thái tiền mặt — cân nhắc rà lại các mã theo dõi.'
    : pnlUp
      ? `Danh mục đang ${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}% — hôm nay ${fmt.format(dayPnl)}₫ so với tham chiếu.`
      : pnlDown
        ? `Hôm nay danh mục ${fmt.format(dayPnl)}₫ — mở AI Scan để rà tín hiệu bán trước khi sâu hơn.`
        : `Danh mục đi ngang ở ${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}% — ngày tốt để rà lại điểm mua/bán bằng AI Scan.`;

  return (
    <section
      className="ab-premium-card lcta-brief"
      style={ {
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        padding: '16px 20px',
        background: 'linear-gradient(120deg, var(--card) 55%, var(--green-surface))',
      } }
      aria-label="Tóm tắt hôm nay"
    >
      <div style={ { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } }>
        <Sunrise size={20} color="var(--accent)" style={ { flexShrink: 0 } } />
        <div style={ { minWidth: 0 } }>
          <div style={ { fontSize: 16, fontWeight: 800, color: 'var(--text)' } }>
            {greet()} 👋
          </div>
          <div style={ {
            fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
          } }>
            {insight}
          </div>
        </div>
      </div>

      <div style={ { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 } }>
        {(pnlUp || pnlDown) && (
          <span
            className="num-premium"
            style={ {
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 800, padding: '5px 11px', borderRadius: 99,
              color: pnlUp ? 'var(--green)' : 'var(--red)',
              background: pnlUp ? 'var(--green-surface)' : 'var(--red-surface)',
              border: `1px solid ${pnlUp ? 'var(--green-border)' : 'var(--red-border)'}`,
            } }
          >
            {pnlUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {pnlUp ? '+' : ''}{fmt.format(dayPnl)}₫ hôm nay
          </span>
        )}

        {streak != null && (
          <span
            title="Số ngày liên tiếp bạn quay lại xem danh mục"
            style={ {
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 800, padding: '5px 11px', borderRadius: 99,
              color: '#f59e0b', background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.25)', cursor: 'help',
            } }
          >
            <Flame size={13} />
            {streak} ngày liên tiếp
          </span>
        )}
      </div>
    </section>
  );
}
