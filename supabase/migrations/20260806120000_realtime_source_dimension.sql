-- 模式二: two realtime scrapers (main VPS + PRO VPS, two Eastwind accounts)
-- feed the same snapshot tables. The ingest is delete-then-insert per
-- captured_at batch, so without a source dimension the second VPS would wipe
-- the first one's rows every 5 minutes. `source` isolates the batches:
-- deletes/reads become (captured_at, source)-scoped.
ALTER TABLE rider_status_snapshots ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'main';
ALTER TABLE rider_kpi_snapshots    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'main';

CREATE INDEX IF NOT EXISTS idx_rss_source_captured
  ON rider_status_snapshots (source, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_rks_source_captured
  ON rider_kpi_snapshots (source, captured_at DESC);
