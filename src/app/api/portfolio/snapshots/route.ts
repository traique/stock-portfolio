// src/app/api/portfolio/snapshots/route.ts
// Trả về lịch sử snapshot của user hiện tại.
// Query params: ?range=7d|30d|90d|180d|1y|all (default: 90d)

import { NextRequest, NextResponse } from 'next/server';
import { getBearerToken } from '@/lib/server/api-utils';
import { getSupabaseUserClient } from '@/lib/server/supabase-user';

const RANGE_DAYS: Record<string, number | null> = {
  '7d':   7,
  '30d':  30,
  '90d':  90,
  '180d': 180,
  '1y':   365,
  'all':  null,
};

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseUserClient(token);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const range   = request.nextUrl.searchParams.get('range') ?? '90d';
  const days    = RANGE_DAYS[range] ?? 90;

  let query = supabase
    .from('portfolio_snapshots')
    .select('snapshot_date, total_assets, market_value, nav_cash, net_capital, total_pnl, total_pnl_pct, position_count')
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: true });

  if (days !== null) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    query = query.gte('snapshot_date', from.toISOString().slice(0, 10));
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ snapshots: data ?? [], range });
}
