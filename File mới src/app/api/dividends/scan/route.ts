// src/app/api/dividends/scan/route.ts
//
// Quét cổ tức tự động cho các mã đang nắm giữ, nguồn: cotuc.vn (HTML).
//   GET  /api/dividends/scan           → trả về danh sách GỢI Ý cổ tức (KHÔNG tự ghi).
//   GET  /api/dividends/scan?debug=1   → kèm dữ liệu thô đã parse (để kiểm tra).
//   POST /api/dividends/scan { items } → ghi nhận các gợi ý đã được người dùng chọn.
//
// Triết lý: BÁN TỰ ĐỘNG — app gợi ý, người dùng bấm xác nhận.
// Vẫn giữ nhập tay (form + validate/route.ts) làm cách chính; endpoint này chỉ bổ trợ.

import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/server/api-utils';
import { getSupabaseUserClient } from '@/lib/server/supabase-user';
import { simulateTransactions, formatCurrency, Transaction } from '@/lib/calculations';

export const dynamic = 'force-dynamic';

// Dựng URL bằng concat để tránh bị xử lý nhầm.
const COTUC_HOST = 'https://' + 'cotuc.vn';
const FETCH_TIMEOUT_MS = 8000;
const MAX_SYMBOLS = 50;

type DividendKind = 'CASH' | 'STOCK';

type DividendEvent = {
  kind: DividendKind;        // tiền mặt hay cổ phiếu
  recordDate: string;        // ĐKCC (ISO yyyy-mm-dd)
  exDate: string;            // GDKHQ ≈ ĐKCC - 1 ngày giao dịch (ISO)
  cashPerShare?: number;     // CASH: đồng/CP
  ratioNumerator?: number;   // STOCK: nhận N CP
  ratioDenominator?: number; // STOCK: trên mỗi M CP
  rawContent: string;        // mô tả gốc để đối chiếu
};

type Suggestion = {
  symbol: string;
  kind: DividendKind;
  exDate: string;
  recordDate: string;
  heldShares: number;        // số CP đủ điều kiện hưởng quyền
  cashAmount?: number;       // CASH: tổng tiền nhận
  stockShares?: number;      // STOCK: số CP thưởng nhận thêm
  description: string;
  note: string;              // khóa chống trùng + lưu mã (cash_transactions không có cột symbol)
  upcoming: boolean;         // GDKHQ ở tương lai?
};

// ───── Auth helper ─────
async function authenticate(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return null;
  const supabase = getSupabaseUserClient(token);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, user };
}

