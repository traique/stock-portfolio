// src/app/api/cron/snapshot/route.ts
//
// Chạy lúc 08:10 UTC = 15:10 VN, thứ 2 → thứ 6
// Yahoo Finance thường delay ~10 phút nên lấy 15h10 để có giá chính xác hơn.
//
// Vercel cron config (vercel.json):
//   { "path": "/api/cron/snapshot", "schedule": "10 8 * * 1-5" }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  calcCashSummary, calcSummary,
  CashTransaction, derivePortfolio,
  PortfolioSettings, Transaction,
} from '@/lib/calculations';
import { verifyCronSecret } from '@/lib/server/api-utils';

// =========================================================
// SUPABASE SERVICE CLIENT (bypass RLS)
// =========================================================

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVER_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// =========================================================
// PRICE FETCH (internal — reuse existing prices-cache API)
// =========================================================

async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL
      ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
      ?? 'http://localhost:3000';
    const url = `${base.replace(/\/$/, '')}/api/prices-cache?symbols=${encodeURIComponent(symbols.join(','))}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return {};
    const data = await res.json();
    return data?.prices ?? {};
  } catch {
    return {};
  }
}

// =========================================================
// SNAPSHOT LOGIC
// =========================================================

async function snapshotForUser(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  snapshotDate: string, // YYYY-MM-DD in VN timezone
) {
  // 1. Fetch transactions
  const [txRes, cashRes, settingsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', userId)
      .order('trade_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('cash_transactions').select('*').eq('user_id', userId)
      .order('transaction_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('portfolio_settings').select('*')
      .eq('user_id', userId).maybeSingle(),
  ]);

  if (txRes.error || cashRes.error) return { ok: false, error: 'DB fetch failed' };

  const transactions     = (txRes.data   ?? []) as Transaction[];
  const cashTransactions = (cashRes.data ?? []) as CashTransaction[];
  const settings         = (settingsRes.data ?? null) as PortfolioSettings | null;

  if (!transactions.length && !cashTransactions.length) {
    return { ok: true, skipped: true, reason: 'no data' };
  }

  // 2. Derive open positions — 1 lần simulate duy nhất
  const { enrichedTransactions, positions } = derivePortfolio(transactions);
  const symbols = positions.map(p => p.symbol);

  // 3. Fetch live prices
  const prices = await fetchPrices(symbols);

  // 4. Calculate
  const summary     = calcSummary(positions, prices);
  const cashSummary = calcCashSummary(cashTransactions, enrichedTransactions, settings);

  const totalAssets = cashSummary.actualCash + summary.totalNow;
  const netCapital  = cashSummary.netCapital;
  const totalPnl    = totalAssets - netCapital;
  const totalPnlPct = netCapital > 0 ? (totalPnl / netCapital) * 100 : 0;

  // 5. Upsert snapshot (one per user per day)
  const { error: upsertErr } = await supabase
    .from('portfolio_snapshots')
    .upsert(
      {
        user_id:        userId,
        snapshot_date:  snapshotDate,
        total_assets:   Math.round(totalAssets),
        market_value:   Math.round(summary.totalNow),
        nav_cash:       Math.round(cashSummary.actualCash),
        net_capital:    Math.round(netCapital),
        total_pnl:      Math.round(totalPnl),
        total_pnl_pct:  Number(totalPnlPct.toFixed(4)),
        position_count: positions.length,
      },
      { onConflict: 'user_id,snapshot_date' },
    );

  if (upsertErr) return { ok: false, error: upsertErr.message };
  return { ok: true };
}

// =========================================================
// HANDLER
// =========================================================

export async function GET(request: NextRequest) {
  const authErr = verifyCronSecret(request);
  if (authErr) return authErr;

  const supabase = getServiceClient();

  // VN date — cron runs at 15:10 VN so Date.now() is already in that window
  const vnDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date()); // returns YYYY-MM-DD

  // Fetch all users who have at least one transaction
  const { data: users, error: usersErr } = await supabase
    .from('transactions')
    .select('user_id')
    .limit(1000); // adjust if needed

  if (usersErr) {
    console.error('[snapshot] fetch users error:', usersErr);
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  // Deduplicate user IDs
  const uniqueUsers = [...new Set((users ?? []).map(r => r.user_id as string))];
  console.log(`[snapshot] ${vnDate} — processing ${uniqueUsers.length} users`);

  const results = await Promise.allSettled(
    uniqueUsers.map(uid => snapshotForUser(supabase, uid, vnDate)),
  );

  const summary = results.reduce(
    (acc, r, i) => {
      if (r.status === 'fulfilled' && r.value.ok) acc.success++;
      else {
        acc.failed++;
        console.error(`[snapshot] user ${uniqueUsers[i]} failed:`,
          r.status === 'rejected' ? r.reason : (r.value as any).error);
      }
      return acc;
    },
    { success: 0, failed: 0 },
  );

  return NextResponse.json({
    date: vnDate,
    users: uniqueUsers.length,
    ...summary,
  });
}
