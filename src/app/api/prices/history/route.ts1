// src/app/api/prices/history/route.ts
//
// GET /api/prices/history?symbol=VNINDEX&range=7d|30d|90d|180d|1y|all
//
// Lấy lịch sử giá / chỉ số theo range.
// Hiện tại hỗ trợ VNINDEX (từ vnstock Python) và các mã VN thường.
// Trả về: { history: Array<{ date: string; close: number }> }

import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/server/api-utils';
import { getSupabaseUserClient } from '@/lib/server/supabase-user';

type RangeKey = '7d' | '30d' | '90d' | '180d' | '1y' | 'all';

function rangeToStartDate(range: RangeKey): string | null {
  const now = new Date();
  const map: Record<RangeKey, number | null> = {
    '7d':   7,
    '30d':  30,
    '90d':  90,
    '180d': 180,
    '1y':   365,
    'all':  null,
  };
  const days = map[range];
  if (days == null) return null;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  // Auth — cần token để giới hạn abuse
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseUserClient(token);
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp     = request.nextUrl.searchParams;
  const symbol = (sp.get('symbol') ?? 'VNINDEX').trim().toUpperCase();
  const range  = (sp.get('range')  ?? '180d') as RangeKey;

  if (!['7d','30d','90d','180d','1y','all'].includes(range)) {
    return NextResponse.json({ error: 'range không hợp lệ' }, { status: 400 });
  }

  const startDate = rangeToStartDate(range);
  const endDate   = new Date().toISOString().slice(0, 10);

  // ── Gọi vnstock Python script ─────────────────────────────────────────────
  // Server-side gọi vnstock tương tự cách /api/prices đang làm.
  // Nếu có price_history table trong Supabase thì query trực tiếp.
  // Fallback: gọi /api/prices-cache hoặc trả mảng rỗng (chart ẩn VN-Index).
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const script = `
import json, sys
from datetime import datetime
try:
    from vnstock3 import Vnstock
    stock = Vnstock().stock(symbol='${symbol}', source='VCI')
    df = stock.quote.history(start='${startDate ?? '2020-01-01'}', end='${endDate}', interval='1D')
    rows = []
    for _, row in df.iterrows():
        d = row.get('time') or row.get('date') or row.get('Date')
        c = row.get('close') or row.get('Close')
        if d and c:
            rows.append({'date': str(d)[:10], 'close': float(c)})
    print(json.dumps({'history': rows}))
except Exception as e:
    print(json.dumps({'history': [], 'error': str(e)}))
`;

    const { stdout } = await execFileAsync('python3', ['-c', script], { timeout: 15_000 });
    const parsed = JSON.parse(stdout.trim());

    return NextResponse.json(
      { history: parsed.history ?? [] },
      { headers: { 'Cache-Control': 'public, max-age=900' } }, // cache 15 phút
    );
  } catch {
    // Nếu vnstock không có hoặc lỗi → trả mảng rỗng, chart tự ẩn VN-Index
    return NextResponse.json({ history: [] });
  }
}
