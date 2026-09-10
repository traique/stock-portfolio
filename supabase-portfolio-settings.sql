create table if not exists public.portfolio_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cash_adjustment numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portfolio_settings_user_id
on public.portfolio_settings(user_id);

drop trigger if exists trg_portfolio_settings_updated_at on public.portfolio_settings;
create trigger trg_portfolio_settings_updated_at
before update on public.portfolio_settings
for each row
execute function public.set_updated_at();

alter table public.portfolio_settings enable row level security;

drop policy if exists "Users can view own portfolio settings" on public.portfolio_settings;
drop policy if exists "Users can insert own portfolio settings" on public.portfolio_settings;
drop policy if exists "Users can update own portfolio settings" on public.portfolio_settings;
drop policy if exists "Users can delete own portfolio settings" on public.portfolio_settings;

create policy "Users can view own portfolio settings"
on public.portfolio_settings
for select
using (auth.uid() = user_id);

create policy "Users can insert own portfolio settings"
on public.portfolio_settings
for insert
with check (auth.uid() = user_id);

create policy "Users can update own portfolio settings"
on public.portfolio_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own portfolio settings"
on public.portfolio_settings
for delete
using (auth.uid() = user_id);
