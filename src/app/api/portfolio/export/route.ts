// src/app/api/portfolio/export/route.ts
//
// GET /api/portfolio/export?format=xlsx|csv
//
// Xuất danh mục ra file Excel (xlsx) hoặc CSV:
//   Sheet 1 – Vị thế hiện tại
//   Sheet 2 – Lịch sử giao dịch (enriched)
//   Sheet 3 – Tổng quan
// Chỉ chạy server-side — xlsx không được bundle vào client

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getBearerToken } from '@/lib/server/api-utils';
import { getSupabaseUserClient } from '@/lib/server/supabase-user';
// ✨ Phase 4.2: giá hiện tại lấy LIVE qua fetchMarketPrices (cùng nguồn với dashboard)
import { fetchMarketPrices } from '@/lib/server/market';
import {
  derivePortfolio, calcCashSummary, calcSummary,
  CashTransaction, PortfolioSettings, Transaction,
} from '@/lib/calculations';

// ─── Helpers ────────────────────────

const fmtD = (v: string | null | undefined) => v ? v.slice(0, 10) : '';

function escCsv(v: unknown): string {
  const s = String(v ?? '');
  return (s.includes(',') || s.includes('\"') || s.includes('\n'))
    ? `\"${s.replace(/\"/g, '\"\"')}\"` : s;
}

function toCsv(rows: (string | number | null)[][]): string {
  return rows.map(r => r.map(escCsv).join(',')).join('\r\n');
}

// ─── Sheet builders ────────────────────

function posRows(
  portfolio: ReturnType<typeof derivePortfolio>,
  prices: Record<string, number>,
) {
  const H = ['Mã', 'Giá mua', 'Số lượng', 'Ngày mua', 'Giá hiện tại', 'Giá trị vốn', 'Giá trị TT', 'Lãi/Lỗ', 'Lãi/Lỗ%'];
  const rows = portfolio.openLots.map(lot => {
    const cur = prices[lot.symbol] ?? 0;
    const cost = lot.buy_price * lot.quantity;
    const mkt = cur * lot.quantity;
    const pnl = mkt - cost;
    const pnlPct = cost > 0 ? +(pnl / cost * 100).toFixed(2) : '';
    return [lot.symbol, lot.buy_price, lot.quantity, fmtD(lot.buy_date),
      cur || '', cost, mkt || '', mkt ? pnl : '', mkt ? pnlPct : ''];
  });
  return [H, ...rows];
}

function txRows(enriched: ReturnType<typeof derivePortfolio>['enrichedTransactions']) {
  const H = ['Ngày', 'Loại', 'Mã', 'Số lượng', 'Giá', 'Giá trị', 'Giá vốn BQ', 'Lãi/Lỗ thực', 'Ghi chú'];
  const rows = [...enriched]
    .sort((a, b) => (b.trade_date ?? b.created_at).localeCompare(a.trade_date ?? a.created_at))
    .map(tx => [
      fmtD(tx.trade_date ?? tx.created_at),
      tx.transaction_type === 'BUY' ? 'Mua' : 'Bán',
      tx.symbol, tx.quantity, tx.price,
      tx.price * tx.quantity,
      tx.transaction_type === 'SELL' ? (tx.avg_cost ?? '') : '',
      tx.transaction_type === 'SELL' ? (tx.realized_pnl ?? '') : '',
      tx.note ?? '',
    ]);
  return [H, ...rows];
}

function summaryRows(
  portfolio: ReturnType<typeof derivePortfolio>,
  prices: Record<string, number>,
  cashTxs: CashTransaction[],
  transactions: Transaction[],
  settings: PortfolioSettings | null,
) {
  const s = calcSummary(portfolio.positions, prices);
  const cash = calcCashSummary(cashTxs, transactions, settings);
  const r = portfolio;
  const nav = cash.actualCash + s.totalNow;
  return [
    ['TỔNG QUAN DANH MỤC', ''],
    ['Tổng tài sản (NAV)', nav],
    ['Giá trị cổ phiếu', s.totalNow],
    ['Tiền mặt', cash.actualCash],
    ['Vốn gốc', cash.netCapital],
    ['Lãi/Lỗ tổng', nav - cash.netCapital],
    ['Lãi/Lỗ chưa thực hiện', s.totalPnl],
    [''],
    ['GIAO DỊCH ĐÃ CHỐT', ''],
    ['Số lần bán', r.totalSellOrders],
    ['Lãi/Lỗ chốt', r.totalRealizedPnl],
    ['Win rate', r.totalSellOrders > 0
      ? `${(r.wins / r.totalSellOrders * 100).toFixed(1)}%` : '—'],
    ['Thắng / Thua', `${r.wins} / ${r.losses}`],
    [''],
    ['Số mã đang nắm', portfolio.positions.length],
    ['Ngày xuất', new Date().toLocaleDateString('vi-VN')],
  ];
}

function buildXlsx(sheets: { name: string; rows: (string | number | null)[][] }[]) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = Array(10).fill({ wch: 20 });
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ─── Route ──────────────────────

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseUserClient(token);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const format = (request.nextUrl.searchParams.get('format') ?? 'xlsx').toLowerCase();
  if (!['xlsx', 'csv'].includes(format))
    return NextResponse.json({ error: 'format phải là xlsx hoặc csv' }, { status: 400 });

  // Phase 4.2: bỏ đọc bảng price_cache (per-user, dễ stale) — không lấy giá ở bước này nữa.
  const [txRes, cashRes, settingsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', user.id)
      .order('trade_date', { ascending: true }),
    supabase.from('cash_transactions').select('*').eq('user_id', user.id),
    supabase.from('portfolio_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  const transactions = (txRes.data ?? []) as Transaction[];
  const cashTxs = (cashRes.data ?? []) as CashTransaction[];
  const settings = (settingsRes.data ?? null) as PortfolioSettings | null;

  if (!transactions.length)
    return NextResponse.json({ error: 'Chưa có giao dịch nào' }, { status: 404 });

  const portfolio = derivePortfolio(transactions);
  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    // CSV chỉ xuất lịch sử giao dịch — không cần giá hiện tại
    const csv = toCsv(txRows(portfolio.enrichedTransactions));
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=\"portfolio-transactions-${dateStr}.csv\"`,
      },
    });
  }

  // ✨ Phase 4.2: giá hiện tại lấy LIVE từ fetchMarketPrices (DNSE → Yahoo → VCI → snapshot),
  // đúng nguồn dashboard đang dùng. Chỉ fetch cho xlsx và chỉ các mã đang nắm.
  const symbols = [...new Set(portfolio.openLots.map(lot => lot.symbol))];
  const prices: Record<string, number> = symbols.length
    ? (await fetchMarketPrices(symbols)).prices
    : {};

  const buffer = buildXlsx([
    { name: 'Vị thế hiện tại', rows: posRows(portfolio, prices) },
    { name: 'Lịch sử giao dịch', rows: txRows(portfolio.enrichedTransactions) },
    { name: 'Tổng quan', rows: summaryRows(portfolio, prices, cashTxs, transactions, settings) },
  ]);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=\"portfolio-${dateStr}.xlsx\"`,
    },
  });
}
