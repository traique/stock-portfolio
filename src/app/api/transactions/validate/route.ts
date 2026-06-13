// src/app/api/transactions/validate/route.ts
//
// Validate một giao dịch mới (BUY/SELL/STOCK_DIVIDEND) trước khi lưu vào DB.
// Client gọi endpoint này ngay sau khi người dùng điền form —
// nếu SELL vượt số lượng sẽ nhận lỗi rõ ràng thay vì phát hiện sau khi INSERT.
// (BUY và STOCK_DIVIDEND luôn hợp lệ nếu qty > 0.)
//
// POST /api/transactions/validate
// Body: { transaction_type, symbol, quantity, price, trade_date, note? }
// Response 200: { valid: true }
// Response 422: { valid: false, error: string }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getBearerToken, validationErrorResponse } from '@/lib/server/api-utils';
import { getSupabaseUserClient } from '@/lib/server/supabase-user';
import { validateNewTransaction, Transaction } from '@/lib/calculations';

const bodySchema = z.object({
  // ✨ thêm STOCK_DIVIDEND (cổ tức cổ phiếu)
  transaction_type: z.enum(['BUY', 'SELL', 'STOCK_DIVIDEND']),
  symbol: z.string().trim().min(1).max(20).toUpperCase(),
  quantity: z.coerce.number().positive(),
  // ✨ cổ tức cổ phiếu có giá = 0 → cho phép >= 0 (BUY/SELL vẫn buộc > 0, kiểm tra bên dưới)
  price: z.coerce.number().min(0),
  trade_date: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  // id tạm để simulation nhận dạng lệnh mới — client tự sinh UUID hoặc để trống
  id: z.string().optional().default('__validate__'),
});

export async function POST(request: NextRequest) {
  // 1. Auth
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ valid: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseUserClient(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ valid: false, error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ valid: false, error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const { id, transaction_type, symbol, quantity, price, trade_date, note } = parsed.data;

  // ✨ BUY/SELL cần giá > 0; STOCK_DIVIDEND cho phép giá 0.
  if (transaction_type !== 'STOCK_DIVIDEND' && price <= 0) {
    return NextResponse.json({ valid: false, error: 'Giá phải lớn hơn 0' }, { status: 422 });
  }

  // 3. Lấy lịch sử giao dịch hiện tại của user
  const { data: existing, error: dbError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('trade_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (dbError) {
    return NextResponse.json(
      { valid: false, error: `Không lấy được dữ liệu: ${dbError.message}` },
      { status: 500 },
    );
  }

  // 4. Validate
  const result = validateNewTransaction(
    (existing ?? []) as Transaction[],
    {
      id,
      user_id: user.id,
      transaction_type,
      symbol,
      quantity,
      price,
      trade_date: trade_date ?? null,
      note: note ?? null,
    },
  );

  if (!result.valid) {
    return NextResponse.json({ valid: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({ valid: true });
}
