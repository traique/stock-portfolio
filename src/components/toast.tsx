'use client';

// ─────────────────────────────────────────────────────────────
// Toast system dùng chung cho toàn app.
// - Không cần Provider/Context: dùng event emitter module-level,
//   import { toast } từ bất kỳ client component nào là chạy.
// - Dùng token z-index --z-toast (đã định nghĩa trong globals.css).
// - Tôn trọng prefers-reduced-motion qua class CSS sẵn có.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  leaving?: boolean;
};

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const fn of listeners) fn(items);
}

function dismiss(id: number) {
  // Animation thoát 200ms rồi mới gỡ khỏi danh sách
  items = items.map(t => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.set(id, setTimeout(() => {
    items = items.filter(t => t.id !== id);
    timers.delete(id);
    emit();
  }, 200));
}

/** Gọi từ bất kỳ đâu trong client component: toast.success('Đã lưu') */
export const toast = {
  success: (message: string) => push('success', message),
  error:   (message: string) => push('error', message),
  info:    (message: string) => push('info', message),
};

function push(kind: ToastKind, message: string) {
  const id = nextId++;
  items = [...items.slice(-3), { id, kind, message }]; // tối đa 4 toast cùng lúc
  emit();
  timers.set(id, setTimeout(() => dismiss(id), 3800));
}

const KIND_STYLE: Record<ToastKind, { icon: typeof Info; color: string; bg: string; border: string }> = {
  success: {
    icon: CheckCircle2,
    color: 'var(--green)',
    bg: 'var(--card)',
    border: '1px solid var(--green-border)',
  },
  error: {
    icon: AlertTriangle,
    color: 'var(--red)',
    bg: 'var(--card)',
    border: '1px solid var(--red-border)',
  },
  info: {
    icon: Info,
    color: 'var(--accent)',
    bg: 'var(--card)',
    border: '1px solid var(--border-strong)',
  },
};

export function ToastHost() {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    listeners.add(setList);
    return () => { listeners.delete(setList); };
  }, []);

  return (
    <div
      className="lcta-toast-host"
      style={ {
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 'var(--z-toast)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
        width: 'min(92vw, 420px)',
      } }
    >
      {list.map(t => {
        const s = KIND_STYLE[t.kind];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={t.leaving ? 'lcta-toast lcta-toast-leave' : 'lcta-toast'}
            style={ {
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '11px 14px',
              background: s.bg, border: s.border,
              borderRadius: 16, boxShadow: 'var(--shadow-strong)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              pointerEvents: 'auto',
            } }
          >
            <Icon size={17} color={s.color} style={ { flexShrink: 0 } } />
            <span style={ { flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.45 } }>
              {t.message}
            </span>
            <button
              type="button"
              aria-label="Đóng thông báo"
              onClick={ () => dismiss(t.id) }
              style={ {
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', padding: 4, display: 'flex', flexShrink: 0,
                borderRadius: 8,
              } }
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
