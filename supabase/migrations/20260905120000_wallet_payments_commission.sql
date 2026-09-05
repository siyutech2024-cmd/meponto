-- 2026-09-05 · 加盟商佣金(总部 → 加盟商,按周)
--
-- wallet_payments 是 riderWithdrawals/walletPayments JSONB 集合的 W3 镜像表。
-- 佣金付款与结算付款共用这张表(同为"总部付给加盟商的一笔钱",append-only),用
-- kind 区分;commission 列保存当周计算依据快照(比例、行程收入、应付骑手、KPI 明细),
-- 付过之后即冻结,KPI 重导入/规则调整都不会改已付周的数字。
-- 既有行 kind 默认 'settlement',语义不变。幂等,可重复执行。
ALTER TABLE wallet_payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'settlement',
  ADD COLUMN IF NOT EXISTS commission jsonb,
  -- 2026-09-06 · 骑手付款按 99ID 归集(姓名会重名);历史行为空,读取时回退姓名。
  ADD COLUMN IF NOT EXISTS rider99_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallet_payments_kind_check'
  ) THEN
    ALTER TABLE wallet_payments
      ADD CONSTRAINT wallet_payments_kind_check CHECK (kind IN ('settlement', 'commission'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wp_commission_week
  ON wallet_payments (ref_name, week_from, week_to)
  WHERE kind = 'commission';
