// src/app/api/cron/daily/route.ts
//
// Cron duy nhất cho Vercel Free plan (chỉ cho phép 1 cron/ngày).
// Chạy lúc 08:20 UTC = 15:20 giờ Việt Nam, thứ 2 → thứ 6.
// 15:20 thay vì 15:10 để đảm bảo VCI đã có đủ OHLCV EOD sau khi thị trường đóng 15:00.
//
// Thứ tự:
//   1. Snapshot portfolio cho tất cả user (lưu data vẽ biểu đồ)
//   2. Gửi báo cáo Telegram cho user đã bật notify_daily
//
// vercel.json:
//   { "path": "/api/cron/daily", "schedule": "20 8 * * 1-5" }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  calcCashSummary, calcSummary,
  CashTransaction, derivePortfolio,
  PortfolioSettings, Transaction,
} from '@/lib/calculations';
import {
  buildDailyMessage,
  sendTelegramMessage,
  shouldSendDaily,
  TelegramSettingRow,
} from '@/lib/telegram';
import { verifyCronSecret } from '@/lib/server/api-utils';
import { fetchMarketPrices } from '@/lib/server/market';
import type { PriceMap } from '@/lib/calculations';

// ─── Supabase service client (bypass RLS) ─────────────────────────────

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVER_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Fetch giá — dùng trực tiếp fetchMarketPrices thay vì self-call HTTP ─────
// Tránh phụ thuộc vào base URL config và giảm cold-start latency.

async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (!symbols.length) return {};
  try {
    const payload = await fetchMarketPrices(symbols);
    return payload.prices;
  } catch {
    return {};
  }
}

async function fetchPricesWithDebug(symbols: string[]) {
  if (!symbols.length) return { prices: {} as PriceMap, debug: [] as Array<{ symbol: string; price: number; change: number; pct: number }> };
  try {
    const payload = await fetchMarketPrices(symbols);
    return {
      prices: payload.prices as PriceMap,
      debug:  payload.debug.map(d => ({
        symbol: d.symbol,
        price:  d.price,
        change: d.change,
        pct:    d.pct,
      })),
    };
  } catch {
    return { prices: {} as PriceMap, debug: [] };
  }
}

// ─── PHẦN 1: Snapshot ──────────────────────────────────────────────────

type SnapshotClient = ReturnType<typeof getServiceClient>;

async function snapshotForUser(
  supabase: SnapshotClient,
  userId: string,
  snapshotDate: string,
) {
  const [txRes, cashRes, settingsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('user_id', userId)
      .order('trade_date',  { ascending: true, nullsFirst: false })
      .order('created_at',  { ascending: true }),
    supabase.from('cash_transactions').select('*').eq('user_id', userId)
      .order('transaction_date', { ascending: true, nullsFirst: false })
      .order('created_at',       { ascending: true }),
    supabase.from('portfolio_settings').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  if (txRes.error || cashRes.error) return { ok: false, error: 'DB fetch failed' };

  const transactions     = (txRes.data   ?? []) as Transaction[];
  const cashTransactions = (cashRes.data ?? []) as CashTransaction[];
  const settings         = (settingsRes.data ?? null) as PortfolioSettings | null;

  if (!transactions.length && !cashTransactions.length) {
    return { ok: true, skipped: true };
  }

  const { enrichedTransactions, positions } = derivePortfolio(transactions);
  const symbols = positions.map(p => p.symbol);
  const prices  = await fetchPrices(symbols);

  const summary     = calcSummary(positions, prices);
  const cashSummary = calcCashSummary(cashTransactions, enrichedTransactions, settings);

  const totalAssets = cashSummary.actualCash + summary.totalNow;
  const netCapital  = cashSummary.netCapital;
  const totalPnl    = totalAssets - netCapital;
  const totalPnlPct = netCapital > 0 ? (totalPnl / netCapital) * 100 : 0;

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

async function runSnapshot(supabase: SnapshotClient, vnDate: string) {
  const { data: users, error } = await supabase
    .from('transactions')
    .select('user_id')
    .limit(1000);

  if (error) return { ok: false, error: error.message, success: 0, failed: 0 };

  const uniqueUsers = [...new Set((users ?? []).map(r => r.user_id as string))];
  const results = await Promise.allSettled(
    uniqueUsers.map(uid => snapshotForUser(supabase, uid, vnDate)),
  );

  let success = 0, failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.ok) {
      success++;
    } else {
      failed++;
      console.error(`[daily/snapshot] user ${uniqueUsers[i]} failed:`,
        r.status === 'rejected' ? r.reason : (r.value as any).error);
    }
  });

  return { ok: true, users: uniqueUsers.length, success, failed };
}

// ─── PHẦN 2: Telegram ─────────────────────────────────────────────────

