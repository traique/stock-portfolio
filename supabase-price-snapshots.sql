-- =============================================================
-- Migration: price_snapshots + cron schedule
-- Chạy trong Supabase SQL Editor (1 lần)
-- =============================================================

-- 1. Bật extensions cần thiết
create extension if not exists pg_cron;
create extension if not exists pg_net;     -- gọi HTTP từ PostgreSQL

-- =============================================================
-- 2. Bảng lưu giá snapshot mới nhất của mỗi mã
-- =============================================================
create table if not exists public.price_snapshots (
  symbol        text primary key,
  price         numeric(18,2) not null default 0,
  ref           numeric(18,2) not null default 0,
  change        numeric(18,4) not null default 0,
  pct           numeric(10,4) not null default 0,
  ceiling       numeric(18,2) not null default 0,
  floor         numeric(18,2) not null default 0,
  high          numeric(18,2) not null default 0,
  low           numeric(18,2) not null default 0,
  volume        numeric(20,0) not null default 0,
  exchange      text not null default '',
  provider      text not null default 'vci-edge',
  fetched_at    timestamptz not null default now()
);

-- Ai cũng đọc được (giá là public, không nhạy cảm)
alter table public.price_snapshots enable row level security;

drop policy if exists "Anyone can read price_snapshots" on public.price_snapshots;
create policy "Anyone can read price_snapshots"
  on public.price_snapshots for select
  using (true);

-- Chỉ service role mới ghi (cron dùng service role)
drop policy if exists "Service role can upsert price_snapshots" on public.price_snapshots;
create policy "Service role can upsert price_snapshots"
  on public.price_snapshots for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists idx_price_snapshots_exchange
  on public.price_snapshots(exchange);

create index if not exists idx_price_snapshots_fetched
  on public.price_snapshots(fetched_at desc);

-- =============================================================
-- 3. Function kiểm tra có trong giờ giao dịch VN không
--    Giờ VN = UTC+7. Thị trường mở:
--      Sáng: 9:00–11:30 (+30 phút buffer → 8:30–12:00 UTC+7)
--      Chiều: 13:00–15:30 (+30 phút buffer → 13:00–16:00 UTC+7)
--    pg_cron chạy theo UTC → trừ 7 tiếng
-- =============================================================
create or replace function public.is_vn_trading_hours()
returns boolean
language plpgsql stable
as $$
declare
  vn_now  timestamptz := now() at time zone 'Asia/Ho_Chi_Minh';
  dow     int  := extract(dow from vn_now);   -- 0=Sun, 1=Mon ... 6=Sat
  minutes int  := extract(hour from vn_now) * 60 + extract(minute from vn_now);
  -- Bắt đầu 30 phút trước ATO (9:00), kết thúc 30 phút sau ATC (15:00/15:30)
  morning_open  int := 9  * 60;       -- 9:00  (mở sớm 30 phút)
  morning_close int := 12 * 60;       -- 12:00 (đóng trễ 30 phút)
  afternoon_open  int := 13 * 60;     -- 13:00 (mở sớm 30 phút)
  afternoon_close int := 16 * 60;     -- 16:00 (đóng trễ 30 phút)
begin
  -- Chỉ thứ 2–6
  if dow not between 1 and 5 then return false; end if;

  return (minutes >= morning_open   and minutes < morning_close)
      or (minutes >= afternoon_open and minutes < afternoon_close);
end;
$$;

-- =============================================================
-- 4. Function fetch giá — gọi Edge Function vci-prices
--    Thay <PROJECT_REF> và <SERVICE_ROLE_KEY> bằng giá trị thật
-- =============================================================
create or replace function public.fetch_vn_prices()
returns void
language plpgsql
security definer
as $$
declare
  edge_url    text := 'https://zctpghophfjubsjfsrdu.supabase.co/functions/v1/vci-prices';
  service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjdHBnaG9waGZqdWJzamZzcmR1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDkzNDg1NSwiZXhwIjoyMDkwNTEwODU1fQ.05_SI6DUNDpRXmoUl5G964cXJ1D_5a-8cCqKuUCt0LM';
  request_id  bigint;
begin
  -- Chỉ chạy trong giờ giao dịch
  if not public.is_vn_trading_hours() then
    raise notice 'Ngoài giờ giao dịch, bỏ qua.';
    return;
  end if;

  -- Gọi Edge Function bất đồng bộ qua pg_net
  -- Edge Function sẽ tự upsert vào price_snapshots
  select net.http_post(
    url     := edge_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{"mode":"cron"}'::jsonb
  ) into request_id;

  raise notice 'fetch_vn_prices: request_id = %', request_id;
end;
$$;

-- =============================================================
-- 5. Đăng ký pg_cron: chạy mỗi 30 phút, hàm tự check giờ
-- =============================================================
select cron.unschedule('fetch-vn-prices-cron') where exists (
  select 1 from cron.job where jobname = 'fetch-vn-prices-cron'
);

select cron.schedule(
  'fetch-vn-prices-cron',
  '*/30 * * * *',              -- mỗi 30 phút, mọi ngày
  'select public.fetch_vn_prices();'  -- hàm tự check giờ/ngày
);

-- Xem lịch đã đăng ký
select jobname, schedule, command, active
from cron.job
where jobname = 'fetch-vn-prices-cron';
