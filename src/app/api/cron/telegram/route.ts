import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import {
  buildDailyMessage,
  buildThresholdAlert,
  pickThresholdHit,
  sendTelegramMessage,
  shouldSendDaily,
  TelegramSettingRow,
} from '@/lib/telegram';
import type { Holding } from '@/lib/calculations';

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
    prices: payload?.prices || {},
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
    .eq('is_enabled', true);

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  let processed = 0;
  let sent = 0;
  const details: Array<{ user_id: string; kind?: string; status: string }> = [];

  for (const settings of (settingsRows || []) as TelegramSettingRow[]) {
    processed += 1;

    const { data: holdingsRows } = await supabaseServer
      .from('holdings')
      .select('*')
      .eq('user_id', settings.user_id)
      .order('symbol', { ascending: true });

    const holdings = (holdingsRows || []) as Holding[];
    if (!holdings.length) {
      details.push({ user_id: settings.user_id, status: 'skip:no_holdings' });
      continue;
    }

    const symbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
    const { prices, debug } = await loadPrices(symbols);
    const { data: userData } = await supabaseServer.auth.admin.getUserById(settings.user_id);
    const email = userData.user?.email || 'user@lcta.local';

    try {
      if (settings.notify_daily && shouldSendDaily(settings.last_daily_sent_at, now, settings.daily_hour_utc)) {
        const { debug: vnDebug } = await loadPrices(['VNINDEX']);
        const vnIndex = vnDebug?.[0] || null;
        const text = buildDailyMessage(email, holdings, prices, debug, vnIndex);
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
        details.push({ user_id: settings.user_id, kind: 'daily', status: 'sent' });
        continue;
      }

      if (settings.notify_threshold) {
        const hit = pickThresholdHit(holdings, debug, Number(settings.threshold_pct || 3));
        if (hit) {
          const alertKey = `${hit.holding.symbol}:${Math.round(hit.quote.pct * 100)}`;
          const recentlySent =
            settings.last_alert_key === alertKey &&
            settings.last_alert_sent_at &&
            now.getTime() - new Date(settings.last_alert_sent_at).getTime() < 60 * 60 * 1000;

          if (!recentlySent) {
            const text = buildThresholdAlert(email, hit.quote, hit.holding, prices);
            await sendTelegramMessage(settings.chat_id, text);

            await supabaseServer
              .from('telegram_settings')
              .update({
                last_alert_key: alertKey,
                last_alert_sent_at: now.toISOString(),
              })
              .eq('user_id', settings.user_id);

            await supabaseServer.from('alert_logs').insert({
              user_id: settings.user_id,
              alert_type: 'threshold',
              alert_key: alertKey,
              message: text,
            });

            sent += 1;
            details.push({ user_id: settings.user_id, kind: 'threshold', status: 'sent' });
            continue;
          }
        }
      }

      details.push({ user_id: settings.user_id, status: 'skip:no_alert' });
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
