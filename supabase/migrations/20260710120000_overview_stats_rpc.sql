-- HQ overview aggregates computed in-database (v2 — single pass per collection).
--
-- Why: /api/overview previously refreshed 12 full collections from
-- app_state_records into memory on every request (no LIMIT, 5s TTL).
-- riderDailyKpis / riderDailyEarnings grow per rider per day, so the full
-- download eventually took minutes and the dashboard hung on "loading".
--
-- v2 over the first draft (per docs/overview-read-path-optimization-plan.md):
--   1. Expression indexes so date/status JSONB filters are range scans,
--      not per-row JSONB parsing over a seq scan.
--   2. FILTER aggregates — each collection is scanned exactly ONCE (the
--      draft re-scanned riderDailyKpis 3+ times via repeated subqueries).
--
-- Service-role only: execution revoked from anon/authenticated/public.

-- Two shared expression indexes serve every date/status-filtered collection.
-- Deliberately no more than these two — each one is write amplification on
-- the hottest table in the system.
CREATE INDEX IF NOT EXISTS idx_asr_collection_date
  ON app_state_records (collection, (data->>'date'));
CREATE INDEX IF NOT EXISTS idx_asr_collection_status
  ON app_state_records (collection, (data->>'status'));

CREATE OR REPLACE FUNCTION overview_stats(p_today text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ld AS MATERIALIZED (
    -- Latest KPI day (max over the date index).
    SELECT max(data->>'date') AS d
    FROM app_state_records
    WHERE collection = 'riderDailyKpis'
  ),
  network AS MATERIALIZED (
    -- One pass across the four counted collections.
    SELECT
      count(*) FILTER (WHERE collection = 'franchises') AS franchises,
      count(*) FILTER (WHERE collection = 'pontos')     AS stations,
      count(*) FILTER (WHERE collection = 'riders')     AS riders,
      count(*) FILTER (WHERE collection = 'appUsers')   AS accounts
    FROM app_state_records
    WHERE collection IN ('franchises', 'pontos', 'riders', 'appUsers')
  ),
  shifts AS MATERIALIZED (
    SELECT
      count(*)                                            AS upcoming,
      coalesce(sum((data->>'plannedCount')::numeric), 0)  AS planned
    FROM app_state_records
    WHERE collection = 'dispatchShifts' AND data->>'date' >= p_today
  ),
  signups AS MATERIALIZED (
    SELECT
      count(*) FILTER (WHERE data->>'status' = 'submitted') AS pending,
      count(*) FILTER (WHERE data->>'status' = 'approved')  AS approved
    FROM app_state_records
    WHERE collection = 'shiftSignups'
  ),
  kpi AS MATERIALIZED (
    -- riders / completedOrders / lowAr in ONE scan of the latest KPI day.
    SELECT
      count(*)                                                AS riders,
      coalesce(sum((data->>'completedOrders')::numeric), 0)   AS completed,
      count(*) FILTER (WHERE data->>'ar' IS NOT NULL
                         AND (data->>'ar')::numeric < 95)     AS low_ar
    FROM app_state_records, ld
    WHERE collection = 'riderDailyKpis' AND data->>'date' = ld.d
  ),
  earn AS MATERIALIZED (
    SELECT round(coalesce(sum((data->>'settleAmount')::numeric), 0), 2) AS settle
    FROM app_state_records, ld
    WHERE collection = 'riderDailyEarnings' AND data->>'date' = ld.d
  ),
  wd AS MATERIALIZED (
    -- pending count/amount + paid total in ONE scan of withdrawals.
    SELECT
      count(*) FILTER (WHERE data->>'status' = 'requested') AS pending_count,
      round(coalesce(sum((data->>'amount')::numeric)
        FILTER (WHERE data->>'status' = 'requested'), 0), 2) AS pending_amount,
      round(coalesce(sum((data->>'amount')::numeric)
        FILTER (WHERE data->>'status' = 'paid'), 0), 2)      AS paid_total
    FROM app_state_records
    WHERE collection = 'riderWithdrawals'
  ),
  tickets AS MATERIALIZED (
    SELECT count(*) AS open
    FROM app_state_records
    WHERE collection = 'supportTickets' AND data->>'status' = 'open'
  ),
  mall AS MATERIALIZED (
    SELECT
      count(*) FILTER (WHERE data->>'status' = 'created') AS in_transit,
      count(*) FILTER (WHERE data->>'status' = 'arrived') AS awaiting
    FROM app_state_records
    WHERE collection = 'marketplaceOrders'
      AND data->>'status' IN ('created', 'arrived')
  )
  SELECT jsonb_build_object(
    'network', jsonb_build_object(
      'franchises', (SELECT franchises FROM network),
      'stations',   (SELECT stations   FROM network),
      'riders',     (SELECT riders     FROM network),
      'accounts',   (SELECT accounts   FROM network)
    ),
    'dispatch', jsonb_build_object(
      'upcomingShifts',  (SELECT upcoming FROM shifts),
      'planned',         (SELECT planned  FROM shifts),
      'pendingSignups',  (SELECT pending  FROM signups),
      'approvedSignups', (SELECT approved FROM signups)
    ),
    'kpi', jsonb_build_object(
      'date',            (SELECT d         FROM ld),
      'riders',          (SELECT riders    FROM kpi),
      'completedOrders', (SELECT completed FROM kpi),
      'settleTotal',     (SELECT settle    FROM earn),
      'lowAr',           (SELECT low_ar    FROM kpi)
    ),
    'finance', jsonb_build_object(
      'pendingWithdrawals', (SELECT pending_count  FROM wd),
      'pendingAmount',      (SELECT pending_amount FROM wd),
      'paidTotal',          (SELECT paid_total     FROM wd)
    ),
    'support', jsonb_build_object(
      'openTickets', (SELECT open FROM tickets)
    ),
    'mall', jsonb_build_object(
      'inTransit',      (SELECT in_transit FROM mall),
      'awaitingPickup', (SELECT awaiting   FROM mall)
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION overview_stats(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION overview_stats(text) TO service_role;

COMMENT ON FUNCTION overview_stats(text) IS
  'HQ dashboard rollup, one indexed scan per collection. See docs/overview-read-path-optimization-plan.md.';
