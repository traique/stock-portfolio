import { ChevronDown, ChevronUp } from 'lucide-react';

type Tone = 'neutral' | 'up' | 'down';

const cardStyle = {
  borderRadius: 22,
  background: 'var(--card)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-soft)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
} as const;

const strongCardStyle = {
  ...cardStyle,
  border: '1px solid var(--border-strong)',
  boxShadow: 'var(--shadow)',
} as const;

const mutedColor = 'var(--muted)';
const textColor = 'var(--text)';
const upColor = 'var(--green)';
const downColor = 'var(--red)';

export function DashboardSection({
  kicker,
  title,
  open,
  onToggle,
  children,
}: {
  kicker: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section style={{ ...cardStyle, padding: 14 }}>
      <button type="button" className="ab-section-toggle" onClick={onToggle} style={{ minHeight: 'unset', width: '100%', color: textColor }}>
        <div className="ab-section-toggle-copy">
          <div className="ab-card-kicker" style={{ color: mutedColor }}>{kicker}</div>
          <div className="ab-section-toggle-title" style={{ fontSize: 18, color: textColor }}>{title}</div>
        </div>
        <div className="ab-section-toggle-icon" style={{ color: mutedColor }}>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
      </button>
      {open ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </section>
  );
}

export function DashboardStatCard({
  label,
  value,
  icon,
  subValue,
  tone = 'neutral',
  strong = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subValue?: string;
  tone?: Tone;
  strong?: boolean;
}) {
  const color = tone === 'up' ? upColor : tone === 'down' ? downColor : textColor;
  return (
    <article style={{ ...(strong ? strongCardStyle : cardStyle), padding: 14 }}>
      <div className="ab-stat-head" style={{ marginBottom: 6, color: tone === 'neutral' ? mutedColor : color }}>
        {icon}
        <span className="ab-soft-label">{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.15, color }}>{value}</div>
      {subValue ? <div style={{ fontSize: 12, marginTop: 4, color: tone === 'neutral' ? mutedColor : color }}>{subValue}</div> : null}
    </article>
  );
}
