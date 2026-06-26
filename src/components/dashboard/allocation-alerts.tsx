// src/components/dashboard/allocation-alerts.tsx
//
// Banner cảnh báo tỷ trọng danh mục — hiển thị ngay trên dashboard
// khi 1 mã vượt ngưỡng warning (25%) hoặc danger (40%) tổng tài sản.
//
// Cách dùng trong dashboard/page.tsx:
//   <AllocationAlerts alerts={allocationAlerts} totalAssets={totalAssets} settings={...} onSettings={...} />

'use client';

import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react';
import { AlertTriangle, X, TrendingUp, Settings2 } from 'lucide-react';
import type { AllocationAlert, AllocationAlertSettings } from '@/lib/use-allocation-alerts';

// ──────────────────────────────────────────────────────────────────────
// Formatters (tạo 1 lần ở module-level — không khởi tạo lại mỗi render)
// ──────────────────────────────────────────────────────────────────────

const vnFmt  = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtVnd = (v: number) => {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}T`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  return vnFmt.format(v);
};

// ──────────────────────────────────────────────────────────────────────
// Colour palette
// ──────────────────────────────────────────────────────────────────────

const DANGER_BG    = 'rgba(244,63,94,0.08)';
const DANGER_BORD  = 'rgba(244,63,94,0.25)';
const DANGER_TEXT  = '#f43f5e';
const WARNING_BG   = 'rgba(245,158,11,0.08)';
const WARNING_BORD = 'rgba(245,158,11,0.25)';
const WARNING_TEXT = '#f59e0b';

// Màu nền/viền mềm theo từng dòng cảnh báo — hằng số, không tính lại trong map.
const ROW_DANGER_BG   = 'rgba(244,63,94,0.06)';
const ROW_DANGER_BORD = 'rgba(244,63,94,0.18)';
const ROW_WARN_BG     = 'rgba(245,158,11,0.06)';
const ROW_WARN_BORD   = 'rgba(245,158,11,0.18)';

// ──────────────────────────────────────────────────────────────────────
// STATIC STYLES (hoist 1 lần — trước đây mỗi <div>/<button> trong vòng map tạo object mới
// mỗi render, nhân với số mã cảnh báo → nhiều allocation rác. Giờ chỉ spread phần động.)
// ──────────────────────────────────────────────────────────────────────

const HEADER_ROW: CSSProperties    = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 };
const HEADER_LEFT: CSSProperties   = { display: 'flex', alignItems: 'center', gap: 8 };
const SETTINGS_WRAP: CSSProperties = { position: 'relative' };
const SETTINGS_BTN: CSSProperties  = { background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted)', display: 'flex', alignItems: 'center' };
const ROWS_WRAP: CSSProperties     = { display: 'flex', flexDirection: 'column', gap: 8 };
const ROW_BASE: CSSProperties      = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 12, padding: '10px 14px' };
const ROW_LEFT: CSSProperties      = { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 };
const BAR_TRACK: CSSProperties     = { flex: 1, height: 6, background: 'var(--soft)', borderRadius: 999, overflow: 'hidden' };
const BAR_FILL_BASE: CSSProperties = { height: '100%', borderRadius: 999, transition: 'width 0.4s ease' };
const STATS_WRAP: CSSProperties    = { display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 };
const STATS_RIGHT: CSSProperties   = { textAlign: 'right' };
const STATS_SUB: CSSProperties     = { fontSize: 10, fontWeight: 700, color: 'var(--muted)' };
const BADGE_BASE: CSSProperties    = { fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, letterSpacing: '0.04em', whiteSpace: 'nowrap' };
const DISMISS_BTN: CSSProperties   = { background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted)', display: 'flex', alignItems: 'center' };
const FOOTER: CSSProperties        = { fontSize: 11, color: 'var(--muted)', fontWeight: 700 };
const ICON_FLEX: CSSProperties     = { flexShrink: 0 };

// Settings panel statics
const PANEL: CSSProperties           = { position: 'absolute', top: 40, right: 0, zIndex: 20, background: 'var(--card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: '14px 16px', minWidth: 220, boxShadow: 'var(--shadow-strong)', backdropFilter: 'blur(24px)' };
const PANEL_TITLE: CSSProperties     = { fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginBottom: 12, letterSpacing: '0.04em' };
const PANEL_ROW: CSSProperties       = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 };
const PANEL_INPUT: CSSProperties     = { borderRadius: 999, background: 'var(--soft)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 700, padding: '6px 12px', width: 72, textAlign: 'right' };
const PANEL_ACTIONS: CSSProperties   = { display: 'flex', gap: 8, marginTop: 4 };
const PANEL_BTN_CANCEL: CSSProperties = { flex: 1, padding: '7px 0', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--soft)', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const PANEL_BTN_SAVE: CSSProperties  = { flex: 1, padding: '7px 0', borderRadius: 999, border: 'none', background: 'var(--text)', color: 'var(--bg)', fontSize: 12, fontWeight: 800, cursor: 'pointer' };

// ──────────────────────────────────────────────────────────────────────
// Settings panel (inline, không cần modal)
// ──────────────────────────────────────────────────────────────────────

const SettingsPanel = memo(function SettingsPanel({
  value,
  onChange,
  onClose,
}: {
  value:    AllocationAlertSettings;
  onChange: (v: AllocationAlertSettings) => void;
  onClose:  () => void;
}) {
  const [warning, setWarning] = useState(String(value.warningPct ?? 25));
  const [danger,  setDanger]  = useState(String(value.dangerPct  ?? 40));

  const save = useCallback(() => {
    const w = Math.min(99, Math.max(1, Number(warning) || 25));
    const d = Math.min(99, Math.max(w + 1, Number(danger) || 40));
    onChange({ ...value, warningPct: w, dangerPct: d });
    onClose();
  }, [warning, danger, value, onChange, onClose]);

  const fields = [
    { label: 'Cảnh báo (%)',  val: warning, set: setWarning, color: WARNING_TEXT },
    { label: 'Nguy hiểm (%)', val: danger,  set: setDanger,  color: DANGER_TEXT  },
  ];

  return (
    <div style={PANEL}>
      <div style={PANEL_TITLE}>NGƯỠNG CẢNH BÁO</div>
      {fields.map(({ label, val, set, color }) => (
        <div key={label} style={PANEL_ROW}>
          <span style={ { fontSize: 12, fontWeight: 700, color } }>{label}</span>
          <input type="number" min={1} max={99} value={val} onChange={e => set(e.target.value)} style={PANEL_INPUT} />
        </div>
      ))}
      <div style={PANEL_ACTIONS}>
        <button type="button" onClick={onClose} style={PANEL_BTN_CANCEL}>Huỷ</button>
        <button type="button" onClick={save} style={PANEL_BTN_SAVE}>Lưu</button>
      </div>
    </div>
  );
});

// ──────────────────────────────────────────────────────────────────────
// Alert row (memo) — tách riêng để mỗi dòng không re-render khi dòng khác đổi
// ──────────────────────────────────────────────────────────────────────

const AlertRow = memo(function AlertRow({ alert, onDismiss }: {
  alert: AllocationAlert;
  onDismiss: (symbol: string) => void;
}) {
  const isDanger = alert.level === 'danger';
  const color    = isDanger ? DANGER_TEXT : WARNING_TEXT;
  const bg       = isDanger ? ROW_DANGER_BG   : ROW_WARN_BG;
  const bord     = isDanger ? ROW_DANGER_BORD : ROW_WARN_BORD;

  return (
    <div style={ { ...ROW_BASE, background: bg, border: `1px solid ${bord}` } }>
      {/* Symbol + bar */}
      <div style={ROW_LEFT}>
        <TrendingUp size={14} color={color} style={ICON_FLEX} />
        <span style={ { fontSize: 13, fontWeight: 800, color, minWidth: 48 } }>{alert.symbol}</span>

        {/* Progress bar */}
        <div style={BAR_TRACK}>
          <div style={ { ...BAR_FILL_BASE, width: `${Math.min(alert.pct, 100)}%`, background: `linear-gradient(90deg, ${color}88, ${color})` } } />
        </div>
      </div>

      {/* Stats */}
      <div style={STATS_WRAP}>
        <div style={STATS_RIGHT}>
          <div className="num-premium" style={ { fontSize: 14, fontWeight: 800, color } }>{fmtPct(alert.pct)}</div>
          <div style={STATS_SUB}>{fmtVnd(alert.totalNow)}</div>
        </div>

        {/* Threshold badge */}
        <span style={ { ...BADGE_BASE, border: `1px solid ${bord}`, color } }>≥ {fmtPct(alert.threshold)}</span>

        {/* Dismiss */}
        <button type="button" onClick={() => onDismiss(alert.symbol)} style={DISMISS_BTN}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
});

// ──────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────

type Props = {
  alerts:      AllocationAlert[];
  totalAssets: number;
  settings:    AllocationAlertSettings;
  onSettings:  (v: AllocationAlertSettings) => void;
};

export const AllocationAlerts = memo(function AllocationAlerts({ alerts, totalAssets, settings, onSettings }: Props) {
  const [dismissed,    setDismissed]    = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);

  const visible = useMemo(
    () => alerts.filter(a => !dismissed.has(a.symbol)),
    [alerts, dismissed],
  );

  const dismiss = useCallback((symbol: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(symbol);
      return next;
    });
  }, []);

  const toggleSettings = useCallback(() => setShowSettings(p => !p), []);
  const closeSettings  = useCallback(() => setShowSettings(false), []);

  // Không render gì nếu không có cảnh báo
  if (!visible.length) return null;

  const hasDanger  = visible.some(a => a.level === 'danger');
  const bannerBg   = hasDanger ? DANGER_BG   : WARNING_BG;
  const bannerBord = hasDanger ? DANGER_BORD : WARNING_BORD;
  const headColor  = hasDanger ? DANGER_TEXT : WARNING_TEXT;

  return (
    <div style={ { background: bannerBg, border: `1px solid ${bannerBord}`, borderRadius: 20, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 } }>
      {/* Header */}
      <div style={HEADER_ROW}>
        <div style={HEADER_LEFT}>
          <AlertTriangle size={16} color={headColor} />
          <span style={ { fontSize: 12, fontWeight: 800, color: headColor, letterSpacing: '0.04em' } }>
            CẢNH BÁO TỶ TRỌNG — {visible.length} MÃ
          </span>
        </div>

        {/* Settings button */}
        <div style={SETTINGS_WRAP}>
          <button type="button" onClick={toggleSettings} style={SETTINGS_BTN}>
            <Settings2 size={14} />
          </button>
          {showSettings && (
            <SettingsPanel value={settings} onChange={onSettings} onClose={closeSettings} />
          )}
        </div>
      </div>

      {/* Alert rows */}
      <div style={ROWS_WRAP}>
        {visible.map(alert => (
          <AlertRow key={alert.symbol} alert={alert} onDismiss={dismiss} />
        ))}
      </div>

      {/* Footer hint */}
      <div style={FOOTER}>
        Tỷ trọng tính trên tổng tài sản {fmtVnd(totalAssets)} · Bấm ✕ để ẩn trong phiên này
      </div>
    </div>
  );
});
