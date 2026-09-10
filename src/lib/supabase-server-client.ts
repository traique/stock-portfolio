import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { envPublic } from '@/lib/env-public';

// Dùng trong Server Components và Route Handlers để đọc session từ cookie
// Không import trong client components — dùng supabase-browser.ts thay thế
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    envPublic.NEXT_PUBLIC_SUPABASE_URL,
    envPublic.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll()          { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll bị ignore trong Server Component read-only contexts — bình thường
          }
        },
      },
    },
  );
}
