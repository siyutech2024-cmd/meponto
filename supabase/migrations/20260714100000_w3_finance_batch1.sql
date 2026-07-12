-- M3 / Wave 3 batch 1 (docs/data-core-cure-plan.md §3 W3): the two most
-- money-sensitive finance collections move to real tables — rider PIX
-- withdrawals and recorded settlement payments. Same proven pattern as
-- M1/M2: tables + in-db backfill + flush-pipeline mirror, flag CORE_MODE_FIN.
-- Remaining W3 collections follow in later batches by copying this pattern.

-- ============ rider_withdrawals ============
CREATE TABLE IF NOT EXISTS rider_withdrawals (
  id           text PRIMARY KEY,
  rider_id     text NOT NULL,
  rider_name   text NOT NULL DEFAULT '',
  rider99_id   text NOT NULL DEFAULT '',
  pix          text NOT NULL DEFAULT '',
  franchise    text NOT NULL DEFAULT '',
  station      text NOT NULL DEFAULT '',
  amount       numeric NOT NULL CHECK (amount > 0),
  status       text NOT NULL CHECK (status IN ('requested','paid','rejected')),
  requested_at text NOT NULL DEFAULT '',
  paid_at      text,
  paid_by      text,
  rejected_at  text,
  note         text
);
CREATE INDEX IF NOT EXISTS idx_rw_rider     ON rider_withdrawals (rider99_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_rw_status    ON rider_withdrawals (status) WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS idx_rw_franchise ON rider_withdrawals (franchise, requested_at DESC);
ALTER TABLE rider_withdrawals ENABLE ROW LEVEL SECURITY;

-- ============ wallet_payments（结算打款记录,append-only）============
CREATE TABLE IF NOT EXISTS wallet_payments (
  id        text PRIMARY KEY,
  target    text NOT NULL CHECK (target IN ('franchise','rider')),
  ref_name  text NOT NULL DEFAULT '',
  franchise text NOT NULL DEFAULT '',
  amount    numeric NOT NULL CHECK (amount > 0),
  period    text NOT NULL DEFAULT 'weekly' CHECK (period IN ('weekly','daily')),
  week_from text NOT NULL DEFAULT '',
  week_to   text NOT NULL DEFAULT '',
  note      text NOT NULL DEFAULT '',
  paid_by   text NOT NULL DEFAULT '',
  paid_at   text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_wp_window ON wallet_payments (target, ref_name, week_from, week_to);
ALTER TABLE wallet_payments ENABLE ROW LEVEL SECURITY;
-- Payment records are append-only (mistakes are corrected by counter-entries,
-- never edits). Deletes blocked outright — no test fixtures write here.
CREATE OR REPLACE RULE wallet_payments_no_delete AS ON DELETE TO wallet_payments DO INSTEAD NOTHING;

-- ============ Backfill: JSONB mirror → tables ============
INSERT INTO rider_withdrawals (id, rider_id, rider_name, rider99_id, pix,
  franchise, station, amount, status, requested_at, paid_at, paid_by,
  rejected_at, note)
SELECT
  data->>'id', coalesce(data->>'riderId', ''), coalesce(data->>'riderName', ''),
  coalesce(data->>'rider99Id', ''), coalesce(data->>'pix', ''),
  coalesce(data->>'franchise', ''), coalesce(data->>'station', ''),
  (data->>'amount')::numeric, data->>'status',
  coalesce(data->>'requestedAt', ''), data->>'paidAt', data->>'paidBy',
  data->>'rejectedAt', data->>'note'
FROM app_state_records
WHERE collection = 'riderWithdrawals'
  AND data->>'id' IS NOT NULL
  AND data->>'status' IN ('requested','paid','rejected')
  AND coalesce((data->>'amount')::numeric, 0) > 0
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallet_payments (id, target, ref_name, franchise, amount, period,
  week_from, week_to, note, paid_by, paid_at)
SELECT
  data->>'id', data->>'target', coalesce(data->>'refName', ''),
  coalesce(data->>'franchise', ''), (data->>'amount')::numeric,
  coalesce(data->>'period', 'weekly'), coalesce(data->>'weekFrom', ''),
  coalesce(data->>'weekTo', ''), coalesce(data->>'note', ''),
  coalesce(data->>'paidBy', ''), coalesce(data->>'paidAt', '')
FROM app_state_records
WHERE collection = 'walletPayments'
  AND data->>'id' IS NOT NULL
  AND data->>'target' IN ('franchise','rider')
  AND coalesce((data->>'amount')::numeric, 0) > 0
ON CONFLICT (id) DO NOTHING;
