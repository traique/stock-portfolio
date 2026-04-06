import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  PieChart,
  Send,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { ReactNode } from 'react';
import {
  CollapsibleSection,
  PositionCard,
  premiumButtonStyle,
  premiumCardStyle,
  premiumInputStyle,
  SummarySkeleton,
  SummaryStatCard,
} from '@/components/dashboard/premium-dashboard-ui';
import { CashTransaction, Transaction, formatCurrency } from '@/lib/calculations';

type QuoteDebugItem = {
  symbol: string;
  price: number;
  change: number;
  pct: number;
};

type TelegramSettings = {
  chat_id: string;
  is_enabled: boolean;
  notify_daily: boolean;
  daily_hour_vn: number;
};

type TxTypeFilter = 'ALL' | 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
type CashMode = 'CASH' | 'ADJUSTMENT';

type AllocationItem = {
  symbol: string;
  totalNow: number;
  percent: number;
};

type PositionView = {
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

type HistoryRow =
  | { kind: 'trade'; item: Transaction; sortDate: string }
  | { kind: 'cash'; item: CashTransaction; sortDate: string };

export function SummarySection({
  loading,
  totalCapital,
  actualNav,
  marketValue,
  totalAssets,
  totalPnl,
  totalPnlPct,
  dayPnl,
  unrealizedPnl,
  realizedPnl,
  realizedOrders,
  refreshing,
  getTone,
}: {
  loading: boolean;
  totalCapital: number;
  actualNav: number;
  marketValue: number;
  totalAssets: number;
  totalPnl: number;
  totalPnlPct: number;
  dayPnl: number;
  unrealizedPnl: number;
  realizedPnl: number;
  realizedOrders: number;
  refreshing: boolean;
  getTone: (value: number) => 'up' | 'down';
}) {
  return (
    <>
      <section className="ab-summary-grid premium-summary-grid compact-top-grid">
        {loading ? (
          <>
            <SummarySkeleton />
            <SummarySkeleton />
            <SummarySkeleton />
            <SummarySkeleton />
          </>
        ) : (
          <>
            <SummaryStatCard label="Tổng vốn" value={formatCurrency(totalCapital)} icon={<Landmark size={16} />} />
            <SummaryStatCard label="NAV thực tế" value={formatCurrency(actualNav)} icon={<Wallet size={16} />} />
            <SummaryStatCard label="Giá trị thị trường" value={formatCurrency(marketValue)} icon={<PieChart size={16} />} />
            <SummaryStatCard label="Tổng tài sản" value={formatCurrency(totalAssets)} icon={<TrendingUp size={16} />} />
          </>
        )}
      </section>

      {!loading ? (
        <section className="ab-summary-grid premium-summary-grid compact-top-grid">
          <SummaryStatCard
            label="Tổng lãi/lỗ"
            value={formatCurrency(totalPnl)}
            icon={<TrendingUp size={16} />}
            tone={getTone(totalPnl)}
            subValue={`${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`}
          />
          <SummaryStatCard
            label="Lãi/lỗ trong ngày"
            value={formatCurrency(dayPnl)}
            icon={dayPnl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            tone={getTone(dayPnl)}
            subValue={refreshing ? 'Đang cập nhật giá...' : 'Theo biến động phiên hiện tại'}
          />
          <SummaryStatCard
            label="Lãi/lỗ cổ phiếu đang giữ"
            value={formatCurrency(unrealizedPnl)}
            icon={<TrendingUp size={16} />}
            tone={getTone(unrealizedPnl)}
            subValue="Hiệu suất vị thế mở"
          />
          <SummaryStatCard
            label="Lãi/lỗ đã chốt"
            value={formatCurrency(realizedPnl)}
            icon={<TrendingDown size={16} />}
            tone={getTone(realizedPnl)}
            subValue={`${realizedOrders} lệnh bán`}
          />
        </section>
      ) : null}
    </>
  );
}

export function MarketIndexSection({
  vnIndex,
  formatCompactPrice,
  formatChange,
  formatPct,
  getChangeColor,
}: {
  vnIndex: QuoteDebugItem | null;
  formatCompactPrice: (value?: number | null) => string;
  formatChange: (value?: number | null) => string;
  formatPct: (value?: number | null) => string;
  getChangeColor: (value?: number | null) => string;
}) {
  if (!vnIndex) return null;

  return (
    <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyle}>
      <div className="ab-row-between align-center">
        <div>
          <div className="ab-card-kicker">VN-Index</div>
          <div className="ab-card-headline small">{formatCompactPrice(vnIndex.price)}</div>
        </div>
        <div
          className="ab-soft-change under-price"
          style={{
            color: getChangeColor(vnIndex.change),
            padding: '10px 14px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.72)',
          }}
        >
          {formatChange(vnIndex.change)} · {formatPct(vnIndex.pct)}
        </div>
      </div>
    </section>
  );
}

export function AllocationSection({ allocations }: { allocations: AllocationItem[] }) {
  if (!allocations.length) return null;

  return (
    <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyle}>
      <div className="ab-card-kicker">Cơ cấu danh mục</div>
      <div className="ab-mini-list" style={{ marginTop: 12 }}>
        {allocations.map((item) => (
          <div key={item.symbol} style={{ display: 'grid', gap: 8 }}>
            <div className="ab-row-between align-center">
              <div className="ab-mini-symbol">{item.symbol}</div>
              <div className="ab-mini-price">
                {formatCurrency(item.totalNow)} · {item.percent.toFixed(1)}%
              </div>
            </div>
            <div
              style={{
                width: '100%',
                height: 10,
                borderRadius: 999,
                background: 'rgba(148,163,184,0.16)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(item.percent, 2)}%`,
                  height: '100%',
                  borderRadius: 999,
                  background:
                    'linear-gradient(90deg, rgba(37,99,235,0.95), rgba(96,165,250,0.65))',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PositionsSection({
  loading,
  hasPositions,
  positions,
}: {
  loading: boolean;
  hasPositions: boolean;
  positions: PositionView[];
}) {
  if (loading) {
    return (
      <section className="ab-position-grid">
        <SummarySkeleton />
        <SummarySkeleton />
      </section>
    );
  }

  if (!hasPositions) {
    return (
      <section className="ab-premium-card ab-form-shell compact" style={premiumCardStyle}>
        <div className="ab-note">Chưa có vị thế mở nào trong danh mục</div>
      </section>
    );
  }

  return (
    <section className="ab-position-grid">
      {positions.map((position) => (
        <PositionCard key={position.symbol} {...position} />
      ))}
    </section>
  );
}

export function TradeFormSection({
  kicker,
  title,
  isOpen,
  onToggle,
  form,
  onChange,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  kicker: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  form: { symbol: string; price: string; quantity: string; trade_date: string; note: string };
  onChange: (next: { symbol: string; price: string; quantity: string; trade_date: string; note: string }) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <CollapsibleSection kicker={kicker} title={title} isOpen={isOpen} onToggle={onToggle}>
      <form onSubmit={onSubmit} className="ab-form-grid compact-form-grid mt-16">
        <input value={form.symbol} onChange={(e) => onChange({ ...form, symbol: e.target.value })} placeholder="Mã" required className="ab-input" style={premiumInputStyle} />
        <input value={form.price} onChange={(e) => onChange({ ...form, price: e.target.value })} type="number" placeholder="Giá" required className="ab-input" style={premiumInputStyle} />
        <input value={form.quantity} onChange={(e) => onChange({ ...form, quantity: e.target.value })} type="number" placeholder="Số lượng" required className="ab-input" style={premiumInputStyle} />
        <input value={form.trade_date} onChange={(e) => onChange({ ...form, trade_date: e.target.value })} type="date" className="ab-input" style={premiumInputStyle} />
        <input value={form.note} onChange={(e) => onChange({ ...form, note: e.target.value })} placeholder="Ghi chú" className="ab-input ab-full" style={premiumInputStyle} />
        <div className="ab-row-gap">
          <button type="submit" className="ab-btn ab-btn-primary" style={premiumButtonStyle}>{submitLabel}</button>
          {onCancel ? <button type="button" className="ab-btn ab-btn-subtle" onClick={onCancel} style={premiumButtonStyle}>Hủy</button> : null}
        </div>
      </form>
    </CollapsibleSection>
  );
}

export function HistorySection({
  isOpen,
  onToggle,
  historyFilter,
  onHistoryFilterChange,
  historySymbol,
  onHistorySymbolChange,
  historyRows,
  getTransactionLabel,
  formatTradeDate,
  editTrade,
  editCash,
  deleteTrade,
  deleteCash,
}: {
  isOpen: boolean;
  onToggle: () => void;
  historyFilter: TxTypeFilter;
  onHistoryFilterChange: (value: TxTypeFilter) => void;
  historySymbol: string;
  onHistorySymbolChange: (value: string) => void;
  historyRows: HistoryRow[];
  getTransactionLabel: (type: TxTypeFilter | Transaction['transaction_type'] | CashTransaction['transaction_type']) => string;
  formatTradeDate: (value?: string | null) => string;
  editTrade: (item: Transaction) => void;
  editCash: (item: CashTransaction) => void;
  deleteTrade: (item: Transaction) => void;
  deleteCash: (item: CashTransaction) => void;
}) {
  return (
    <CollapsibleSection kicker="Giao dịch" title="Nhật ký giao dịch" isOpen={isOpen} onToggle={onToggle}>
      <div className="ab-row-gap mt-16">
        <select value={historyFilter} onChange={(e) => onHistoryFilterChange(e.target.value as TxTypeFilter)} className="ab-input" style={premiumInputStyle}>
          <option value="ALL">Tất cả</option>
          <option value="BUY">Mua</option>
          <option value="SELL">Bán</option>
          <option value="DEPOSIT">Nạp tiền</option>
          <option value="WITHDRAW">Rút tiền</option>
        </select>
        <input value={historySymbol} onChange={(e) => onHistorySymbolChange(e.target.value)} placeholder="Lọc theo mã" className="ab-input" style={premiumInputStyle} />
      </div>
      <div className="ab-mini-list mt-16">
        {historyRows.length ? historyRows.map((row) => {
          if (row.kind === 'trade') {
            const item = row.item;
            const realizedText = item.transaction_type === 'SELL' ? ` · Đã chốt ${formatCurrency(Number(item.realized_pnl || 0))}` : '';
            return (
              <div key={item.id} className="ab-mini-row">
                <div>
                  <div className="ab-mini-symbol">{getTransactionLabel(item.transaction_type)} · {item.symbol} · SL {item.quantity}</div>
                  <div className="ab-mini-price">{formatTradeDate(item.trade_date)} · Giá {formatCurrency(Number(item.price))}{realizedText}</div>
                </div>
                <div className="ab-row-gap">
                  <button type="button" className="ab-btn ab-btn-subtle" onClick={() => editTrade(item)} style={premiumButtonStyle}>Sửa</button>
                  <button type="button" className="ab-delete ghost" onClick={() => deleteTrade(item)}>Xóa</button>
                </div>
              </div>
            );
          }

          const item = row.item;
          return (
            <div key={item.id} className="ab-mini-row">
              <div>
                <div className="ab-mini-symbol">{getTransactionLabel(item.transaction_type)}</div>
                <div className="ab-mini-price">{formatTradeDate(item.transaction_date)} · {formatCurrency(Number(item.amount))}</div>
              </div>
              <div className="ab-row-gap">
                <button type="button" className="ab-btn ab-btn-subtle" onClick={() => editCash(item)} style={premiumButtonStyle}>Sửa</button>
                <button type="button" className="ab-delete ghost" onClick={() => deleteCash(item)}>Xóa</button>
              </div>
            </div>
          );
        }) : <div className="ab-note">Chưa có lịch sử giao dịch</div>}
      </div>
    </CollapsibleSection>
  );
}

export function CashSection({
  isOpen,
  onToggle,
  cashMode,
  onCashModeChange,
  cashForm,
  onCashFormChange,
  onCashSubmit,
  editingCash,
  onCancelCashEdit,
  adjustmentSign,
  onAdjustmentSignChange,
  adjustmentAmountInput,
  onAdjustmentAmountChange,
  cashCalculated,
  cashAdjustment,
  onSaveAdjustment,
  savingAdjustment,
}: {
  isOpen: boolean;
  onToggle: () => void;
  cashMode: CashMode;
  onCashModeChange: (mode: CashMode) => void;
  cashForm: { transaction_type: 'DEPOSIT' | 'WITHDRAW'; amount: string; transaction_date: string; note: string };
  onCashFormChange: (next: { transaction_type: 'DEPOSIT' | 'WITHDRAW'; amount: string; transaction_date: string; note: string }) => void;
  onCashSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  editingCash: boolean;
  onCancelCashEdit?: () => void;
  adjustmentSign: 1 | -1;
  onAdjustmentSignChange: (value: 1 | -1) => void;
  adjustmentAmountInput: string;
  onAdjustmentAmountChange: (value: string) => void;
  cashCalculated: number;
  cashAdjustment: number;
  onSaveAdjustment: (event: React.FormEvent<HTMLFormElement>) => void;
  savingAdjustment: boolean;
}) {
  return (
    <CollapsibleSection kicker="Tiền mặt" title="Nạp / Rút / Điều chỉnh tiền mặt" isOpen={isOpen} onToggle={onToggle}>
      <div className="ab-row-gap mt-16">
        <button type="button" className={`ab-btn ${cashMode === 'CASH' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => onCashModeChange('CASH')} style={premiumButtonStyle}>Nạp / Rút tiền</button>
        <button type="button" className={`ab-btn ${cashMode === 'ADJUSTMENT' ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => onCashModeChange('ADJUSTMENT')} style={premiumButtonStyle}>Điều chỉnh tiền mặt</button>
      </div>

      {cashMode === 'CASH' ? (
        <form onSubmit={onCashSubmit} className="ab-form-grid compact-form-grid mt-16">
          <select value={cashForm.transaction_type} onChange={(e) => onCashFormChange({ ...cashForm, transaction_type: e.target.value as 'DEPOSIT' | 'WITHDRAW' })} className="ab-input" style={premiumInputStyle}>
            <option value="DEPOSIT">Nạp tiền</option>
            <option value="WITHDRAW">Rút tiền</option>
          </select>
          <input value={cashForm.amount} onChange={(e) => onCashFormChange({ ...cashForm, amount: e.target.value })} type="number" placeholder="Số tiền" required className="ab-input" style={premiumInputStyle} />
          <input value={cashForm.transaction_date} onChange={(e) => onCashFormChange({ ...cashForm, transaction_date: e.target.value })} type="date" className="ab-input" style={premiumInputStyle} />
          <input value={cashForm.note} onChange={(e) => onCashFormChange({ ...cashForm, note: e.target.value })} placeholder="Ghi chú" className="ab-input ab-full" style={premiumInputStyle} />
          <div className="ab-row-gap">
            <button type="submit" className="ab-btn ab-btn-primary" style={premiumButtonStyle}>{editingCash ? 'Lưu giao dịch tiền' : 'Lưu giao dịch tiền'}</button>
            {editingCash && onCancelCashEdit ? <button type="button" className="ab-btn ab-btn-subtle" onClick={onCancelCashEdit} style={premiumButtonStyle}>Hủy</button> : null}
          </div>
        </form>
      ) : (
        <form onSubmit={onSaveAdjustment} className="ab-form-grid compact-form-grid mt-16">
          <div className="ab-row-gap">
            <button type="button" className={`ab-btn ${adjustmentSign === 1 ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => onAdjustmentSignChange(1)} style={premiumButtonStyle}>Dương (+)</button>
            <button type="button" className={`ab-btn ${adjustmentSign === -1 ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => onAdjustmentSignChange(-1)} style={premiumButtonStyle}>Âm (-)</button>
          </div>
          <input value={adjustmentAmountInput} onChange={(e) => onAdjustmentAmountChange(e.target.value)} type="number" inputMode="decimal" className="ab-input" placeholder="Nhập số điều chỉnh" style={premiumInputStyle} />
          <div className="ab-note">Tiền mặt tính toán: <strong>{formatCurrency(cashCalculated)}</strong></div>
          <div className="ab-note">Điều chỉnh hiện tại: <strong>{cashAdjustment >= 0 ? '+' : ''}{formatCurrency(cashAdjustment)}</strong></div>
          <div className="ab-note">NAV thực tế = Tiền mặt tính toán + Điều chỉnh tiền mặt</div>
          <button type="submit" className="ab-btn ab-btn-primary" style={premiumButtonStyle}>{savingAdjustment ? 'Đang lưu...' : 'Lưu điều chỉnh'}</button>
        </form>
      )}
    </CollapsibleSection>
  );
}

export function TelegramSection({
  isOpen,
  onToggle,
  telegram,
  onTelegramChange,
  onSave,
  telegramSaving,
  onTest,
  telegramTesting,
  telegramLoading,
  telegramMessage,
  clampHour,
}: {
  isOpen: boolean;
  onToggle: () => void;
  telegram: TelegramSettings;
  onTelegramChange: (next: TelegramSettings) => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  telegramSaving: boolean;
  onTest: () => void;
  telegramTesting: boolean;
  telegramLoading: boolean;
  telegramMessage: string;
  clampHour: (value: number) => number;
}) {
  return (
    <CollapsibleSection kicker="Telegram" title="Báo cáo cuối ngày" isOpen={isOpen} onToggle={onToggle}>
      <form onSubmit={onSave} className="ab-form-grid compact-form-grid mt-16">
        <input value={telegram.chat_id} onChange={(e) => onTelegramChange({ ...telegram, chat_id: e.target.value })} placeholder="Nhập chat_id Telegram" className="ab-input ab-full" style={premiumInputStyle} />
        <label className="ab-toggle-row"><input type="checkbox" checked={telegram.is_enabled} onChange={(e) => onTelegramChange({ ...telegram, is_enabled: e.target.checked })} /><span>Bật báo cáo Telegram</span></label>
        <label className="ab-toggle-row"><input type="checkbox" checked={telegram.notify_daily} onChange={(e) => onTelegramChange({ ...telegram, notify_daily: e.target.checked })} /><span>Nhận báo cáo cuối ngày</span></label>
        <input value={telegram.daily_hour_vn} onChange={(e) => onTelegramChange({ ...telegram, daily_hour_vn: clampHour(Number(e.target.value || 15)) })} type="number" min={0} max={23} className="ab-input" placeholder="Giờ Việt Nam" style={premiumInputStyle} />
        <div className="ab-note">Báo cáo sẽ gửi theo tổng vốn, NAV thực tế, giá trị thị trường, tổng tài sản, tổng lãi/lỗ, lãi/lỗ trong ngày và chi tiết vị thế.</div>
        <div className="ab-row-gap">
          <button type="submit" className="ab-btn ab-btn-primary" style={premiumButtonStyle}>{telegramSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</button>
          <button type="button" className="ab-btn ab-btn-subtle" onClick={onTest} disabled={telegramTesting || telegramLoading} style={premiumButtonStyle}><Send size={14} />{telegramTesting ? 'Đang gửi...' : 'Gửi báo cáo'}</button>
        </div>
      </form>
      {telegramMessage ? <div className="ab-error mt-12">{telegramMessage}</div> : null}
    </CollapsibleSection>
  );
}
