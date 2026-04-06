import { ChevronDown, ChevronUp } from 'lucide-react';
import { ReactNode } from 'react';

type SummaryStatCardProps = {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: 'neutral' | 'up' | 'down';
  subValue?: string;
};

type CollapsibleSectionProps = {
  kicker: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children?: ReactNode;
};

type PositionCardProps = {
  symbol: string;
  lotsText: string;
  priceText: string;
  changeText: string;
  changeColor: string;
  quantityText: string;
  avgPriceText: string;
  totalBuyText: string;
  totalNowText: string;
  pnlText: string;
  pnlPctText: string;
  positive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  lots: ReactNode;
};

const UP_COLOR = '#16a34a';
const DOWN_COLOR = '#dc2626';
const NEUTRAL_COLOR = '#0f172a';

export const premiumCardStyleV2 = {
  borderRadius: 28,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.985), rgba(246,248,252,0.965))',
  boxShadow: '0 22px 48px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.80)',
  border: '1px solid rgba(148,163,184,0.14)',
} as const;

export const premiumButtonStyleV2 = {
  borderRadius: 18,
  boxShadow: '0 10px 22px rgba(15,23,42,0.08)',
} as const;

export const premiumInputStyleV2 = {
  borderRadius: 20,
  background: 'rgba(255,255,255,0.96)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.88)',
} as const;

function toneColor(tone: 'neutral' | 'up' | 'down') {
  if (tone === 'up') return UP_COLOR;
  if (tone === 'down') return DOWN_COLOR;
  return NEUTRAL_COLOR;
}

export function SummarySkeletonV2() {
  return (
    <article className="ab-premium-card ab-stat-premium" style={premiumCardStyleV2}>
      <div className="ab-skeleton skeleton-line short" />
      <div className="ab-skeleton skeleton-price medium" />
    </article>
  );
}

export function SummaryStatCardV2({ label, value, icon, tone = 'neutral', subValue }: SummaryStatCardProps) {
  const color = toneColor(tone);
  return (
    <article className={`ab-premium-card ab-stat-premium ${tone}`} style={premiumCardStyleV2}>
      <div className="ab-stat-head" style={{ color: tone === 'neutral' ? 'var(--muted)' : color }}>
        {icon}
        <span className="ab-soft-label">{label}</span>
      </div>
      <div className="ab-big-number" style={{ color }}>
        {value}
      </div>
      {subValue ? <div className="ab-stat-sub" style={{ color }}>{subValue}</div> : null}
    </article>
  );
}

export function CollapsibleSectionV2({ kicker, title, isOpen, onToggle, children }: CollapsibleSectionProps) {
  return (
    <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyleV2}>
      <button type="button" className="ab-section-toggle" onClick={onToggle}>
        <div className="ab-section-toggle-copy">
          <div className="ab-card-kicker">{kicker}</div>
          <div className="ab-section-toggle-title">{title}</div>
        </div>
        <div className="ab-section-toggle-icon">{isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
      </button>
      {isOpen ? children : null}
    </section>
  );
}

export function PositionCardV2({
  symbol,
  lotsText,
  priceText,
  changeText,
  changeColor,
  quantityText,
  avgPriceText,
  totalBuyText,
  totalNowText,
  pnlText,
  pnlPctText,
  positive,
  isExpanded,
  onToggle,
  lots,
}: PositionCardProps) {
  const pnlColor = positive ? UP_COLOR : DOWN_COLOR;
  return (
    <article className="ab-premium-card ab-position-card" style={premiumCardStyleV2}>
      <div className="ab-row-between align-start">
        <div>
          <div className="ab-symbol premium">{symbol}</div>
          <div className="ab-soft-label mini-top">{lotsText}</div>
        </div>
        <button
          type="button"
          className="ab-delete ghost"
          onClick={onToggle}
          style={{ borderRadius: 999, padding: '8px 12px', background: 'rgba(248,250,252,0.92)' }}
        >
          {isExpanded ? 'Ẩn lệnh' : 'Xem lệnh'}
        </button>
      </div>

      <div className="ab-price premium">{priceText}</div>
      <div className="ab-soft-change under-price" style={{ color: changeColor }}>
        {changeText}
      </div>

      <div className="ab-position-stats">
        <div className="ab-stat-chip">
          <span>SL tổng</span>
          <strong>{quantityText}</strong>
        </div>
        <div className="ab-stat-chip">
          <span>Giá vốn TB</span>
          <strong>{avgPriceText}</strong>
        </div>
      </div>

      <div className="ab-mini-grid premium">
        <div className="ab-mini-card premium">
          <div className="ab-soft-label">Tổng mua</div>
          <div className="ab-mini-value">{totalBuyText}</div>
        </div>
        <div className="ab-mini-card premium">
          <div className="ab-soft-label">Hiện tại</div>
          <div className="ab-mini-value">{totalNowText}</div>
        </div>
      </div>

      <div
        className={`ab-profit-pill ${positive ? 'up' : 'down'}`}
        style={{
          background: positive ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)',
          border: `1px solid ${positive ? 'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.18)'}`,
          color: pnlColor,
        }}
      >
        <span>Lãi / Lỗ</span>
        <strong style={{ color: pnlColor }}>{pnlText}</strong>
      </div>

      <div
        className="ab-performance premium"
        style={{
          background: positive ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
          borderColor: positive ? 'rgba(22,163,74,0.20)' : 'rgba(220,38,38,0.20)',
          color: pnlColor,
        }}
      >
        <span>Hiệu suất vị thế</span>
        <strong>{pnlPctText}</strong>
      </div>

      {isExpanded ? <div className="ab-mini-list" style={{ marginTop: 14 }}>{lots}</div> : null}
    </article>
  );
}
