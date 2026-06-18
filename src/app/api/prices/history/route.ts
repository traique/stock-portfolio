// src/app/api/prices/history/route.ts
//
// GET /api/prices/history?symbol=VNINDEX&range=7d|30d|90d|180d|1y|all
//
// Lấy lịch sử giá / chỉ số theo range, dùng provider VCI (giống /api/history/[symbol]).
// Trả về: { history: Array<{ date: string; close: number }> }

import { NextRequest, NextResponse } from 'next/server';
import { getVciChartOHLCV } from '@/lib/server/providers/vci-chart';

type RangeKey = '7d' | '30d' | '90d' | '180d' | '1y' | 'all';

const RANGE_DAYS: Record<RangeKey, number | null> = {
  '7d': 7, '30d': 30, '90d': 90, '180d': 180, '1y': 365, all: null,
};

// ✅ Whitelist mã: chỉ chữ HOA + số, 2–10 ký tự. Chặn mọi ký tự injection.
const SYMBOL_RE = /^[A-Z0-9]{2,10}$/;

function rangeToStartDate(range: RangeKey): string {
  const days = RANGE_DAYS[range];
  if (days == null) return '2015-01-01';
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const sp     = request.nextUrl.searchParams;
  const symbol = (sp.get('symbol') ?? 'VNINDEX').trim().toUpperCase();
  const range  = (sp.get('range')  ?? '180d') as RangeKey;

  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: 'symbol không hợp lệ' }, { status: 400 });
  }
  if (!(range in RANGE_DAYS)) {
    return NextResponse.json({ error: 'range không hợp lệ' }, { status: 400 });
  }

  const startDate = rangeToStartDate(range);
  const endDate   = new Date().toISOString().slice(0, 10);

  try {
    // ✅ Dùng provider VCI có sẵn — KHÔNG spawn python3 (Vercel không có Python/vnstock).
    const candles = await getVciChartOHLCV(symbol, startDate, endDate, '1D');
    const history = (candles ?? []).map((c: any) => ({
      date:  String(c.date ?? c.time).slice(0, 10),
      close: Number(c.close),
    }));

    return NextResponse.json(
      { history },
      { headers: { 'Cache-Control': 'public, max-age=900, s-maxage=900' } }, // cache 15 phút
    );
  } catch {
    // Provider lỗi → trả mảng rỗng, chart tự ẩn VN-Index
    return NextResponse.json({ history: [] });
  }
      }
