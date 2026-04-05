import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildDailyMessage, QuoteDebugItem, sendTelegramMessage } from '@/lib/telegram';
import type {
  CashTransaction,
  PortfolioSettings,
  PriceMap,
  Transaction,
} from '@/lib/calculations';

function getUserClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

async function loadPrices(symbols: string[]) {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;

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

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getUserClient(token);
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [{ data: settings }, transactionsRes, cashRes, portfolioSettingsRes] = await Promise.all([
    supabase.from('telegram_settings').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('transactions').select('*').order('trade_date', { ascending: true }),
    supabase.from('cash_transactions').select('*').order('transaction_date', { ascending: true }),
    supabase.from('portfolio_settings').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  if (!settings?.chat_id) {
    return NextResponse.json({ error: 'Chưa cấu hình Telegram' }, { status: 400 });
  }

  if (transactionsRes.error) {
    return NextResponse.json({ error: transactionsRes.error.message }, { status: 500 });
  }

  const transactions = (transactionsRes.data || []) as Transaction[];
  const cashTransactions = (cashRes.data || []) as CashTransaction[];
  const portfolioSettings = (portfolioSettingsRes.data || null) as PortfolioSettings | null;

  if (!transactions.length) {
    return NextResponse.json({ error: 'Chưa có giao dịch trong danh mục' }, { status: 400 });
  }

  const symbols = [...new Set(transactions.map((h) => h.symbol.toUpperCase()))];
  const { prices, debug } = await loadPrices(symbols);
  const { debug: vnDebug } = await loadPrices(['VNINDEX']);
  const vnIndex = vnDebug?.[0] || null;

  const text = buildDailyMessage(
    user.email || 'user@lcta.local',
    transactions,
    cashTransactions,
    portfolioSettings,
    prices,
    debug,
    vnIndex
  );

  await sendTelegramMessage(settings.chat_id, text);

  return NextResponse.json({
    ok: true,
    sent: true,
    preview: text,
  });
}
