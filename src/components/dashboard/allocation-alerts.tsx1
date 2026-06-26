// src/components/dashboard/allocation-alerts.tsx
//
// Banner cảnh báo tỷ trọng danh mục — hiển thị ngay trên dashboard
// khi 1 mã vượt ngưỡng warning (25%) hoặc danger (40%) tổng tài sản.
//
// Cách dùng trong dashboard/page.tsx:
//   <AllocationAlerts alerts={allocationAlerts} totalAssets={totalAssets} />

'use client';

import { useState } from 'react';
import { AlertTriangle, X, TrendingUp, Settings2 } from 'lucide-react';
import type { AllocationAlert, AllocationAlertSettings } from '@/lib/use-allocation-alerts';

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

const vnFmt  = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtVnd = (v: number) => {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}T`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  return vnFmt.format(v);
};

// ─────────────────────────────────────────────────────────────────────────────
// Colour palette
// ─────────────────────────────────────────────────────────────────────────────

const DANGER_BG    = 'rgba(244,63,94,0.08)';
const DANGER_BORD  = 'rgba(244,63,94,0.25)';
const DANGER_TEXT  = '#f43f5e';
const WARNING_BG   = 'rgba(245,158,11,0.08)';
const WARNING_BORD = 'rgba(245,158,11,0.25)';
const WARNING_TEXT = '#f59e0b';

// ─────────────────────────────────────────────────────────────────────────────
// Settings panel (inline, không cần modal)
// ─────────────────────────────────────────────────────────────────────────────

function SettingsPanel({
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

  const save = () => {
    const w = Math.min(99, Math.max(1, Number(warning) || 25));
    const d = Math.min(99, Math.max(w + 1, Number(danger) || 40));
    onChange({ ...value, warningPct: w, dangerPct: d });
    onClose();
  };

  const INPUT_STYLE: React.CSSProperties = {
    borderRadius: 999, background: 'var(--soft)', border: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 13, fontWeight: 700,
    padding: '6px 12px', width: 72, textAlign: 'right',
  };

  return (
    <div style={{
      position: 'absolute', top: 40, right: 0, zIndex: 20,
      background: 'var(--card)', border: '1px solid var(--border-strong)',
      borderRadius: 16, padding: '14px 16px', minWidth: 220,
      boxShadow: 'var(--shadow-strong)', backdropFilter: 'blur(24px)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginBottom: 12, letterSpacing: '0.04em' }}>
        NGƯỠNG CẢNH BÁO
      </div>
      {[
        { label: 'Cảnh báo (%)', val: warning, set: setWarning, color: WARNING_TEXT },
        { label: 'Nguy hiểm (%)', val: danger, set: setDanger,  color: DANGER_TEXT  },
      ].map(({ label, val, set, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
          <input
            type="number" min={1} max={99} value={val}
            onChange={e => set(e.target.value)}
            style={INPUT_STYLE}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onClose} style={{
          flex: 1, padding: '7px 0', borderRadius: 999, border: '1px solid var(--border)',
          background: 'var(--soft)', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>Huỷ</button>
        <button type="button" onClick={save} style={{
          flex: 1, padding: '7px 0', borderRadius: 999, border: 'none',
          background: 'var(--text)', color: 'var(--bg)', fontSize: 12, fontWeight: 800, cursor: 'pointer',
        }}>Lưu</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  alerts:      AllocationAlert[];
  totalAssets: number;
  settings:    AllocationAlertSettings;
  onSettings:  (v: AllocationAlertSettings) => void;
};

export function AllocationAlerts({ alerts, totalAssets, settings, onSettings }: Props) {
  const [dismissed,    setDismissed]    = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);

  const visible = alerts.filter(a => !dismissed.has(a.symbol));

  // Không render gì nếu không có cảnh báo
  if (!visible.length) return null;

  const hasDanger  = visible.some(a => a.level === 'danger');
  const bannerBg   = hasDanger ? DANGER_BG   : WARNING_BG;
  const bannerBord = hasDanger ? DANGER_BORD : WARNING_BORD;

  return (
    <div style={{
      background: bannerBg, border: `1px solid ${bannerBord}`,
      borderRadius: 20, padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color={hasDanger ? DANGER_TEXT : WARNING_TEXT} />
          <span style={{ fontSize: 12, fontWeight: 800, color: hasDanger ? DANGER_TEXT : WARNING_TEXT, letterSpacing: '0.04em' }}>
            CẢNH BÁO TỶ TRỌNG — {visible.length} MÃ
          </span>
        </div>

        {/* Settings button */}
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setShowSettings(p => !p)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: 'var(--muted)', display: 'flex', alignItems: 'center',
          }}>
            <Settings2 size={14} />
          </button>
          {showSettings && (
            <SettingsPanel value={settings} onChange={onSettings} onClose={() => setShowSettings(false)} />
          )}
        </div>
      </div>

      {/* Alert rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(alert => {
          const isDanger = alert.level === 'danger';
          const color    = isDanger ? DANGER_TEXT : WARNING_TEXT;
          const bg       = isDanger ? 'rgba(244,63,94,0.06)' : 'rgba(245,158,11,0.06)';
          const bord     = isDanger ? 'rgba(244,63,94,0.18)' : 'rgba(245,158,11,0.18)';

          return (
            <div key={alert.symbol} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, background: bg, border: `1px solid ${bord}`,
              borderRadius: 12, padding: '10px 14px',
            }}>
              {/* Symbol + bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <TrendingUp size={14} color={color} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 800, color, minWidth: 48 }}>{alert.symbol}</span>

                {/* Progress bar */}
                <div style={{ flex: 1, height: 6, background: 'var(--soft)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    width: `${Math.min(alert.pct, 100)}%`,
                    background: `linear-gradient(90deg, ${color}88, ${color})`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div className="num-premium" style={{ fontSize: 14, fontWeight: 800, color }}>
                    {fmtPct(alert.pct)}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>
                    {fmtVnd(alert.totalNow)}
                  </div>
                </div>

                {/* Threshold badge */}
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999,
                  border: `1px solid ${bord}`, color,
                  letterSpacing: '0.04em', whiteSpace: 'nowrap',
                }}>
                  ≥ {fmtPct(alert.threshold)}
                </span>

                {/* Dismiss */}
                <button type="button" onClick={() => setDismissed(p => new Set([...p, alert.symbol]))} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: 'var(--muted)', display: 'flex', alignItems: 'center',
                }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>
        Tỷ trọng tính trên tổng tài sản {fmtVnd(totalAssets)} · Bấm ✕ để ẩn trong phiên này
      </div>
    </div>
  );
}
