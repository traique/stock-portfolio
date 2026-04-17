import { createClient } from '@supabase/supabase-js';
import { envServer } from '@/lib/env-server';

export const supabaseServer = createClient(
  envServer.NEXT_PUBLIC_SUPABASE_URL,
  envServer.SUPABASE_SERVER_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);
