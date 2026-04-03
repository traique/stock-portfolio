import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTelegramMessage } from '@/lib/telegram';

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

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getUserClient(token);
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: settings, error } = await supabase
    .from('telegram_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !settings?.chat_id) {
    return NextResponse.json({ error: 'Chưa cấu hình Telegram' }, { status: 400 });
  }

  await sendTelegramMessage(
    settings.chat_id,
    `✅ <b>LCTA</b>\n\nKết nối Telegram thành công cho <b>${(user.email || '').split('@')[0]}</b>.`
  );

  return NextResponse.json({ ok: true });
}
