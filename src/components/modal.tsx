'use client';

// ─────────────────────────────────────────────────────────────
// Modal dùng chung, chuẩn a11y (đối xứng với confirm-dialog.tsx):
// - role="dialog" + aria-modal + aria-label
// - Đóng bằng Escape + click backdrop
// - Focus trap (Tab luân chuyển trong modal), focus phần tử đầu tiên khi mở,
//   trả focus về phần tử đã focus trước khi mở khi đóng
// - Body không cuộn khi modal mở
// Dùng token z-index --z-modal (thay cho các zIndex cứng 999/9999 rải rác).
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  maxWidth?: number;
  children: React.ReactNode;
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, ariaLabel, maxWidth = 560, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }

    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (!focusables.length) return;

    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus phần tử focusable đầu tiên (fallback: chính panel)
    requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      style={ {
        position: 'fixed', inset: 0,
        background: 'rgba(2,6,18,0.55)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 'var(--z-modal)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      } }
      onMouseDown={ e => { if (e.target === e.currentTarget) onClose(); } }
    >
      <div
        ref={ panelRef }
        role="dialog"
        aria-modal="true"
        aria-label={ ariaLabel }
        tabIndex={ -1 }
        className="lcta-modal-panel"
        style={ {
          position: 'relative',
          width: '100%', maxWidth,
          maxHeight: '85dvh', overflowY: 'auto',
          background: 'var(--card)', border: '1px solid var(--border-strong)',
          borderRadius: 24, padding: 20,
          boxShadow: 'var(--shadow-strong)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          outline: 'none',
        } }
      >
        <button
          type="button"
          aria-label="Đóng"
          onClick={ onClose }
          className="ab-icon-btn"
          style={ { position: 'absolute', top: 12, right: 12 } }
        >
          <X size={15} />
        </button>
        {children}
      </div>
    </div>
  );
}
