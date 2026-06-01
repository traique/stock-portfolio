'use client';

import { createBrowserClient } from '@supabase/ssr';
import { envPublic } from '@/lib/env-public';

// Dùng cho mọi component client-side (thay thế dần src/lib/supabase.ts)
// Cookie-based session → middleware có thể đọc được, không phụ thuộc localStorage
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    envPublic.NEXT_PUBLIC_SUPABASE_URL,
    envPublic.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

// Singleton để dùng như trước: import { supabase } from '@/lib/supabase-browser'
export const supabaseBrowser = createSupabaseBrowserClient();
