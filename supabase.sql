create extension if not exists pgcrypto;

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  buy_price numeric(18,2) not null check (buy_price > 0),
  quantity numeric(18,2) not null check (quantity > 0),
  buy_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_holdings_user_id on public.holdings(user_id);
create index if not exists idx_holdings_symbol on public.holdings(symbol);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_holdings_updated_at on public.holdings;
create trigger trg_holdings_updated_at
before update on public.holdings
for each row
execute function public.set_updated_at();

alter table public.holdings enable row level security;

drop policy if exists "Users can view own holdings" on public.holdings;
drop policy if exists "Users can insert own holdings" on public.holdings;
drop policy if exists "Users can update own holdings" on public.holdings;
drop policy if exists "Users can delete own holdings" on public.holdings;

create policy "Users can view own holdings"
on public.holdings
for select
using (auth.uid() = user_id);

create policy "Users can insert own holdings"
on public.holdings
for insert
with check (auth.uid() = user_id);

create policy "Users can update own holdings"
on public.holdings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own holdings"
on public.holdings
for delete
using (auth.uid() = user_id);
