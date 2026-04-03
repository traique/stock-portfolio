create table if not exists public.telegram_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  chat_id text not null,
  is_enabled boolean not null default false,
  notify_daily boolean not null default true,
  notify_threshold boolean not null default true,
  threshold_pct numeric(8,2) not null default 3,
  daily_hour_utc smallint not null default 9 check (daily_hour_utc between 0 and 23),
  last_daily_sent_at timestamptz,
  last_alert_key text,
  last_alert_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null,
  alert_key text,
  message text not null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_telegram_settings_user_id on public.telegram_settings(user_id);
create index if not exists idx_alert_logs_user_id on public.alert_logs(user_id);
create index if not exists idx_alert_logs_sent_at on public.alert_logs(sent_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_telegram_settings_updated_at on public.telegram_settings;
create trigger trg_telegram_settings_updated_at
before update on public.telegram_settings
for each row
execute function public.set_updated_at();

alter table public.telegram_settings enable row level security;
alter table public.alert_logs enable row level security;

drop policy if exists "Users can view own telegram settings" on public.telegram_settings;
drop policy if exists "Users can insert own telegram settings" on public.telegram_settings;
drop policy if exists "Users can update own telegram settings" on public.telegram_settings;
drop policy if exists "Users can delete own telegram settings" on public.telegram_settings;
drop policy if exists "Users can view own alert logs" on public.alert_logs;

create policy "Users can view own telegram settings"
on public.telegram_settings
for select
using (auth.uid() = user_id);

create policy "Users can insert own telegram settings"
on public.telegram_settings
for insert
with check (auth.uid() = user_id);

create policy "Users can update own telegram settings"
on public.telegram_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own telegram settings"
on public.telegram_settings
for delete
using (auth.uid() = user_id);

create policy "Users can view own alert logs"
on public.alert_logs
for select
using (auth.uid() = user_id);