// ───── Date helpers ─────
function toIsoDate(day: number, month: number, year: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// GDKHQ = ngày làm việc ngay trước ĐKCC (bỏ qua T7/CN).
function prevTradingDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const dow = d.getUTCDay(); // 0=CN, 6=T7
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  else if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ───── Fetch cotuc.vn ─────
async function fetchCotucHtml(symbol: string): Promise<string | null> {
  const url = COTUC_HOST + '/co-phieu/' + symbol.toLowerCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LCTA/1.0)',
        'Accept-Language': 'vi,en;q=0.8',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ───── Parser (chỉnh REGEX ở đây nếu cotuc.vn đổi layout) ─────
function sliceStatsSection(html: string): string {
  const startIdx = html.indexOf('Bảng thống kê');
  if (startIdx === -1) return html;
  let endIdx = html.length;
  for (const k of ['Giao dịch cổ phiếu', 'Giới thiệu']) {
    const i = html.indexOf(k, startIdx + 12);
    if (i !== -1 && i < endIdx) endIdx = i;
  }
  return html.slice(startIdx, endIdx);
}

function parseDividendEvents(html: string): DividendEvent[] {
  const section = sliceStatsSection(html);
  // Biến HTML → text có khoảng trắng giữa các ô (thay thẽ tag bằng space).
  const text = section
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

  const events: DividendEvent[] = [];
  let currentYear = new Date().getFullYear();

  // Mỗi lần khớp: HOẶC năm-nhóm (4 chữ số đứng trước 1 ngày d/m),
  // HOẶC 1 dòng sự kiện (d/m + loại cổ tức).
  const re = /\b(20\d{2})\b(?=\s+\d{1,2}\/\d{1,2})|(\d{1,2})\/(\d{1,2})\s+(Trả cổ tức bằng tiền mặt|Trả cổ tức bằng cổ phiếu|Thưởng cổ phiếu)/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      currentYear = parseInt(m[1], 10);
      continue;
    }
    const day = parseInt(m[2], 10);
    const month = parseInt(m[3], 10);
    const typeText = m[4];
    if (!day || !month || day > 31 || month > 12) continue;

    const tail = text.slice(re.lastIndex, re.lastIndex + 140);
    const recordDate = toIsoDate(day, month, currentYear);
    const exDate = prevTradingDay(recordDate);

    if (typeText.indexOf('tiền mặt') !== -1) {
      // Giá trị dạng "+1.000 đ/CP" → bỏ dấu chấm phân cách nghìn.
      const cm = tail.match(/\+?\s*([\d.]+)\s*đ\s*\/\s*CP/);
      if (!cm) continue;
      const cashPerShare = Number(cm[1].replace(/\./g, ''));
      if (!cashPerShare) continue;
      events.push({ kind: 'CASH', recordDate, exDate, cashPerShare, rawContent: (typeText + ' ' + tail).slice(0, 80) });
    } else {
      // Giá trị dạng "+3 CP/20 CP" → tỷ lệ 3:20.
      const sm = tail.match(/\+?\s*(\d+)\s*CP\s*\/\s*(\d+)\s*CP/);
      if (!sm) continue;
      const ratioNumerator = parseInt(sm[1], 10);
      const ratioDenominator = parseInt(sm[2], 10);
      if (!ratioNumerator || !ratioDenominator) continue;
      events.push({ kind: 'STOCK', recordDate, exDate, ratioNumerator, ratioDenominator, rawContent: (typeText + ' ' + tail).slice(0, 80) });
    }
  }

  // Loại trùng (cùng loại + cùng ngày + cùng giá trị).
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = e.kind + e.exDate + (e.cashPerShare ?? '') + (e.ratioNumerator ?? '') + (e.ratioDenominator ?? '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ───── Portfolio helpers ─────
function currentlyHeldSymbols(transactions: Transaction[]): string[] {
  const sim = simulateTransactions(transactions);
  if (!sim.valid) return [];
  const set = new Set<string>();
  for (const lot of sim.openLots) {
    if (Number(lot.quantity || 0) > 0) set.add(lot.symbol.toUpperCase());
  }
  return Array.from(set).slice(0, MAX_SYMBOLS);
}

// Số CP đang nắm giữ TRƯỚC ngày GDKHQ (phải sở hữu trước mới được hưởng quyền).
function sharesHeldBefore(transactions: Transaction[], symbol: string, exDateIso: string): number {
  const upto = transactions.filter((t) => {
    const d = (t.trade_date || t.created_at || '').slice(0, 10);
    return d !== '' && d < exDateIso;
  });
  const sim = simulateTransactions(upto);
  if (!sim.valid) return 0;
  return sim.openLots
    .filter((l) => l.symbol.toUpperCase() === symbol.toUpperCase())
    .reduce((s, l) => s + Number(l.quantity || 0), 0);
}

function buildNote(symbol: string, ev: DividendEvent): string {
  return `[Cổ tức cotuc.vn] ${symbol} ${ev.kind} GDKHQ ${ev.exDate}`;
}

// ═════ GET: quét & trả gợi ý ═════
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { supabase, user } = auth;

  const debug = request.nextUrl.searchParams.get('debug') === '1';

  const { data: txData, error: txErr } = await supabase
    .from('transactions').select('*').eq('user_id', user.id);
  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });
  const transactions = (txData ?? []) as Transaction[];

  const { data: cashData } = await supabase
    .from('cash_transactions').select('*').eq('user_id', user.id);
  const existingCash = (cashData ?? []) as Array<{ transaction_type: string; note: string | null }>;

  const heldSymbols = currentlyHeldSymbols(transactions);
  const today = new Date().toISOString().slice(0, 10);

  const suggestions: Suggestion[] = [];
  const debugInfo: Array<Record<string, unknown>> = [];

  for (const symbol of heldSymbols) {
    const html = await fetchCotucHtml(symbol);
    if (!html) {
      if (debug) debugInfo.push({ symbol, error: 'fetch failed' });
      continue;
    }
    const events = parseDividendEvents(html);
    if (debug) debugInfo.push({ symbol, htmlLength: html.length, parsed: events });

    for (const ev of events) {
      const held = sharesHeldBefore(transactions, symbol, ev.exDate);
      if (held <= 0) continue;

      const note = buildNote(symbol, ev);

      // Chống trùng
      if (ev.kind === 'STOCK') {
        const dup = transactions.some((t) =>
          t.transaction_type === 'STOCK_DIVIDEND' &&
          t.symbol.toUpperCase() === symbol.toUpperCase() &&
          (t.trade_date || '').slice(0, 10) === ev.exDate);
        if (dup) continue;
      } else {
        const dup = existingCash.some((c) =>
          c.transaction_type === 'DIVIDEND' && (c.note || '') === note);
        if (dup) continue;
      }

      if (ev.kind === 'CASH') {
        const cashAmount = held * (ev.cashPerShare || 0);
        if (cashAmount <= 0) continue;
        suggestions.push({
          symbol, kind: 'CASH', exDate: ev.exDate, recordDate: ev.recordDate,
          heldShares: held, cashAmount,
          description: `${symbol}: cổ tức tiền mặt ${formatCurrency(ev.cashPerShare || 0)}/CP × ${held} CP = ${formatCurrency(cashAmount)} (GDKHQ ${ev.exDate})`,
          note, upcoming: ev.exDate > today,
        });
      } else {
        const num = ev.ratioNumerator || 0;
        const den = ev.ratioDenominator || 0;
        if (num <= 0 || den <= 0) continue;
        const stockShares = Math.floor((held * num) / den);
        if (stockShares <= 0) continue;
        suggestions.push({
          symbol, kind: 'STOCK', exDate: ev.exDate, recordDate: ev.recordDate,
          heldShares: held, stockShares,
          description: `${symbol}: cổ tức/thưởng cổ phiếu ${num}:${den} × ${held} CP = +${stockShares} CP (GDKHQ ${ev.exDate})`,
          note, upcoming: ev.exDate > today,
        });
      }
    }
  }

  suggestions.sort((a, b) => (a.exDate < b.exDate ? 1 : -1));

  return NextResponse.json({
    source: 'cotuc.vn',
    generatedAt: new Date().toISOString(),
    scannedSymbols: heldSymbols,
    count: suggestions.length,
    suggestions,
    ...(debug ? { debug: debugInfo } : {}),
  });
}

