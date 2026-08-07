-- 骑手订单排行榜:口径改用 **T+1 确认报表**(riderDailyKpis),不再用实时抓取快照。
--
-- ── 为什么换(2026-08-07 实测,不是偏好问题)
-- 同一天(08-06)同一批骑手,两个数据源对比:
--     骑手      T+1 确认   快照 MAX
--     …6017        23         9
--     …1866        22         9
--     …1041        20         7
--     …0639        19        10
--     …3964        19        10
-- 快照只有真实值的 ~40%,**而且比例不一致** —— …0639 以快照 10 排在 …6017 的 9
-- 前面,但真实是 19 vs 23,名次是反的。
-- 也就是说 rider_status_snapshots.finished_cnt **不是当日累计完单**
-- (原设计的假设错了)。用它做榜单,不只是数字偏小,**排名本身就是错的**。
--
-- ── 换成 T+1 之后顺带解决的
--   1. PRO 能上榜。快照 source 至今全是 main,PRO 池的人根本不出现;
--      T+1 导入有 pro 账号通道(RiderDailyKpi.account)。
--   2. 口径和结算、周考核完全一致 —— 骑手拿榜单来问工资时,查到的是同一份数。
--   3. 开销从"一周 7 万行快照 / 875ms / 540MB"降到"一周约 1000 行"(每人每天一行),
--      走已有的 idx_asr_collection_date 索引,不需要新索引,也不再需要日聚合表。
--
-- ── 代价:没有"今天"的榜
-- 日榜变成**昨日榜**(取窗口内最新有数据的一天)。这不是损失 ——
-- 既然实时数字本身是错的,给一个错的"今天"比给一个对的"昨天"更糟。
--
-- ── 幂等
-- 同一天同一人可能有 main 和 pro 两行(id 前缀不同),按人 SUM 而不是取一行。

CREATE OR REPLACE FUNCTION rider_order_ranking(p_from date, p_to date)
RETURNS TABLE (
  rider_ext_id text,
  rider_name   text,
  day_orders   int,
  week_orders  int,
  ref_day      date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      r.data->>'rider99Id'                           AS rid,
      r.data->>'riderName'                           AS rname,
      (r.data->>'date')::date                        AS dia,
      COALESCE((r.data->>'completedOrders')::int, 0) AS pedidos
    FROM app_state_records r
    WHERE r.collection = 'riderDailyKpis'
      AND r.data->>'date' BETWEEN p_from::text AND p_to::text
      AND COALESCE(r.data->>'rider99Id', '') <> ''
  ),
  -- 「日榜」的那一天 = 窗口内**最新有数据**的一天。
  -- 不写死"昨天":导入晚一天时,榜该显示前天,而不是空榜。
  ref AS (SELECT MAX(dia) AS d FROM scoped)
  SELECT
    s.rid,
    -- 名字取该人最后一天报表里的写法(改名以最新为准)。
    (ARRAY_AGG(s.rname ORDER BY s.dia DESC))[1],
    COALESCE(SUM(s.pedidos) FILTER (WHERE s.dia = (SELECT d FROM ref)), 0)::int,
    COALESCE(SUM(s.pedidos), 0)::int,
    (SELECT d FROM ref)
  FROM scoped s
  GROUP BY s.rid
  HAVING COALESCE(SUM(s.pedidos), 0) > 0;
$$;

REVOKE ALL ON FUNCTION rider_order_ranking(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rider_order_ranking(date, date) TO service_role;
