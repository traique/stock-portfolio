import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import {
  buildDailyMessage,
  sendTelegramMessage,
  shouldSendDaily,
  TelegramSettingRow,
} from '@/lib/telegram';
import type {
  CashTransaction,
  PortfolioSettings,
  PriceMap,
  Transaction,
} from '@/lib/calculations';

type QuoteDebugItem = {
  symbol: string;
  price: number;
  change: number;
  pct: number;
};

async function loadPrices(symbols: string[]) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!baseUrl) throw new Error('Missing NEXT_PUBLIC_SITE_URL');

  const normalizedBase = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
  const response = await fetch(
    `${normalizedBase}/api/prices?symbols=${encodeURIComponent(symbols.join(','))}`,
    { cache: 'no-store' }
  );

  const payload = await response.json();
  return {
    prices: (payload?.prices || {}) as PriceMap,
    debug: (payload?.debug || []) as QuoteDebugItem[],
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  const { data: settingsRows, error: settingsError } = await supabaseServer
    .from('telegram_settings')
    .select('*')
    .eq('is_enabled', true)
    .eq('notify_daily', true);

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  let processed = 0;
  let sent = 0;
  const details: Array<{ user_id: string; status: string }> = [];

  for (const settings of (settingsRows || []) as TelegramSettingRow[]) {
    processed += 1;

    if (!shouldSendDaily(settings.last_daily_sent_at, now, settings.daily_hour_utc)) {
      details.push({ user_id: settings.user_id, status: 'skip:not_time' });
      continue;
    }

    const [transactionsRes, cashRes, portfolioSettingsRes] = await Promise.all([
      supabaseServer
        .from('transactions')
        .select('*')
        .eq('user_id', settings.user_id)
        .order('trade_date', { ascending: true }),
      supabaseServer
        .from('cash_transactions')
        .select('*')
        .eq('user_id', settings.user_id)
        .order('transaction_date', { ascending: true }),
      supabaseServer
        .from('portfolio_settings')
        .select('*')
        .eq('user_id', settings.user_id)
        .maybeSingle(),
    ]);

    const transactions = (transactionsRes.data || []) as Transaction[];
    const cashTransactions = (cashRes.data || []) as CashTransaction[];
    const portfolioSettings = (portfolioSettingsRes.data || null) as PortfolioSettings | null;

    if (!transactions.length) {
      details.push({ user_id: settings.user_id, status: 'skip:no_transactions' });
      continue;
    }

    try {
      const symbols = [...new Set(transactions.map((h) => h.symbol.toUpperCase()))];
      const { prices, debug } = await loadPrices(symbols);
      const { debug: vnDebug } = await loadPrices(['VNINDEX']);
      const vnIndex = vnDebug?.[0] || null;

      const { data: userData } = await supabaseServer.auth.admin.getUserById(settings.user_id);
      const email = userData.user?.email || 'user@lcta.local';

      const text = buildDailyMessage(
        email,
        transactions,
        cashTransactions,
        portfolioSettings,
        prices,
        debug,
        vnIndex
      );
      await sendTelegramMessage(settings.chat_id, text);

      await supabaseServer
        .from('telegram_settings')
        .update({ last_daily_sent_at: now.toISOString() })
        .eq('user_id', settings.user_id);

      await supabaseServer.from('alert_logs').insert({
        user_id: settings.user_id,
        alert_type: 'daily',
        message: text,
      });

      sent += 1;
      details.push({ user_id: settings.user_id, status: 'sent' });
    } catch (error) {
      details.push({
        user_id: settings.user_id,
        status: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    sent,
    details,
    ran_at: now.toISOString(),
  });
}
