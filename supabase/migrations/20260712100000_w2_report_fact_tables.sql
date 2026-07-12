-- M1 / Wave 2 (docs/data-core-cure-plan.md §3): the two T+1 report fact
-- collections move from the JSONB mirror into real typed tables. Append-only
-- import data — lowest-risk wave, biggest read win.
--
-- Rollout: CORE_MODE_PERF env flag (off → dualwrite → read). This migration
-- is S1+S4: tables, indexes, in-database backfill, and table-backed versions
-- of the L2 aggregate functions (suffix _t; app picks by mode).

-- ============ t1_rider_daily_kpis ============
CREATE TABLE IF NOT EXISTS t1_rider_daily_kpis (
  id                    text PRIMARY KEY,          -- kpi-<date>-<rider99Id>
  date                  text NOT NULL,             -- YYYY-MM-DD (legacy shape)
  rider99_id            text NOT NULL,
  rider_name            text NOT NULL DEFAULT '',
  phone                 text NOT NULL DEFAULT '',
  cpf                   text NOT NULL DEFAULT '',
  city                  text NOT NULL DEFAULT '',
  online_hours          numeric NOT NULL DEFAULT 0,
  completed_orders      integer NOT NULL DEFAULT 0 CHECK (completed_orders >= 0),
  signed_shifts         integer NOT NULL DEFAULT 0,
  signed_shift_hours    numeric NOT NULL DEFAULT 0,
  in_shift_online_hours numeric NOT NULL DEFAULT 0,
  tsh                   numeric,
  tsh_critical          numeric,
  ar                    numeric,
  caa                   numeric,
  overtime              numeric,
  imported_at           text NOT NULL DEFAULT '',
  UNIQUE (rider99_id, date)
);
CREATE INDEX IF NOT EXISTS idx_rdk_date  ON t1_rider_daily_kpis (date);
CREATE INDEX IF NOT EXISTS idx_rdk_rider ON t1_rider_daily_kpis (rider99_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_rdk_name  ON t1_rider_daily_kpis (rider_name);
ALTER TABLE t1_rider_daily_kpis ENABLE ROW LEVEL SECURITY; -- service-role only

-- ============ t1_rider_daily_earnings ============
CREATE TABLE IF NOT EXISTS t1_rider_daily_earnings (
  id             text PRIMARY KEY,                 -- earn-<date>-<rider99Id>
  date           text NOT NULL,
  rider99_id     text NOT NULL,
  rider_name     text NOT NULL DEFAULT '',
  phone          text NOT NULL DEFAULT '',
  cpf            text NOT NULL DEFAULT '',
  city           text NOT NULL DEFAULT '',
  total          numeric NOT NULL DEFAULT 0,
  trip_income    numeric NOT NULL DEFAULT 0,
  cash_debt      numeric NOT NULL DEFAULT 0,
  meal_deduction numeric NOT NULL DEFAULT 0,
  bonus          numeric NOT NULL DEFAULT 0,
  other          numeric NOT NULL DEFAULT 0,
  tips           numeric NOT NULL DEFAULT 0,
  manual_adjust  numeric NOT NULL DEFAULT 0,
  referral_bonus numeric NOT NULL DEFAULT 0,
  pix            text NOT NULL DEFAULT '',
  orders         integer NOT NULL DEFAULT 0 CHECK (orders >= 0),
  settle_amount  numeric NOT NULL DEFAULT 0,
  imported_at    text NOT NULL DEFAULT '',
  UNIQUE (rider99_id, date)
);
CREATE INDEX IF NOT EXISTS idx_rde_date  ON t1_rider_daily_earnings (date);
CREATE INDEX IF NOT EXISTS idx_rde_rider ON t1_rider_daily_earnings (rider99_id, date DESC);
ALTER TABLE t1_rider_daily_earnings ENABLE ROW LEVEL SECURITY;

-- ============ S4 backfill: JSONB mirror → fact tables (in-database) ============
INSERT INTO t1_rider_daily_kpis (id, date, rider99_id, rider_name, phone, cpf, city,
  online_hours, completed_orders, signed_shifts, signed_shift_hours,
  in_shift_online_hours, tsh, tsh_critical, ar, caa, overtime, imported_at)
SELECT
  data->>'id', data->>'date', data->>'rider99Id',
  coalesce(data->>'riderName', ''), coalesce(data->>'phone', ''),
  coalesce(data->>'cpf', ''), coalesce(data->>'city', ''),
  coalesce((data->>'onlineHours')::numeric, 0),
  coalesce((data->>'completedOrders')::numeric, 0)::integer,
  coalesce((data->>'signedShifts')::numeric, 0)::integer,
  coalesce((data->>'signedShiftHours')::numeric, 0),
  coalesce((data->>'inShiftOnlineHours')::numeric, 0),
  (data->>'tsh')::numeric, (data->>'tshCritical')::numeric,
  (data->>'ar')::numeric, (data->>'caa')::numeric, (data->>'overtime')::numeric,
  coalesce(data->>'importedAt', '')
FROM app_state_records
WHERE collection = 'riderDailyKpis'
  AND data->>'id' IS NOT NULL AND data->>'date' IS NOT NULL AND data->>'rider99Id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO t1_rider_daily_earnings (id, date, rider99_id, rider_name, phone, cpf, city,
  total, trip_income, cash_debt, meal_deduction, bonus, other, tips,
  manual_adjust, referral_bonus, pix, orders, settle_amount, imported_at)
