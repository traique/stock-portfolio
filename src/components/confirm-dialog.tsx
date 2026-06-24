'use client';

import { useCallback, useEffect, useRef } from 'react';

export type ConfirmDialogProps = {
  open:       boolean;
  title:      string;
  message:    string;
  confirmLabel?: string;
  danger?:    boolean;
  onConfirm:  () => void;
  onCancel:   () => void;
};

export function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Xác nhận',
  danger = false,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef  = useRef<HTMLButtonElement>(null);

  // ✨ FIX: hành động nguy hiểm (xoá, không thể hoàn tác) → focus mặc định vào
  // nút AN TOÀN (Huỷ), không phải nút Xoá — tránh lỡ tay bấm Enter là mất dữ
  // liệu vĩnh viễn. Hành động bình thường thì vẫn focus nút xác nhận như cũ.
  useEffect(() => {
    if (!open) return;
    (danger ? cancelRef : confirmRef).current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, danger, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onClick={onCancel}
      style={{
        position:        'fixed',
        inset:           0,
        zIndex:          9999,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         20,
        background:      'rgba(0,0,0,0.5)',
        backdropFilter:  'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:    'var(--card)',
          border:        '1px solid var(--border)',
          borderRadius:  24,
          padding:       28,
          maxWidth:      400,
          width:         '100%',
          display:       'flex',
          flexDirection: 'column',
          gap:           20,
          boxShadow:     '0 24px 48px rgba(0,0,0,0.2)',
        }}
      >
        {/* Icon */}
        <div style={{
          width:           48,
          height:          48,
          borderRadius:    14,
          background:      danger ? 'rgba(244,63,94,0.1)' : 'rgba(59,130,246,0.1)',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          fontSize:        22,
        }}>
          {danger ? '⚠️' : 'ℹ️'}
        </div>

        {/* Text */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div id="confirm-title" style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
            {title}
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            {message}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{
              flex:         1,
              height:       44,
              borderRadius: 999,
              border:       '1px solid var(--border)',
              background:   'var(--soft)',
              color:        'var(--text)',
              fontSize:     14,
              fontWeight:   700,
              cursor:       'pointer',
            }}
          >
            Huỷ
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={{
              flex:         1,
              height:       44,
              borderRadius: 999,
              border:       'none',
              background:   danger
                ? 'linear-gradient(135deg, #f43f5e, #e11d48)'
                : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color:        '#fff',
              fontSize:     14,
              fontWeight:   700,
              cursor:       'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
