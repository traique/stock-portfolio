import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getBearerToken,
  validationErrorResponse,
} from '@/lib/server/api-utils';
import { getSupabaseUserClient } from '@/lib/server/supabase-user';

const telegramSettingsBodySchema = z.object({
  chat_id: z.string().trim().min(1, 'Thiếu chat_id'),
  is_enabled: z.coerce.boolean().optional().default(false),
  notify_daily: z.coerce.boolean().optional().default(true),
  notify_threshold: z.coerce.boolean().optional().default(true),
  threshold_pct: z.coerce.number().min(0).max(100).optional().default(3),
  daily_hour_utc: z.coerce.number().int().min(0).max(23).optional().default(9),
});

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseUserClient(token);
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('telegram_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseUserClient(token);
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody = await request.json();
  const parsed = telegramSettingsBodySchema.safeParse(rawBody);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const payload = {
    user_id: user.id,
    ...parsed.data,
  };

  const { data, error } = await supabase
    .from('telegram_settings')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
    }