// ═════ POST: ghi nhận các gợi ý đã chọn ═════
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { supabase, user } = auth;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const items = (body as { items?: Suggestion[] })?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Thiếu danh sách items' }, { status: 400 });
  }

  let inserted = 0;
  const errors: string[] = [];

  for (const it of items) {
    try {
      if (it.kind === 'STOCK') {
        const qty = Number(it.stockShares);
        if (!qty || qty <= 0) { errors.push(`${it.symbol}: số CP thưởng không hợp lệ`); continue; }
        const { error } = await supabase.from('transactions').insert({
          user_id: user.id,
          symbol: String(it.symbol).toUpperCase(),
          transaction_type: 'STOCK_DIVIDEND',
          price: 0,
          quantity: qty,
          trade_date: it.exDate,
          note: it.note || null,
        });
        if (error) errors.push(`${it.symbol}: ${error.message}`);
        else inserted++;
      } else if (it.kind === 'CASH') {
        const amount = Number(it.cashAmount);
        if (!amount || amount <= 0) { errors.push(`${it.symbol}: số tiền không hợp lệ`); continue; }
        // Lưu ý: cash_transactions không có cột symbol → mã được lưu trong note.
        const { error } = await supabase.from('cash_transactions').insert({
          user_id: user.id,
          transaction_type: 'DIVIDEND',
          amount,
          transaction_date: it.exDate,
          note: it.note || null,
        });
        if (error) errors.push(`${it.symbol}: ${error.message}`);
        else inserted++;
      } else {
        errors.push(`${it.symbol}: kind không hợp lệ`);
      }
    } catch (e) {
      errors.push(`${it?.symbol}: ${(e as Error)?.message || 'lỗi không xác định'}`);
    }
  }

  return NextResponse.json({ inserted, errors });
}
