-- 排行榜日榜改当日实时(业务方 2026-08-10:"按当日数据统计排名,每半小时更新")
--
-- ── 口径
-- 当日完单 = 快照按 (骑手, 班段) 取 MAX(finished_cnt),跨班段相加。
-- 与当日数据页同一算法("计数器不清零"方案):Eastwind 计数器每班段清零、
-- 班段内单调递增,班段 MAX 相加即当日累计,任何一批抓到都算数。
-- 两个源(main/pro)不筛 —— 骑手集不相交,天然并集,PRO 自动上榜。
--
-- ── 为什么可以用快照做日榜(当初弃用的原因已消除)
-- 8/7 弃用快照是因为旧聚合只取"最新一批",班段清零把前面班段整段丢掉,
-- 只剩确认值的 ~40% 且名次会反。班段 MAX 方案修的正是这件事。
-- 周榜仍走 T+1 确认报表(结算同源,权威口径);日榜是当天的激励性视图,
-- 明日 T+1 导入后由确认数接管。
--
-- ── 成本
-- 一天快照 ≈ 3 万行,走 captured_at 索引单次聚合,接口侧 30 分钟缓存,
-- 每天最多 ~48 次执行,可忽略。
CREATE OR REPLACE FUNCTION rider_today_orders()
RETURNS TABLE(rider_ext_id text, rider_name text, day_orders integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH slot_max AS (
    SELECT s.rider_ext_id,
           max(s.rider_name) AS rider_name,
           coalesce(s.shift_start, '') || '-' || coalesce(s.shift_end, '') AS slot,
           max(s.finished_cnt) AS slot_orders
    FROM rider_status_snapshots s
    WHERE s.captured_at >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND s.rider_ext_id IS NOT NULL
    GROUP BY s.rider_ext_id, 3
  )
  SELECT rider_ext_id,
         max(rider_name) AS rider_name,
         sum(coalesce(slot_orders, 0))::int AS day_orders
  FROM slot_max
  GROUP BY rider_ext_id
  HAVING sum(coalesce(slot_orders, 0)) > 0;
$$;

REVOKE EXECUTE ON FUNCTION rider_today_orders() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION rider_today_orders() TO service_role;
