'use client';

import { ArrowDownRight, ArrowUpRight, Landmark, PieChart, RefreshCw, Send, Trash2, Wallet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { DashboardSection as Section } from '@/components/dashboard/dashboard-primitives';
import { CashTransaction, formatCurrency, PortfolioSettings, Transaction } from '@/lib/calculations';
import {
  AiAction, AiPortfolioResponse, CashSummaryShape,
  DEFAULT_CASH_FORM, DEFAULT_TELEGRAM, DEFAULT_TRADE_FORM,
  getAccessToken, RiskProfile, TelegramSettings,
  clampHour, vnToUtc, utcToVn,
} from '@/lib/dashboard-types';
import { supabase } from '@/lib/supabase';

// =========================================================
// TYPES
// =========================================================

type TxTypeFilter = 'ALL' | 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAW';
type CashMode     = 'CASH' | 'ADJUSTMENT';
type TradeMode    = 'BUY' | 'SELL';

type HistoryRow =
  | { kind: 'trade'; item: Transaction;     sortDate: string }
  | { kind: 'cash';  item: CashTransaction; sortDate: string };

type EnrichedTx = Transaction & { realized_pnl?: number | null };

type Props = {
  userId:            string;
  email:             string;
  accessToken:       string;
  transactions:      Transaction[];
  cashTransactions:  CashTransaction[];
  enrichedTxs:       EnrichedTx[];
  portfolioSettings: PortfolioSettings | null;
  positions:         any[];
  cashSummary:       CashSummaryShape;
  aiResult:          AiPortfolioResponse | null;
  onAiResult:        (r: AiPortfolioResponse) => void;
  onReload:          () => Promise<void>;
  onMessage:         (msg: string) => void;
};

// =========================================================
// COLOURS & STYLES
// =========================================================

const C_MUTED = 'var(--muted)';
const C_TEXT  = 'var(--text)';
const C_GREEN = 'var(--green)';
const C_RED   = 'var(--red)';

const CARD: React.CSSProperties = {
  borderRadius: 24, background: 'var(--card)',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-soft)',
  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
};
const INPUT: React.CSSProperties = {
  borderRadius: 999, background: 'var(--soft)',
  color: C_TEXT, border: '1px solid var(--border-strong)',
};
const BTN: React.CSSProperties = { borderRadius: 999, boxShadow: '0 8px 16px rgba(0,0,0,0.06)' };
const LABEL: React.CSSProperties = {
  fontSize: 11, color: C_MUTED, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

// =========================================================
// FORMATTERS
// =========================================================

const vnFmt   = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('vi-VN');

const fmtPrice = (v?: number | null) =>
  v == null || !Number.isFinite(v) ? 'N/A' : vnFmt.format(v);
const fmtDate  = (v?: string | null) =>
  !v ? 'Không ngày' : dateFmt.format(new Date(v));

function fmtInt(v: string): string {
  const d = v.replace(/[^\d]/g, '');
  return d ? Number(d).toLocaleString('en-US') : '';
}

function parseInt2(v: string): number {
  return Number(v.replace(/[^\d]/g, '')) || 0;
}

function txLabel(type: string): string {
  const m: Record<string, string> = {
    BUY: 'Mua', SELL: 'Bán', DEPOSIT: 'Nạp tiền', WITHDRAW: 'Rút tiền',
  };
  return m[type] ?? 'Tất cả';
}

// =========================================================
// RISK SELECTOR
// =========================================================

function RiskSelector({ value, onChange }: {
  value: RiskProfile; onChange: (v: RiskProfile) => void;
}) {
  const opts: { v: RiskProfile; label: string }[] = [
    { v: 'conservative', label: 'AN TOÀN'  },
    { v: 'balanced',     label: 'CÂN BẰNG' },
    { v: 'aggressive',   label: 'TÍCH CỰC' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {opts.map(o => (
        <button key={o.v} type="button"
          className={`ab-risk-btn${value === o.v ? ' active' : ''}`}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// =========================================================
// AI ACTION CARD
// =========================================================

function AiActionCard({ item }: { item: AiAction }) {
  return (
    <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 16, fontWeight: 800 }}>{item.symbol} · {item.action}</strong>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: 'var(--soft)', color: C_MUTED }}>
          {item.confidence}
        </span>
      </div>
      <div style={{ fontSize: 13, color: C_TEXT, lineHeight: 1.5 }}>{item.reason}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)', padding: '8px 0', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ color: C_GREEN, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>CHỐT LỜI (TP)</div>
          <div className="num-premium" style={{ color: C_GREEN, fontWeight: 800, fontSize: 16, marginTop: 4 }}>
            {Number.isFinite(Number(item.tp)) ? fmtPrice(Number(item.tp)) : '--'}
          </div>
        </div>
        <div style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.20)', padding: '8px 0', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ color: C_RED, fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>CẮT LỖ (SL)</div>
          <div className="num-premium" style={{ color: C_RED, fontWeight: 800, fontSize: 16, marginTop: 4 }}>
            {Number.isFinite(Number(item.sl)) ? fmtPrice(Number(item.sl)) : '--'}
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// MAIN EXPORT
// =========================================================

export function DashboardActions({
  userId, email, accessToken, transactions, cashTransactions,
  enrichedTxs, portfolioSettings, positions, cashSummary,
  aiResult, onAiResult, onReload, onMessage,
}: Props) {

  // section toggles
  const [detailsOpen,  setDetailsOpen]  = useState(false);
  const [tradeOpen,    setTradeOpen]    = useState(false);
  const [historyOpen,  setHistoryOpen]  = useState(false);
  const [cashOpen,     setCashOpen]     = useState(false);
  const [aiOpen,       setAiOpen]       = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);

  // trade form
  const [tradeMode,      setTradeMode]      = useState<TradeMode>('BUY');
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [tradeForm,      setTradeForm]      = useState(DEFAULT_TRADE_FORM);

  // cash form
  const [cashMode,              setCashMode]              = useState<CashMode>('CASH');
  const [editingCashId,         setEditingCashId]         = useState<string | null>(null);
  const [cashForm,              setCashForm]              = useState(DEFAULT_CASH_FORM);
  const [adjustmentSign,        setAdjustmentSign]        = useState<1 | -1>(1);
  const [adjustmentAmountInput, setAdjustmentAmountInput] = useState('0');
  const [savingAdjustment,      setSavingAdjustment]      = useState(false);

  // history
  const [historyFilter, setHistoryFilter] = useState<TxTypeFilter>('ALL');
  const [historySymbol, setHistorySymbol] = useState('');

  // telegram
  const [telegram,        setTelegram]        = useState<TelegramSettings>(DEFAULT_TELEGRAM);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramSaving,  setTelegramSaving]  = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState('');

  // AI
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('balanced');
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiError,     setAiError]     = useState('');

  // reset
  const [resetting, setResetting] = useState(false);

  // =========================================================
  // HISTORY DERIVED
  // =========================================================

  const historyRows = useMemo<HistoryRow[]>(() => {
    const symFilter = historySymbol.trim().toUpperCase();

    const trades: HistoryRow[] = enrichedTxs.map(item => ({
      kind: 'trade', item, sortDate: item.trade_date ?? item.created_at,
    }));

    // When a symbol filter is active, hide cash rows entirely —
    // cash transactions have no symbol so they can't match.
    const cash: HistoryRow[] = symFilter
      ? []
      : cashTransactions.map(item => ({
          kind: 'cash', item, sortDate: item.transaction_date ?? item.created_at,
        }));

    return [...trades, ...cash]
      .filter(row => historyFilter === 'ALL' ? true : row.item.transaction_type === historyFilter)
      .filter(row =>
        !symFilter ? true
        : row.kind === 'trade' && row.item.symbol.toUpperCase().includes(symFilter),
      )
      .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  }, [enrichedTxs, cashTransactions, historyFilter, historySymbol]);

  // =========================================================
  // TRADE HANDLERS
  // =========================================================

  const handleTradeSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    onMessage('');
    if (!userId) return onMessage('Phiên đăng nhập không hợp lệ');
    const symbol   = tradeForm.symbol.trim().toUpperCase();
    const price    = parseInt2(tradeForm.price);
    const quantity = parseInt2(tradeForm.quantity);
    if (!symbol || !price || !quantity)
      return onMessage(`Nhập đủ mã, giá ${tradeMode === 'BUY' ? 'mua' : 'bán'}, số lượng`);

    const payload = {
      symbol, transaction_type: tradeMode, price, quantity,
      trade_date: tradeForm.trade_date || null,
      note: tradeForm.note.trim() || null,
      avg_cost: null, realized_pnl: null,
    };
    const { error } = editingTradeId
      ? await supabase.from('transactions').update(payload).eq('id', editingTradeId).eq('user_id', userId)
      : await supabase.from('transactions').insert({ user_id: userId, ...payload });

    if (error) return onMessage(error.message);
    setTradeForm(DEFAULT_TRADE_FORM);
    setEditingTradeId(null);
    setTradeOpen(false);
    await onReload();
  }, [userId, tradeForm, tradeMode, editingTradeId, onMessage, onReload]);

  const editTrade = useCallback((item: Transaction) => {
    setTradeMode(item.transaction_type === 'SELL' ? 'SELL' : 'BUY');
    setTradeForm({
      symbol: item.symbol, price: fmtInt(String(item.price)),
      quantity: fmtInt(String(item.quantity)),
      trade_date: item.trade_date ?? '', note: item.note ?? '',
    });
    setEditingTradeId(item.id);
    setTradeOpen(true);
    setCashOpen(false);
  }, []);

  const deleteTrade = useCallback(async (item: Transaction) => {
    if (!window.confirm(`Xóa giao dịch ${txLabel(item.transaction_type)} ${item.symbol}?`)) return;
    const { error } = await supabase.from('transactions').delete().eq('id', item.id).eq('user_id', userId);
    if (error) return onMessage(error.message);
    await onReload();
  }, [userId, onMessage, onReload]);

  const deleteSymbol = useCallback(async (symbol: string) => {
    if (!userId) return onMessage('Phiên đăng nhập không hợp lệ');
    const sym   = symbol.toUpperCase();
    const count = transactions.filter(t => t.symbol.toUpperCase() === sym).length;
    if (!window.confirm(`Xóa toàn bộ ${count} giao dịch của mã ${sym}?`)) return;
    const { error } = await supabase.from('transactions').delete().eq('user_id', userId).eq('symbol', sym);
    if (error) return onMessage(error.message);
    if (historySymbol.toUpperCase() === sym) setHistorySymbol('');
    if (editingTradeId && tradeForm.symbol.toUpperCase() === sym) {
      setEditingTradeId(null); setTradeForm(DEFAULT_TRADE_FORM); setTradeOpen(false);
    }
    await onReload();
  }, [userId, transactions, historySymbol, editingTradeId, tradeForm.symbol, onMessage, onReload]);

  // =========================================================
  // CASH HANDLERS
  // =========================================================

  const handleCashSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    onMessage('');
    if (!userId) return onMessage('Phiên đăng nhập không hợp lệ');
    const amount = parseInt2(cashForm.amount);
    if (!amount) return onMessage('Nhập số tiền hợp lệ');

    const payload = {
      transaction_type: cashForm.transaction_type, amount,
      transaction_date: cashForm.transaction_date || null,
      note: cashForm.note.trim() || null,
    };
    const { error } = editingCashId
      ? await supabase.from('cash_transactions').update(payload).eq('id', editingCashId).eq('user_id', userId)
      : await supabase.from('cash_transactions').insert({ user_id: userId, ...payload });

    if (error) return onMessage(error.message);
    setCashForm(DEFAULT_CASH_FORM);
    setEditingCashId(null);
    await onReload();
  }, [userId, cashForm, editingCashId, onMessage, onReload]);

  const editCash = useCallback((item: CashTransaction) => {
    setCashMode('CASH');
    setCashForm({
      transaction_type: item.transaction_type,
      amount: fmtInt(String(item.amount)),
      transaction_date: item.transaction_date ?? '',
      note: item.note ?? '',
    });
    setEditingCashId(item.id);
    setCashOpen(true);
    setTradeOpen(false);
  }, []);

  const deleteCash = useCallback(async (item: CashTransaction) => {
    if (!window.confirm(`Xóa giao dịch ${txLabel(item.transaction_type)}?`)) return;
    const { error } = await supabase.from('cash_transactions').delete().eq('id', item.id).eq('user_id', userId);
    if (error) return onMessage(error.message);
    await onReload();
  }, [userId, onMessage, onReload]);

  const handleSaveCashAdjustment = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    onMessage('');
    setSavingAdjustment(true);
    if (!userId) { setSavingAdjustment(false); return onMessage('Phiên đăng nhập không hợp lệ'); }
    const adj = adjustmentSign * Math.abs(parseInt2(adjustmentAmountInput));
    const { error } = await supabase.from('portfolio_settings')
      .upsert({ user_id: userId, cash_adjustment: adj }, { onConflict: 'user_id' });
    setSavingAdjustment(false);
    if (error) return onMessage(error.message);
    await onReload();
  }, [userId, adjustmentSign, adjustmentAmountInput, onMessage, onReload]);

  // =========================================================
  // TELEGRAM HANDLERS
  // =========================================================

  const loadTelegramSettings = useCallback(async () => {
    setTelegramLoading(true);
    try {
      const t   = accessToken || await getAccessToken();
      const res = await fetch('/api/telegram/settings', { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (res.ok && data?.settings) {
        setTelegram({
          chat_id:       data.settings.chat_id ?? '',
          is_enabled:    Boolean(data.settings.is_enabled),
          notify_daily:  data.settings.notify_daily !== false,
          daily_hour_vn: utcToVn(Number(data.settings.daily_hour_utc ?? 8)),
        });
      } else setTelegram(DEFAULT_TELEGRAM);
    } catch { setTelegramMessage('Không tải được cấu hình Telegram'); }
    finally  { setTelegramLoading(false); }
  }, [accessToken]);

  const handleToggleTelegram = useCallback(() => {
    setTelegramOpen(v => { if (!v) loadTelegramSettings(); return !v; });
  }, [loadTelegramSettings]);

  const handleSaveTelegram = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setTelegramSaving(true); setTelegramMessage('');
    try {
      const t   = accessToken || await getAccessToken();
      const res = await fetch('/api/telegram/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          chat_id: telegram.chat_id.trim(), is_enabled: telegram.is_enabled,
          notify_daily: telegram.notify_daily, daily_hour_utc: vnToUtc(telegram.daily_hour_vn),
        }),
      });
      const data = await res.json();
      if (!res.ok) setTelegramMessage(data?.error ?? 'Không lưu được cấu hình');
      else { setTelegramMessage('Đã lưu cấu hình Telegram'); setTelegramOpen(false); }
    } catch { setTelegramMessage('Không lưu được cấu hình'); }
    finally  { setTelegramSaving(false); }
  }, [accessToken, telegram]);

  const handleTelegramTest = useCallback(async () => {
    setTelegramTesting(true); setTelegramMessage('');
    try {
      const t   = accessToken || await getAccessToken();
      const res = await fetch('/api/telegram/test', { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (!res.ok) setTelegramMessage(data?.error ?? 'Không gửi được báo cáo');
      else setTelegramMessage('Đã gửi báo cáo tới Telegram');
    } catch { setTelegramMessage('Không gửi được báo cáo'); }
    finally  { setTelegramTesting(false); }
  }, [accessToken]);

  // =========================================================
  // AI HANDLER
  // =========================================================

  const handleAiInsights = useCallback(async () => {
    setAiLoading(true); setAiError('');
    try {
      const t   = accessToken || await getAccessToken();
      const res = await fetch('/api/ai/portfolio-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ risk_profile: riskProfile, force_refresh: true }),
      });
      const data: AiPortfolioResponse = await res.json();
      if (!res.ok) setAiError(data?.error ?? 'Không thể phân tích danh mục');
      else onAiResult(data);
    } catch { setAiError('Không thể kết nối AI'); }
    finally  { setAiLoading(false); }
  }, [accessToken, riskProfile, onAiResult]);

  // =========================================================
  // RESET HANDLER
  // =========================================================

  const handleReset = useCallback(async () => {
    if (!userId) return;
    if (!window.confirm('CẢNH BÁO: Xóa toàn bộ danh mục? Hành động này không thể hoàn tác.')) return;
    setResetting(true); onMessage('');
    try {
      const [r1, r2, r3] = await Promise.all([
        supabase.from('transactions').delete().eq('user_id', userId),
        supabase.from('cash_transactions').delete().eq('user_id', userId),
        supabase.from('portfolio_settings').delete().eq('user_id', userId),
      ]);
      const err = r1.error ?? r2.error ?? r3.error;
      if (err) return onMessage(err.message);
      setEditingTradeId(null); setEditingCashId(null);
      setTradeForm(DEFAULT_TRADE_FORM); setCashForm(DEFAULT_CASH_FORM);
      setTradeOpen(false); setCashOpen(false); setHistoryOpen(false);
      onMessage('Đã xóa toàn bộ danh mục. Bạn có thể tạo danh mục mới.');
      await onReload();
    } catch { onMessage('Không thể xóa danh mục'); }
    finally  { setResetting(false); }
  }, [userId, onMessage, onReload]);

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <>
      {/* =========================================================
          STATISTICS
      ========================================================= */}
      <Section kicker="Thống kê" title="CHI TIẾT DANH MỤC" open={detailsOpen} onToggle={() => setDetailsOpen(v => !v)}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))' }}>
          {[
            { label: 'TỔNG VỐN',            value: formatCurrency(cashSummary.netCapital),      sub: 'Net nạp trừ rút',           icon: <Landmark size={16} /> },
            { label: 'TIỀN MẶT HỆ THỐNG',   value: formatCurrency(cashSummary.calculatedCash), sub: 'Từ dòng tiền và giao dịch', icon: <Wallet size={16} /> },
            { label: 'ĐIỀU CHỈNH THỦ CÔNG', value: `${cashSummary.cashAdjustment >= 0 ? '+' : ''}${formatCurrency(cashSummary.cashAdjustment)}`, sub: 'Cân bằng sổ sách', icon: <PieChart size={16} /> },
          ].map(cell => (
            <div key={cell.label} style={{ ...CARD, padding: 16, borderRadius: 20, boxShadow: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={LABEL}>{cell.label}</div>
                <div style={{ color: C_MUTED }}>{cell.icon}</div>
              </div>
              <div className="num-premium" style={{ marginTop: 8, fontSize: 20, fontWeight: 800, wordBreak: 'break-word' }}>{cell.value}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: C_MUTED, fontWeight: 600 }}>{cell.sub}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* =========================================================
          TRADE FORM
      ========================================================= */}
      <Section
        kicker="Giao dịch"
        title={editingTradeId ? `SỬA LỆNH ${tradeMode === 'BUY' ? 'MUA' : 'BÁN'}` : 'THÊM GIAO DỊCH'}
        open={tradeOpen}
        onToggle={() => setTradeOpen(v => !v)}
      >
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0,1fr))', marginBottom: 12 }}>
          {(['BUY', 'SELL'] as TradeMode[]).map(m => (
            <button key={m} type="button" className={`ab-btn ${tradeMode === m ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setTradeMode(m)} style={BTN}>
              LỆNH {m === 'BUY' ? 'MUA' : 'BÁN'}
            </button>
          ))}
        </div>
        <form onSubmit={handleTradeSubmit} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))' }}>
          <input value={tradeForm.symbol}     onChange={e => setTradeForm(f => ({ ...f, symbol:     e.target.value.toUpperCase() }))} placeholder="Mã cổ phiếu"                                className="ab-input"             style={INPUT} />
          <input value={tradeForm.price}      onChange={e => setTradeForm(f => ({ ...f, price:      fmtInt(e.target.value) }))}       placeholder={tradeMode === 'BUY' ? 'Giá mua' : 'Giá bán'} className="ab-input num-premium" style={INPUT} type="text" inputMode="numeric" />
          <input value={tradeForm.quantity}   onChange={e => setTradeForm(f => ({ ...f, quantity:   fmtInt(e.target.value) }))}       placeholder="Số lượng"                                     className="ab-input num-premium" style={INPUT} type="text" inputMode="numeric" />
          <input value={tradeForm.trade_date} onChange={e => setTradeForm(f => ({ ...f, trade_date: e.target.value }))}               className="ab-input num-premium"                            style={INPUT} type="date" />
          <input value={tradeForm.note}       onChange={e => setTradeForm(f => ({ ...f, note:       e.target.value }))}               placeholder="Ghi chú (không bắt buộc)"                      className="ab-input" style={{ ...INPUT, gridColumn: '1 / -1' }} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" className="ab-btn ab-btn-primary" style={BTN}>LƯU GIAO DỊCH</button>
            {editingTradeId && (
              <button type="button" className="ab-btn ab-btn-subtle" style={BTN}
                onClick={() => { setEditingTradeId(null); setTradeForm(DEFAULT_TRADE_FORM); setTradeOpen(false); }}>
                HỦY
              </button>
            )}
          </div>
        </form>
      </Section>

      {/* =========================================================
          HISTORY
      ========================================================= */}
      <Section kicker="Giao dịch" title="NHẬT KÝ GIAO DỊCH" open={historyOpen} onToggle={() => setHistoryOpen(v => !v)}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', marginBottom: 8 }}>
          <select value={historyFilter} onChange={e => setHistoryFilter(e.target.value as TxTypeFilter)} className="ab-input" style={INPUT}>
            <option value="ALL">Tất cả</option>
            <option value="BUY">Mua</option>
            <option value="SELL">Bán</option>
            <option value="DEPOSIT">Nạp tiền</option>
            <option value="WITHDRAW">Rút tiền</option>
          </select>
          <input value={historySymbol} onChange={e => setHistorySymbol(e.target.value)} placeholder="Lọc theo mã" className="ab-input" style={INPUT} />
        </div>

        {historySymbol.trim() && (
          <div style={{ fontSize: 12, color: C_MUTED, marginBottom: 10 }}>
            Đang lọc mã <strong>{historySymbol.trim().toUpperCase()}</strong> — giao dịch tiền mặt bị ẩn khi lọc theo mã.
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {historyRows.length > 0 ? historyRows.map(row => (
            <div key={row.item.id} style={{ ...CARD, padding: 14, borderRadius: 18, boxShadow: 'none' }}>
              {row.kind === 'trade' ? (
                <>
                  <div className="num-premium" style={{ fontSize: 14, fontWeight: 800 }}>
                    {txLabel(row.item.transaction_type)} · {row.item.symbol} · SL {row.item.quantity}
                  </div>
                  <div className="num-premium" style={{ fontSize: 12, color: C_MUTED, marginTop: 6 }}>
                    {fmtDate(row.item.trade_date)} · GIÁ {formatCurrency(Number(row.item.price))}
                    {row.item.transaction_type === 'SELL'
                      ? ` · CHỐT ${formatCurrency(Number((row.item as EnrichedTx).realized_pnl ?? 0))}`
                      : ''}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{txLabel(row.item.transaction_type)}</div>
                  <div className="num-premium" style={{ fontSize: 12, color: C_MUTED, marginTop: 6 }}>
                    {fmtDate((row.item as CashTransaction).transaction_date)} · {formatCurrency(Number((row.item as CashTransaction).amount))}
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" className="ab-btn ab-btn-subtle" style={BTN}
                  onClick={() => row.kind === 'trade' ? editTrade(row.item as Transaction) : editCash(row.item as CashTransaction)}>
                  Sửa
                </button>
                <button type="button" className="ab-btn" style={{ ...BTN, color: C_RED, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.20)' }}
                  onClick={() => row.kind === 'trade' ? deleteTrade(row.item as Transaction) : deleteCash(row.item as CashTransaction)}>
                  Xóa
                </button>
              </div>
            </div>
          )) : (
            <div style={{ color: C_MUTED, fontSize: 14 }}>Chưa có lịch sử giao dịch</div>
          )}
        </div>
      </Section>

      {/* =========================================================
          CASH
      ========================================================= */}
      <Section kicker="Tiền mặt" title="NẠP / RÚT / ĐIỀU CHỈNH" open={cashOpen} onToggle={() => setCashOpen(v => !v)}>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0,1fr))', marginBottom: 12 }}>
          {(['CASH', 'ADJUSTMENT'] as CashMode[]).map(m => (
            <button key={m} type="button" className={`ab-btn ${cashMode === m ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setCashMode(m)} style={BTN}>
              {m === 'CASH' ? 'NẠP / RÚT' : 'ĐIỀU CHỈNH'}
            </button>
          ))}
        </div>

        {cashMode === 'CASH' ? (
          <form onSubmit={handleCashSubmit} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))' }}>
            <select value={cashForm.transaction_type} onChange={e => setCashForm(f => ({ ...f, transaction_type: e.target.value as 'DEPOSIT' | 'WITHDRAW' }))} className="ab-input" style={INPUT}>
              <option value="DEPOSIT">Nạp tiền</option>
              <option value="WITHDRAW">Rút tiền</option>
            </select>
            <input value={cashForm.amount}           onChange={e => setCashForm(f => ({ ...f, amount:           fmtInt(e.target.value) }))} type="text" inputMode="numeric" placeholder="Số tiền" className="ab-input num-premium" style={INPUT} />
            <input value={cashForm.transaction_date} onChange={e => setCashForm(f => ({ ...f, transaction_date: e.target.value }))}         type="date"                                            className="ab-input num-premium" style={INPUT} />
            <input value={cashForm.note}             onChange={e => setCashForm(f => ({ ...f, note:             e.target.value }))}         placeholder="Ghi chú"                                  className="ab-input" style={{ ...INPUT, gridColumn: '1 / -1' }} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="ab-btn ab-btn-primary" style={BTN}>LƯU GIAO DỊCH TIỀN</button>
              {editingCashId && (
                <button type="button" className="ab-btn ab-btn-subtle" style={BTN}
                  onClick={() => { setEditingCashId(null); setCashForm(DEFAULT_CASH_FORM); }}>
                  HỦY
                </button>
              )}
            </div>
          </form>
        ) : (
          <form onSubmit={handleSaveCashAdjustment} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
              {([1, -1] as (1 | -1)[]).map(s => (
                <button key={s} type="button" className={`ab-btn ${adjustmentSign === s ? 'ab-btn-primary' : 'ab-btn-subtle'}`} onClick={() => setAdjustmentSign(s)} style={BTN}>
                  {s === 1 ? 'DƯƠNG (+)' : 'ÂM (-)'}
                </button>
              ))}
            </div>
            <input value={adjustmentAmountInput} onChange={e => setAdjustmentAmountInput(fmtInt(e.target.value))} type="text" inputMode="numeric" placeholder="Nhập số điều chỉnh" className="ab-input num-premium" style={INPUT} />
            <div style={{ ...CARD, padding: 14, borderRadius: 18, boxShadow: 'none', fontSize: 13, color: C_MUTED }}>
              <div>Tiền mặt hệ thống: <strong className="num-premium" style={{ color: C_TEXT }}>{formatCurrency(cashSummary.calculatedCash)}</strong></div>
              <div style={{ marginTop: 8 }}>Điều chỉnh hiện tại: <strong className="num-premium" style={{ color: C_TEXT }}>{cashSummary.cashAdjustment >= 0 ? '+' : ''}{formatCurrency(cashSummary.cashAdjustment)}</strong></div>
            </div>
            <button type="submit" className="ab-btn ab-btn-primary" style={BTN} disabled={savingAdjustment}>
              {savingAdjustment ? 'ĐANG LƯU...' : 'LƯU ĐIỀU CHỈNH'}
            </button>
          </form>
        )}
      </Section>

      {/* =========================================================
          AI ASSISTANT
      ========================================================= */}
      <Section kicker="AI Assistant" title="NHẬN XÉT & CHIẾN LƯỢC" open={aiOpen} onToggle={() => setAiOpen(v => !v)}>
        <RiskSelector value={riskProfile} onChange={setRiskProfile} />
        <div style={{ marginTop: 12 }}>
          <button type="button" className="ab-btn ab-btn-primary" style={BTN} onClick={handleAiInsights} disabled={aiLoading || !positions.length}>
            {aiLoading
              ? <><RefreshCw size={14} className="spin-animation" style={{ marginRight: 6 }} />ĐANG PHÂN TÍCH</>
              : 'PHÂN TÍCH DANH MỤC'
            }
          </button>
        </div>

        {aiError && <div className="ab-error" style={{ marginTop: 10 }}>{aiError}</div>}

        {aiResult ? (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 14, background: 'var(--soft)', borderRadius: 14, fontStyle: 'italic', border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.55 }}>
              {aiResult.summary}
            </div>
            {(aiResult.actions ?? []).map(item => <AiActionCard key={item.symbol} item={item} />)}
            {(aiResult.risks?.length ?? 0) > 0 && (
              <div style={{ padding: 14, background: 'rgba(244,63,94,0.05)', borderRadius: 14, border: '1px solid rgba(244,63,94,0.20)', fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ color: C_RED, fontWeight: 800 }}>⚠ RỦI RO: </span>
                {aiResult.risks.join(' | ')}
              </div>
            )}
          </div>
        ) : !aiLoading && (
          <div style={{ marginTop: 10, color: C_MUTED, fontSize: 13 }}>
            Nhấn "Phân tích danh mục" để AI đưa gợi ý xử lý và thiết lập TP/SL theo khẩu vị rủi ro.
          </div>
        )}
      </Section>

      {/* =========================================================
          TELEGRAM
      ========================================================= */}
      <Section kicker="Telegram" title="BÁO CÁO CUỐI NGÀY" open={telegramOpen} onToggle={handleToggleTelegram}>
        <form onSubmit={handleSaveTelegram} style={{ display: 'grid', gap: 10 }}>
          <input value={telegram.chat_id} onChange={e => setTelegram(t => ({ ...t, chat_id: e.target.value }))} placeholder="Nhập Chat ID Telegram" className="ab-input num-premium" style={INPUT} />

          {[
            { label: 'Bật báo cáo qua Telegram', key: 'is_enabled'   as keyof TelegramSettings },
            { label: 'Gửi tự động hàng ngày',    key: 'notify_daily' as keyof TelegramSettings },
          ].map(opt => (
            <label key={opt.key} className="ab-toggle-row" style={{ color: C_MUTED, fontSize: 13, fontWeight: 700 }}>
              <input type="checkbox" checked={telegram[opt.key] as boolean} onChange={e => setTelegram(t => ({ ...t, [opt.key]: e.target.checked }))} />
              <span>{opt.label}</span>
            </label>
          ))}

          <div>
            <div style={{ ...LABEL, marginBottom: 6 }}>Giờ gửi báo cáo (Giờ VN)</div>
            <input value={telegram.daily_hour_vn} onChange={e => setTelegram(t => ({ ...t, daily_hour_vn: clampHour(Number(e.target.value || 15)) }))} type="number" min={0} max={23} className="ab-input num-premium" style={{ ...INPUT, width: '100%' }} placeholder="Ví dụ: 15" />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="submit" className="ab-btn ab-btn-primary" style={BTN} disabled={telegramSaving}>
              {telegramSaving ? 'ĐANG LƯU...' : 'LƯU CẤU HÌNH'}
            </button>
            <button type="button" className="ab-btn ab-btn-subtle" style={{ ...BTN, display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleTelegramTest} disabled={telegramTesting || telegramLoading}>
              <Send size={14} />{telegramTesting ? 'ĐANG GỬI...' : 'GỬI THỬ NGAY'}
            </button>
          </div>
        </form>
        {telegramMessage && <div className="ab-error" style={{ marginTop: 12 }}>{telegramMessage}</div>}
      </Section>

      {/* =========================================================
          RESET
      ========================================================= */}
      <section style={{ ...CARD, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={LABEL}>Quản trị hệ thống</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>RESET DANH MỤC</div>
            <div style={{ fontSize: 12, color: C_MUTED, marginTop: 6, lineHeight: 1.4 }}>
              Xóa toàn bộ dữ liệu hiện tại để khởi tạo lại từ đầu. Hành động này không thể hoàn tác.
            </div>
          </div>
          <button type="button" className="ab-btn" style={{ background: 'rgba(244,63,94,0.10)', color: C_RED, border: '1px solid rgba(244,63,94,0.20)', borderRadius: 999, padding: '10px 16px', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }} onClick={handleReset} disabled={resetting}>
            <Trash2 size={16} />{resetting ? 'ĐANG XÓA...' : 'XÓA TOÀN BỘ'}
          </button>
        </div>
      </section>
    </>
  );
}
