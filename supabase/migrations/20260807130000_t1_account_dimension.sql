-- T+1 事实表补 account 维度(main/pro) + 趋势函数输出 PRO 曲线。
--
-- ── 为什么是修 bug,不只是加功能
-- 模式二 T2 里 PRO 日报行的 id 是 kpi-pro-<date>-<rider99Id> —— 同一骑手同一天
-- 会有 main 和 pro **两行**。但 W2 事实表当时定了 UNIQUE (rider99_id, date):
--   1. 第一次导入 PRO 日报,双写到事实表就撞唯一约束,**直接报错**;
--   2. 表里没有 account 列,行搬进来也分不出谁是 PRO,
--      看板的 ?account=pro 过滤在 factRead 模式下永远筛不出东西。
-- 这个雷埋在"PRO 数据下周才有"的时间差里 —— 今天不修,下周一导入就炸。
--
-- ── 改动
--   1. 两张 t1 表加 account 列(默认 'main',存量行语义正确)
--   2. UNIQUE(rider99_id, date) → UNIQUE(rider99_id, date, account)
--   3. perf_trend_t / perf_trend 的每个点位加 proOrders(orders 仍是总数,
--      proOrders 是其中 PRO 的部分 —— 前端画总曲线 + 金色 PRO 曲线)
--   4. 两个趋势函数加 p_rider_ids 参数(可选)。**修一个上线后才发现的口径 bug**:
--      加盟商/站点视角下,顶部卡片按视角过滤,趋势图却一直是全网数据 ——
--      Clayton 登录看到自家 400 单,曲线末点却写着全网 957 单。
--      骑手→加盟商/站点的归属关系存在 riders 档案里(不在事实表),
--      所以由应用侧把"自家骑手的 99ID 数组"传进来过滤,不在库里做 join。

ALTER TABLE t1_rider_daily_kpis     ADD COLUMN IF NOT EXISTS account text NOT NULL DEFAULT 'main';
ALTER TABLE t1_rider_daily_earnings ADD COLUMN IF NOT EXISTS account text NOT NULL DEFAULT 'main';

-- 唯一约束换成带 account 的。约束名是建表时自动生成的默认名。
ALTER TABLE t1_rider_daily_kpis     DROP CONSTRAINT IF EXISTS t1_rider_daily_kpis_rider99_id_date_key;
ALTER TABLE t1_rider_daily_earnings DROP CONSTRAINT IF EXISTS t1_rider_daily_earnings_rider99_id_date_key;
ALTER TABLE t1_rider_daily_kpis     ADD CONSTRAINT t1_rdk_rider_date_account_key UNIQUE (rider99_id, date, account);
ALTER TABLE t1_rider_daily_earnings ADD CONSTRAINT t1_rde_rider_date_account_key UNIQUE (rider99_id, date, account);

-- 已有 PRO 行的话,从 id 前缀回填(幂等;正常情况下此时还没有)。
UPDATE t1_rider_daily_kpis     SET account = 'pro' WHERE id LIKE 'kpi-pro-%'  AND account <> 'pro';
UPDATE t1_rider_daily_earnings SET account = 'pro' WHERE id LIKE 'earn-pro-%' AND account <> 'pro';

-- ── 趋势(事实表版):每点加 proOrders;p_rider_ids 非空时只算这些骑手
-- 旧的单参数版本必须 DROP:同名函数不同签名是**重载**,两个并存时
-- PostgREST 按参数名调用会报 "function is not unique"。
DROP FUNCTION IF EXISTS perf_trend_t(integer);
CREATE OR REPLACE FUNCTION perf_trend_t(p_days integer DEFAULT 30, p_rider_ids text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH k AS (
    SELECT date AS d,
           sum(completed_orders) AS orders,
           sum(completed_orders) FILTER (WHERE account = 'pro') AS pro_orders
    FROM t1_rider_daily_kpis
    WHERE p_rider_ids IS NULL OR rider99_id = ANY(p_rider_ids)
    GROUP BY 1
  ),
  e AS (
    SELECT date AS d, round(sum(settle_amount), 2) AS settle
    FROM t1_rider_daily_earnings
    WHERE p_rider_ids IS NULL OR rider99_id = ANY(p_rider_ids)
    GROUP BY 1
  ),
  merged AS (
    SELECT coalesce(k.d, e.d) AS date,
           coalesce(k.orders, 0) AS orders,
           coalesce(k.pro_orders, 0) AS pro_orders,
           coalesce(e.settle, 0) AS settle
    FROM k FULL OUTER JOIN e ON k.d = e.d
    ORDER BY 1 DESC LIMIT p_days
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'date', date, 'orders', orders, 'proOrders', pro_orders, 'settle', settle
  ) ORDER BY date), '[]'::jsonb)
  FROM merged;
$$;

-- ── 趋势(JSONB 版,factRead 关闭时走这条):同样加 proOrders + p_rider_ids
DROP FUNCTION IF EXISTS perf_trend(integer);
CREATE OR REPLACE FUNCTION perf_trend(p_days integer DEFAULT 30, p_rider_ids text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH k AS (
    SELECT data->>'date' AS d,
           sum(coalesce((data->>'completedOrders')::int, 0)) AS orders,
           sum(coalesce((data->>'completedOrders')::int, 0)) FILTER (WHERE data->>'account' = 'pro') AS pro_orders
    FROM app_state_records
    WHERE collection = 'riderDailyKpis'
      AND (p_rider_ids IS NULL OR data->>'rider99Id' = ANY(p_rider_ids))
    GROUP BY 1
  ),
  e AS (
    SELECT data->>'date' AS d, round(sum(coalesce((data->>'settleAmount')::numeric, 0)), 2) AS settle
    FROM app_state_records
    WHERE collection = 'riderDailyEarnings'
      AND (p_rider_ids IS NULL OR data->>'rider99Id' = ANY(p_rider_ids))
    GROUP BY 1
  ),
  merged AS (
    SELECT coalesce(k.d, e.d) AS date,
           coalesce(k.orders, 0) AS orders,
           coalesce(k.pro_orders, 0) AS pro_orders,
           coalesce(e.settle, 0) AS settle
    FROM k FULL OUTER JOIN e ON k.d = e.d
    WHERE coalesce(k.d, e.d) IS NOT NULL
    ORDER BY 1 DESC LIMIT p_days
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'date', date, 'orders', orders, 'proOrders', pro_orders, 'settle', settle
  ) ORDER BY date), '[]'::jsonb)
  FROM merged;
$$;

REVOKE EXECUTE ON FUNCTION perf_trend_t(integer, text[]) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION perf_trend(integer, text[])   FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION perf_trend_t(integer, text[]) TO service_role;
GRANT  EXECUTE ON FUNCTION perf_trend(integer, text[])   TO service_role;