async function runTelegram(supabase: SnapshotClient, now: Date) {
  // Bỏ qua cuối tuần VN
  const vnDay = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })).getDay();
  if (vnDay === 0 || vnDay === 6) {
    return { ok: true, skipped: true, reason: 'weekend' };
  }

  const { data: settingsRows, error } = await supabase
    .from('telegram_settings')
    .select('*')
    .eq('is_enabled', true)
    .eq('notify_daily', true);

  if (error) return { ok: false, error: error.message };

  let processed = 0, sent = 0;
  const details: Array<{ user_id: string; status: string }> = [];

  for (const settings of (settingsRows ?? []) as TelegramSettingRow[]) {
    processed++;

    if (!shouldSendDaily(settings.last_daily_sent_at, now, settings.daily_hour_utc)) {
      details.push({ user_id: settings.user_id, status: 'skip:not_time' });
      continue;
    }

    try {
      const [txRes, cashRes, psRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', settings.user_id)
          .order('trade_date', { ascending: true }),
        supabase.from('cash_transactions').select('*').eq('user_id', settings.user_id)
          .order('transaction_date', { ascending: true }),
        supabase.from('portfolio_settings').select('*').eq('user_id', settings.user_id).maybeSingle(),
      ]);

      const transactions     = (txRes.data  ?? []) as Transaction[];
      const cashTransactions = (cashRes.data ?? []) as CashTransaction[];
      const portfolioSettings = (psRes.data ?? null) as PortfolioSettings | null;

      if (!transactions.length) {
        details.push({ user_id: settings.user_id, status: 'skip:no_transactions' });
        continue;
      }

      const symbols = [...new Set(transactions.map(h => h.symbol.toUpperCase()))];
      const [{ prices, debug }, { debug: vnDebug }] = await Promise.all([
        fetchPricesWithDebug(symbols),
        fetchPricesWithDebug(['VNINDEX']),
      ]);
      const vnIndex = vnDebug?.[0] ?? null;

      const { data: userData } = await supabase.auth.admin.getUserById(settings.user_id);
      const email = userData.user?.email ?? 'user@lcta.local';

      const text = buildDailyMessage(
        email, transactions, cashTransactions, portfolioSettings,
        prices, debug, vnIndex,
      );

      await sendTelegramMessage(settings.chat_id, text);

      await Promise.all([
        supabase.from('telegram_settings')
          .update({ last_daily_sent_at: now.toISOString() })
          .eq('user_id', settings.user_id),
        supabase.from('alert_logs').insert({
          user_id: settings.user_id,
          alert_type: 'daily',
          message: text,
        }),
      ]);

      sent++;
      details.push({ user_id: settings.user_id, status: 'sent' });
    } catch (err) {
      details.push({
        user_id: settings.user_id,
        status: err instanceof Error ? err.message : 'unknown_error',
      });
    }
  }

  return { ok: true, processed, sent, details };
}


// ─── PHẦN 3: EOD Price History ──────────────────────────────────────
// Gọi VCI Edge Function mode "eod" để lưu OHLCV vào price_history.
// Chạy sau snapshot để không block báo cáo Telegram.

async function runEodHistory(supabase: SnapshotClient): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anonKey) return { ok: false, error: 'Missing Supabase env' };

  try {
    const edgeUrl = `${url.replace(/\/+$/, '')}/functions/v1/vci-prices`;
    const res = await fetch(edgeUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      // days=5: cập nhật 5 phiên gần nhất mỗi ngày (nhanh, đủ rolling)
      body: JSON.stringify({ mode: 'eod', days: 5 }),
    });

    if (!res.ok) return { ok: false, error: `Edge HTTP ${res.status}` };
    const result = await res.json();
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}


// ─── PHẦN 4: Cleanup price_history ────────────────────────────────────
// Xóa data cũ hơn 90 ngày — đủ để tính tất cả indicators (SMA50, MACD, RSI...)
// Chạy sau EOD để tránh xóa data vừa insert.

async function runCleanupHistory(supabase: SnapshotClient): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  try {
    const { error, count } = await supabase
      .from('price_history')
      .delete({ count: 'exact' })
      .lt('trade_date', cutoff);

    if (error) return { ok: false, error: error.message };
    return { ok: true, deleted: count ?? 0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── HANDLER ──────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authErr = verifyCronSecret(request);
  if (authErr) return authErr;

  const now     = new Date();
  const supabase = getServiceClient();

  const vnDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(now); // YYYY-MM-DD

  // Thứ tự: snapshot → EOD history → Telegram
  // EOD history chạy song song với Telegram để tiết kiệm thời gian
  const snapshotResult = await runSnapshot(supabase, vnDate);

  const [eodResult, telegramResult, cleanupResult] = await Promise.allSettled([
    runEodHistory(supabase),
    runTelegram(supabase, now),
    runCleanupHistory(supabase),
  ]);

  return NextResponse.json({
    ran_at:      now.toISOString(),
    date:        vnDate,
    snapshot:    snapshotResult,
    eod_history: eodResult.status     === 'fulfilled' ? eodResult.value     : { ok: false, error: String(eodResult.reason) },
    telegram:    telegramResult.status === 'fulfilled' ? telegramResult.value : { ok: false, error: String(telegramResult.reason) },
    cleanup:     cleanupResult.status  === 'fulfilled' ? cleanupResult.value  : { ok: false, error: String(cleanupResult.reason) },
  });
                    }
