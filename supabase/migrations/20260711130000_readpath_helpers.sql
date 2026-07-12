-- Read-path L2 helpers: small in-database aggregates for the hot pages
-- (/api/performance, /api/wallet, /api/rider/home) so they stop downloading
-- entire KPI/earnings collections per request.
-- See docs/overview-read-path-optimization-plan.md §3 (L2).
-- Service-role only, same policy as overview_stats.

-- All KPI/earnings dates (union, newest first) — the date-picker source.
CREATE OR REPLACE FUNCTION perf_dates()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(d ORDER BY d DESC), '{}')
  FROM (
    SELECT DISTINCT data->>'date' AS d
    FROM app_state_records
    WHERE collection IN ('riderDailyKpis', 'riderDailyEarnings')
      AND data->>'date' IS NOT NULL
  ) t;
$$;

-- Last N days network trend: per-date completed orders + settlement total.
CREATE OR REPLACE FUNCTION perf_trend(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH k AS (
    SELECT data->>'date' AS d,
           sum((data->>'completedOrders')::numeric) AS orders
    FROM app_state_records
    WHERE collection = 'riderDailyKpis'
    GROUP BY 1
  ), e AS (
    SELECT data->>'date' AS d,
           round(sum((data->>'settleAmount')::numeric), 2) AS settle
    FROM app_state_records
    WHERE collection = 'riderDailyEarnings'
    GROUP BY 1
  ), merged AS (
    SELECT coalesce(k.d, e.d) AS date,
           coalesce(k.orders, 0) AS orders,
           coalesce(e.settle, 0) AS settle
    FROM k FULL OUTER JOIN e ON k.d = e.d
    WHERE coalesce(k.d, e.d) IS NOT NULL
    ORDER BY 1 DESC
    LIMIT p_days
  )
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('date', date, 'orders', orders, 'settle', settle)
              ORDER BY date),
    '[]'::jsonb)
  FROM merged;
$$;

-- Lifetime completed-orders leaderboard (rider-app ranking view).
CREATE OR REPLACE FUNCTION kpi_leaderboard(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('name', name, 'orders', orders) ORDER BY orders DESC),
    '[]'::jsonb)
  FROM (
    SELECT data->>'riderName' AS name,
           sum((data->>'completedOrders')::numeric) AS orders
    FROM app_state_records
    WHERE collection = 'riderDailyKpis'
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT p_limit
  ) t;
$$;

-- Per-rider settled totals (computeBalance's heavy half): sum of settleAmount
-- for dates strictly before p_today, grouped by rider — the HQ balances view
-- needs this for EVERY rider and previously downloaded the whole collection.
CREATE OR REPLACE FUNCTION earnings_settled_totals(p_today text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_object('rider99Id', r, 'settled', s)),
    '[]'::jsonb)
  FROM (
    SELECT data->>'rider99Id' AS r,
           sum((data->>'settleAmount')::numeric) AS s
    FROM app_state_records
    WHERE collection = 'riderDailyEarnings' AND data->>'date' < p_today
    GROUP BY 1
  ) t;
$$;

-- Newest date present in a collection (weekly-view anchor).
CREATE OR REPLACE FUNCTION collection_max_date(p_collection text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max(data->>'date') FROM app_state_records WHERE collection = p_collection;
$$;

REVOKE EXECUTE ON FUNCTION perf_dates() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION perf_trend(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION kpi_leaderboard(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION earnings_settled_totals(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION collection_max_date(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION perf_dates() TO service_role;
GRANT EXECUTE ON FUNCTION perf_trend(integer) TO service_role;
GRANT EXECUTE ON FUNCTION kpi_leaderboard(integer) TO service_role;
GRANT EXECUTE ON FUNCTION earnings_settled_totals(text) TO service_role;
GRANT EXECUTE ON FUNCTION collection_max_date(text) TO service_role;
