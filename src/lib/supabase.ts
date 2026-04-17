import { createClient } from '@supabase/supabase-js';
import { envPublic } from '@/lib/env-public';

export const supabase = createClient(
  envPublic.NEXT_PUBLIC_SUPABASE_URL,
  envPublic.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
