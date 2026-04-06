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

export const premiumCardStyle = {
  borderRadius: 28,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.96))',
  boxShadow: '0 20px 50px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.72)',
  border: '1px solid rgba(148,163,184,0.12)',
} as const;

export const premiumButtonStyle = {
  borderRadius: 18,
  boxShadow: '0 12px 28px rgba(15,23,42,0.10)',
} as const;

export const premiumInputStyle = {
  borderRadius: 22,
  background: 'rgba(255,255,255,0.92)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
} as const;

export function SummarySkeleton() {
  return (
    <article className="ab-premium-card ab-stat-premium" style={premiumCardStyle}>
      <div className="ab-skeleton skeleton-line short" />
      <div className="ab-skeleton skeleton-price medium" />
    </article>
  );
}

export function SummaryStatCard({ label, value, icon, tone = 'neutral', subValue }: SummaryStatCardProps) {
  return (
    <article className={`ab-premium-card ab-stat-premium ${tone}`} style={premiumCardStyle}>
      <div className="ab-stat-head">
        {icon}
        <span className="ab-soft-label">{label}</span>
      </div>
      <div className={tone === 'neutral' ? 'ab-big-number dark' : 'ab-big-number'}>{value}</div>
      {subValue ? <div className="ab-stat-sub">{subValue}</div> : null}
    </article>
  );
}

export function CollapsibleSection({ kicker, title, isOpen, onToggle, children }: CollapsibleSectionProps) {
  return (
    <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyle}>
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

export function PositionCard({
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
  return (
    <article className="ab-premium-card ab-position-card" style={premiumCardStyle}>
      <div className="ab-row-between align-start">
        <div>
          <div className="ab-symbol premium">{symbol}</div>
          <div className="ab-soft-label mini-top">{lotsText}</div>
        </div>
        <button
          type="button"
          className="ab-delete ghost"
          onClick={onToggle}
          style={{ borderRadius: 999, padding: '8px 12px', background: 'rgba(248,250,252,0.9)' }}
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

      <div className={`ab-profit-pill ${positive ? 'up' : 'down'}`}>
        <span>Lãi / Lỗ</span>
        <strong>{pnlText}</strong>
      </div>

      <div
        className="ab-performance premium"
        style={{
          background: positive ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
          borderColor: positive ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
          color: positive ? 'var(--green)' : 'var(--red)',
        }}
      >
        <span>Hiệu suất vị thế</span>
        <strong>{pnlPctText}</strong>
      </div>

      {isExpanded ? <div className="ab-mini-list" style={{ marginTop: 14 }}>{lots}</div> : null}
    </article>
  );
}
