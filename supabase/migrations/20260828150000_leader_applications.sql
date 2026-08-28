-- Leader Mode applications (docs/leader-mode-design.md §7): open-station /
-- join-station / transfer requests. Bypasses the leader entirely — riders
-- submit straight to the franchisee (anti promotion-blocking). Real table per
-- the data-core-cure guard. Service-role only; RLS with no policies.

CREATE TABLE IF NOT EXISTS leader_applications (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('open_station','join_station','transfer')),
  franchise text NOT NULL,
  applicant_rider_id text NOT NULL,
  applicant_name text NOT NULL DEFAULT '',
  -- join/transfer: target station id · open_station: proposed station name
  target_station_id text,
  proposed_station_name text,
  channel text NOT NULL DEFAULT 'self' CHECK (channel IN ('self','leader_referral','franchisee')),
  referrer_station_id text,
  eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by text,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_leader_apps_franchise
  ON leader_applications (franchise, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leader_apps_rider
  ON leader_applications (applicant_rider_id, created_at DESC);

ALTER TABLE leader_applications ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE leader_applications IS
  'Leader Mode promotion/binding applications (docs/leader-mode-design.md §7). Rider-submitted, franchisee-reviewed; leaders have no veto.';
