-- 快照表把 接单/拒单/取消/超时 四个计数抽成真列 + 历史回填。
--
-- ── 目的:当日累计口径要准("计数器不清零"方案)
-- Eastwind 的计数器**每个班段清零**,且骑手级数值藏在 raw JSON 里(抓取器
-- 逐个点卡片拿到的 riderFeature)。原实现只用"班段最后一批"的 raw ——
-- 那一批如果恰好没点到这个骑手,整个班段的计数就丢了,合计偏低。
--
-- 正确口径:计数在班段内单调递增 → **班段内取 MAX**(任何一批抓到都算数,
-- 最多损失批与班段结束之间的几分钟),**跨班段相加** = 当日累计。
-- 这一步要在 SQL 里做,所以字段必须是列,不能是 raw 里的 JSON。
--
-- ── 内容
--   1. 四个可空 int 列(null = 这批没抓到,和 0 含义不同,别 DEFAULT 0)
--   2. 历史回填:候选键与 app/lib/eastwind.ts 的 KP 列表一致,
--      raw 顶层和 raw.riderFeature 各查一遍(pick() 也是查这两层)
--   3. 局部索引帮"按天扫描"的查询

ALTER TABLE rider_status_snapshots ADD COLUMN IF NOT EXISTS accept_cnt    integer;
ALTER TABLE rider_status_snapshots ADD COLUMN IF NOT EXISTS declined_cnt  integer;
ALTER TABLE rider_status_snapshots ADD COLUMN IF NOT EXISTS cancelled_cnt integer;
ALTER TABLE rider_status_snapshots ADD COLUMN IF NOT EXISTS delayed_cnt   integer;

-- 回填辅助:按候选键序取第一个能转成数字的值,顶层优先、riderFeature 兜底。
CREATE OR REPLACE FUNCTION _snap_pick_int(p_raw jsonb, p_keys text[])
RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT (
    SELECT v FROM (
      SELECT COALESCE(p_raw->>k, p_raw->'riderFeature'->>k) AS v
      FROM unnest(p_keys) AS k
    ) t
    WHERE v ~ '^-?\d+(\.\d+)?$'
    LIMIT 1
  )::numeric::integer;
$$;

UPDATE rider_status_snapshots SET
  accept_cnt    = _snap_pick_int(raw::jsonb, ARRAY['acceptOrderCnt','acceptCnt','acceptNum','acceptedOrders','orderAccepted']),
  declined_cnt  = _snap_pick_int(raw::jsonb, ARRAY['declineOrderCnt','declinedOrderCnt','refuseOrderCnt','rejectOrderCnt','declineCnt','refuseCnt']),
  cancelled_cnt = _snap_pick_int(raw::jsonb, ARRAY['cancelOrderCnt','cancelledOrderCnt','cancelCnt','cancelNum']),
  delayed_cnt   = _snap_pick_int(raw::jsonb, ARRAY['delayOrderCnt','delayedOrderCnt','timeoutOrderCnt','overtimeOrderCnt','delayCnt'])
WHERE raw IS NOT NULL AND accept_cnt IS NULL AND declined_cnt IS NULL AND cancelled_cnt IS NULL AND delayed_cnt IS NULL;

DROP FUNCTION _snap_pick_int(jsonb, text[]);
