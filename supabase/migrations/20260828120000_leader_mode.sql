-- Leader Mode (docs/leader-mode-design.md) — Wave-aligned real table for the
-- weekly leader assessments (guard rule: new data lives in real tables, not
-- app_state_records). Service-role only; RLS enabled with no policies.

CREATE TABLE IF NOT EXISTS leader_assessments (
  id text PRIMARY KEY,                       -- `${stationId}:${week}`
  station_id text NOT NULL,
  station_name text NOT NULL DEFAULT '',
  franchise text NOT NULL,
  week text NOT NULL,                        -- ISO week id, e.g. 2026-W36
  state text NOT NULL DEFAULT 'provisional'
    CHECK (state IN ('provisional','closed','settled','adjusted')),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  targets_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  passed boolean NOT NULL DEFAULT false,
  trial boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_leader_assessments_franchise_week
  ON leader_assessments (franchise, week);
CREATE INDEX IF NOT EXISTS idx_leader_assessments_station
  ON leader_assessments (station_id, week DESC);

ALTER TABLE leader_assessments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE leader_assessments IS
  'Leader Mode weekly station assessments (docs/leader-mode-design.md §2.4). Recompute-on-read while provisional; frozen once closed.';

-- Attribution tags on the W2 KPI fact table (design D4): stamped at import
-- time from the rider''s binding of that day. Nullable — flag-off rows stay null.
ALTER TABLE t1_rider_daily_kpis ADD COLUMN IF NOT EXISTS station_id text;
ALTER TABLE t1_rider_daily_kpis ADD COLUMN IF NOT EXISTS station_franchise text;
CREATE INDEX IF NOT EXISTS idx_t1_kpis_station
  ON t1_rider_daily_kpis (station_franchise, date) WHERE station_franchise IS NOT NULL;
