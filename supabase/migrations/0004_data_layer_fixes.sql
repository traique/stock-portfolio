-- =============================================================
-- supabase/migrations/0004_data_layer_fixes.sql
--
-- Sửa các khoản nợ data layer tìm thấy trong audit:
--   1. DDL chính thức cho price_history (code đã query ở 5+ nơi nhưng
--      trước giờ chỉ tồn tại "trên production", không có DDL trong repo)
--   2. DDL chính thức cho price_cache (price-cache-v2.ts dùng)
--   3. Composite index (user_id, trade_date) cho transactions — query chính
--      luôn eq user_id + order trade_date
--   4. Partial unique index chống giao dịch trùng (double-submit)
--   5. Cash_transactions cho phép loại 'DIVIDEND' (dividends/scan route
--      insert type này — check constraint cũ chỉ có DEPOSIT/WITHDRAW)
--
-- Chạy trong Supabase SQL Editor. Idempotent (IF NOT EXISTS / DROP+CREATE).
-- =============================================================

-- -------------------------------------------------------------
-- 1. price_history — giá EOD history (Edge Function vci-prices mode=eod
--    và ai/price-history.ts upsert onConflict 'symbol,trade_date')
-- -------------------------------------------------------------
create table if not exists public.price_history (
  id         bigint generated always as identity primary key,
  symbol     text not null,
  exchange   text not null default '',
  trade_date date not null,
  open       numeric(18,2),
  high       numeric(18,2),
  low        numeric(18,2),
  close      numeric(18,2),
  volume     numeric(20,0),
  created_at timestamptz not null default now()
);

-- Code upsert với onConflict 'symbol,trade_date' → bắt buộc unique constraint
create unique index if not exists uq_price_history_symbol_date
  on public.price_history(symbol, trade_date);

create index if not exists idx_price_history_date
  on public.price_history(trade_date desc);

alter table public.price_history enable row level security;

drop policy if exists "Anyone can read price_history" on public.price_history;
create policy "Anyone can read price_history"
  on public.price_history for select
  using (true);

-- Ghi chỉ qua service role (cron / Edge Function); không có policy insert/update
-- cho user → RLS chặn mặc định.

-- -------------------------------------------------------------
-- 2. price_cache — cache 2 lớp (price-cache-v2.ts, cache_key PK)
-- -------------------------------------------------------------
create table if not exists public.price_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_price_cache_expires
  on public.price_cache(expires_at);

alter table public.price_cache enable row level security;

-- RLS bật, không policy → deny-all cho client (chỉ service role đọc/ghi).

-- -------------------------------------------------------------
-- 3. Composite index cho query chính của transactions
-- -------------------------------------------------------------
create index if not exists idx_transactions_user_trade
  on public.transactions(user_id, trade_date);

-- -------------------------------------------------------------
-- 4. Chống double-submit giao dịch: 1 user không thể có 2 lệnh giống hệt nhau
--    (symbol + type + giá + lượng + ngày + note). Partial unique với COALESCE
--    để trade_date/note null vẫn được so khớp đúng.
--    Lưu ý: chạy sau khi đã de-dup dữ liệu cũ (nếu có trùng sẽ báo lỗi khi
--    tạo index — khi đó dọn trùng rồi chạy lại).
-- -------------------------------------------------------------
create unique index if not exists uq_transactions_dedup
  on public.transactions(
    user_id,
    symbol,
    transaction_type,
    price,
    quantity,
    coalesce(trade_date, '1900-01-01'),
    coalesce(note, '')
  );

-- -------------------------------------------------------------
-- 5. cash_transactions: cho phép 'DIVIDEND'
--    (route /api/dividends/scan ghi loại này; constraint cũ chỉ DEPOSIT/WITHDRAW)
-- -------------------------------------------------------------
alter table public.cash_transactions drop constraint if exists cash_transactions_type_check;
alter table public.cash_transactions
  add constraint cash_transactions_type_check
  check (transaction_type in ('DEPOSIT', 'WITHDRAW', 'DIVIDEND'));
