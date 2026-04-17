import { createClient } from '@supabase/supabase-js';
import { envPublic } from '@/lib/env-public';

export function getSupabaseUserClient(accessToken: string) {
  return createClient(envPublic.NEXT_PUBLIC_SUPABASE_URL, envPublic.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