SELECT
  data->>'id', data->>'date', data->>'rider99Id',
  coalesce(data->>'riderName', ''), coalesce(data->>'phone', ''),
  coalesce(data->>'cpf', ''), coalesce(data->>'city', ''),
  coalesce((data->>'total')::numeric, 0), coalesce((data->>'tripIncome')::numeric, 0),
  coalesce((data->>'cashDebt')::numeric, 0), coalesce((data->>'mealDeduction')::numeric, 0),
  coalesce((data->>'bonus')::numeric, 0), coalesce((data->>'other')::numeric, 0),
  coalesce((data->>'tips')::numeric, 0), coalesce((data->>'manualAdjust')::numeric, 0),
  coalesce((data->>'referralBonus')::numeric, 0), coalesce(data->>'pix', ''),
  coalesce((data->>'orders')::numeric, 0)::integer,
  coalesce((data->>'settleAmount')::numeric, 0),
  coalesce(data->>'importedAt', '')
FROM app_state_records
WHERE collection = 'riderDailyEarnings'
  AND data->>'id' IS NOT NULL AND data->>'date' IS NOT NULL AND data->>'rider99Id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============ Table-backed aggregates (app picks _t versions in read mode) ============
CREATE OR REPLACE FUNCTION perf_dates_t()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(d ORDER BY d DESC), '{}')
  FROM (
    SELECT date AS d FROM t1_rider_daily_kpis
    UNION
    SELECT date FROM t1_rider_daily_earnings
  ) t;
$$;

CREATE OR REPLACE FUNCTION perf_trend_t(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH k AS (SELECT date AS d, sum(completed_orders) AS orders FROM t1_rider_daily_kpis GROUP BY 1),
       e AS (SELECT date AS d, round(sum(settle_amount), 2) AS settle FROM t1_rider_daily_earnings GROUP BY 1),
       merged AS (
         SELECT coalesce(k.d, e.d) AS date, coalesce(k.orders, 0) AS orders, coalesce(e.settle, 0) AS settle
         FROM k FULL OUTER JOIN e ON k.d = e.d
         ORDER BY 1 DESC LIMIT p_days
       )
  SELECT coalesce(jsonb_agg(jsonb_build_object('date', date, 'orders', orders, 'settle', settle) ORDER BY date), '[]'::jsonb)
  FROM merged;
$$;

CREATE OR REPLACE FUNCTION kpi_leaderboard_t(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', name, 'orders', orders) ORDER BY orders DESC), '[]'::jsonb)
  FROM (
    SELECT rider_name AS name, sum(completed_orders) AS orders
    FROM t1_rider_daily_kpis GROUP BY 1 ORDER BY 2 DESC LIMIT p_limit
  ) t;
$$;

CREATE OR REPLACE FUNCTION earnings_settled_totals_t(p_today text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('rider99Id', r, 'settled', s)), '[]'::jsonb)
  FROM (
    SELECT rider99_id AS r, sum(settle_amount) AS s
    FROM t1_rider_daily_earnings WHERE date < p_today GROUP BY 1
  ) t;
$$;

CREATE OR REPLACE FUNCTION earnings_max_date_t()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT max(date) FROM t1_rider_daily_earnings;
$$;

REVOKE EXECUTE ON FUNCTION perf_dates_t() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION perf_trend_t(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION kpi_leaderboard_t(integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION earnings_settled_totals_t(text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION earnings_max_date_t() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION perf_dates_t() TO service_role;
GRANT EXECUTE ON FUNCTION perf_trend_t(integer) TO service_role;
GRANT EXECUTE ON FUNCTION kpi_leaderboard_t(integer) TO service_role;
GRANT EXECUTE ON FUNCTION earnings_settled_totals_t(text) TO service_role;
GRANT EXECUTE ON FUNCTION earnings_max_date_t() TO service_role;
