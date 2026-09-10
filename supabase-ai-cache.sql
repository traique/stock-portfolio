-- Migration: ai_cache table
-- Tối ưu cho Supabase Free (500MB DB, ~50k rows)
-- Chạy trong Supabase SQL editor

create table if not exists public.ai_cache (
  key        text        primary key,
  value      jsonb       not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Index để cleanup và query nhanh
create index if not exists ai_cache_expires_at_idx on public.ai_cache (expires_at);

-- RLS: chỉ service role
alter table public.ai_cache enable row level security;

-- Cleanup function
create or replace function public.cleanup_ai_cache()
returns integer
language plpgsql
security definer
as $$
declare deleted_count integer;
begin
  delete from public.ai_cache where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- pg_cron: cleanup tự động mỗi 6 giờ (Supabase Free có pg_cron)
-- Bỏ comment dòng dưới nếu project Supabase đã enable pg_cron extension
-- select cron.schedule('cleanup-ai-cache', '0 */6 * * *', 'select public.cleanup_ai_cache()');

-- Kiểm tra số rows hiện tại sau khi tạo bảng
-- select count(*) from public.ai_cache;
