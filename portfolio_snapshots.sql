-- =========================================================
-- portfolio_snapshots
-- Lưu snapshot tài sản hàng ngày lúc 15h10 VN (8h10 UTC)
-- Chạy file này trong Supabase SQL Editor
-- =========================================================

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date   date        NOT NULL,                    -- Ngày ghi (YYYY-MM-DD, giờ VN)
  total_assets    bigint      NOT NULL DEFAULT 0,          -- Tổng tài sản (VNĐ)
  market_value    bigint      NOT NULL DEFAULT 0,          -- Giá trị cổ phiếu đang nắm
  nav_cash        bigint      NOT NULL DEFAULT 0,          -- Tiền mặt thực tế
  net_capital     bigint      NOT NULL DEFAULT 0,          -- Tổng vốn (nạp - rút)
  total_pnl       bigint      NOT NULL DEFAULT 0,          -- Lãi/Lỗ tuyệt đối
  total_pnl_pct   numeric(8,4) NOT NULL DEFAULT 0,         -- Lãi/Lỗ % (vd: 12.3456)
  position_count  smallint    NOT NULL DEFAULT 0,          -- Số mã đang nắm
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  -- Mỗi user chỉ có 1 snapshot / ngày, upsert an toàn
  CONSTRAINT portfolio_snapshots_user_date_unique UNIQUE (user_id, snapshot_date)
);

-- Index để query nhanh theo user + date range
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date
  ON portfolio_snapshots (user_id, snapshot_date DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_portfolio_snapshots_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portfolio_snapshots_updated_at ON portfolio_snapshots;
CREATE TRIGGER trg_portfolio_snapshots_updated_at
  BEFORE UPDATE ON portfolio_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_portfolio_snapshots_updated_at();

-- Row Level Security — mỗi user chỉ đọc/ghi data của mình
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own snapshots"   ON portfolio_snapshots;
DROP POLICY IF EXISTS "Users can insert own snapshots" ON portfolio_snapshots;
DROP POLICY IF EXISTS "Users can update own snapshots" ON portfolio_snapshots;
DROP POLICY IF EXISTS "Service role full access"       ON portfolio_snapshots;

CREATE POLICY "Users can read own snapshots"
  ON portfolio_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snapshots"
  ON portfolio_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snapshots"
  ON portfolio_snapshots FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role (cron job chạy server-side) được full access
CREATE POLICY "Service role full access"
  ON portfolio_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- =========================================================
-- Xác nhận
-- =========================================================
SELECT 'portfolio_snapshots table created successfully' AS status;
