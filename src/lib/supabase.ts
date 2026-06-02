// Re-export từ supabase-browser để toàn bộ codebase dùng cookie-based session
// Cookie-based session cho phép middleware đọc được → auth guard hoạt động đúng
export { supabaseBrowser as supabase, createSupabaseBrowserClient } from '@/lib/supabase-browser';
