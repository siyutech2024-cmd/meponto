-- Universal app-state persistence store.
-- One JSONB row per in-memory record, keyed by (collection, record_id).
-- Written exclusively by the server with the service_role key; RLS is enabled
-- with no policies so anon/authenticated clients have no access.

CREATE TABLE IF NOT EXISTS app_state_records (
  collection text NOT NULL,
  record_id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, record_id)
);

CREATE INDEX IF NOT EXISTS idx_app_state_records_collection
  ON app_state_records (collection, updated_at DESC);

ALTER TABLE app_state_records ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE app_state_records IS
  'Write-through mirror of the PontoSys in-memory collections. Service-role only.';
