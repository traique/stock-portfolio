create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  transaction_type text not null check (transaction_type in ('BUY', 'SELL')),
  price numeric(18,2) not null check (price > 0),
  quantity numeric(18,2) not null check (quantity > 0),
  trade_date date,
  note text,
  avg_cost numeric(18,2),
  realized_pnl numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('DEPOSIT', 'WITHDRAW')),
  amount numeric(18,2) not null check (amount > 0),
  transaction_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_id on public.transactions(user_id);
create index if not exists idx_transactions_symbol on public.transactions(symbol);
create index if not exists idx_transactions_trade_date on public.transactions(trade_date desc);
create index if not exists idx_cash_transactions_user_id on public.cash_transactions(user_id);
create index if not exists idx_cash_transactions_date on public.cash_transactions(transaction_date desc);

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
before update on public.transactions
for each row
execute function public.set_updated_at();

drop trigger if exists trg_cash_transactions_updated_at on public.cash_transactions;
create trigger trg_cash_transactions_updated_at
before update on public.cash_transactions
for each row
execute function public.set_updated_at();

alter table public.transactions enable row level security;
alter table public.cash_transactions enable row level security;

drop policy if exists "Users can view own transactions" on public.transactions;
drop policy if exists "Users can insert own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;
drop policy if exists "Users can view own cash transactions" on public.cash_transactions;
drop policy if exists "Users can insert own cash transactions" on public.cash_transactions;
drop policy if exists "Users can update own cash transactions" on public.cash_transactions;
drop policy if exists "Users can delete own cash transactions" on public.cash_transactions;

create policy "Users can view own transactions"
on public.transactions
for select
using (auth.uid() = user_id);

create policy "Users can insert own transactions"
on public.transactions
for insert
with check (auth.uid() = user_id);

create policy "Users can update own transactions"
on public.transactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own transactions"
on public.transactions
for delete
using (auth.uid() = user_id);

create policy "Users can view own cash transactions"
on public.cash_transactions
for select
using (auth.uid() = user_id);

create policy "Users can insert own cash transactions"
on public.cash_transactions
for insert
with check (auth.uid() = user_id);

create policy "Users can update own cash transactions"
on public.cash_transactions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own cash transactions"
on public.cash_transactions
for delete
using (auth.uid() = user_id);

insert into public.transactions (
  user_id,
  symbol,
  transaction_type,
  price,
  quantity,
  trade_date,
  note,
  created_at,
  updated_at
)
select
  h.user_id,
  upper(trim(h.symbol)),
  'BUY',
  h.buy_price,
  h.quantity,
  h.buy_date,
  h.note,
  h.created_at,
  h.updated_at
from public.holdings h
where not exists (
  select 1
  from public.transactions t
  where t.user_id = h.user_id
    and t.transaction_type = 'BUY'
    and upper(trim(t.symbol)) = upper(trim(h.symbol))
    and t.price = h.buy_price
    and t.quantity = h.quantity
    and coalesce(t.trade_date, date '1900-01-01') = coalesce(h.buy_date, date '1900-01-01')
    and coalesce(t.note, '') = coalesce(h.note, '')
);
