INSERT INTO tenants (id, tenant_type, parent_tenant_id, name, metadata)
VALUES
  ('tenant-fr-pinheiros', 'franchise', 'tenant-platform', 'Pinheiros Partner Franchise', '{"region":"SP West"}'),
  ('tenant-st-pinheiros', 'station', 'tenant-fr-pinheiros', 'Ponto Pinheiros Base', '{"external_id":"p-004"}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  metadata = EXCLUDED.metadata,
  updated_at = now();

CREATE TABLE IF NOT EXISTS slot_franchise_quotas (
  id text PRIMARY KEY,
  cycle_id text NOT NULL REFERENCES quota_cycles(id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  franchise_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  franchise_external_id text NOT NULL,
  franchise_name text NOT NULL,
  quota integer NOT NULL CHECK (quota >= 0),
  allocated_by text NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, slot_date, start_time, end_time, franchise_tenant_id)
);

CREATE TABLE IF NOT EXISTS slot_station_quotas (
  id text PRIMARY KEY,
  franchise_slot_quota_id text NOT NULL REFERENCES slot_franchise_quotas(id) ON DELETE CASCADE,
  station_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  ponto_external_id text NOT NULL,
  ponto_name text NOT NULL,
  rider_slot_id text NOT NULL UNIQUE REFERENCES rider_slots(id) ON DELETE CASCADE,
  quota integer NOT NULL CHECK (quota >= 0),
  allocated_by text NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (franchise_slot_quota_id, station_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_franchise_quotas_cycle
  ON slot_franchise_quotas(cycle_id, slot_date, start_time);
CREATE INDEX IF NOT EXISTS idx_slot_franchise_quotas_tenant
  ON slot_franchise_quotas(franchise_tenant_id);
CREATE INDEX IF NOT EXISTS idx_slot_station_quotas_franchise_slot
  ON slot_station_quotas(franchise_slot_quota_id);
CREATE INDEX IF NOT EXISTS idx_slot_station_quotas_station
  ON slot_station_quotas(station_tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS quota_cycles_week_start_uq
  ON quota_cycles(business_week_start);

INSERT INTO quota_cycles (
  id,
  external_schedule_ref,
  name,
  business_week_start,
  business_week_end,
  platform_capacity,
  status,
  created_by
)
SELECT
  'quota-20260601',
  'EXT-SCHEDULE-W23',
  'Week 23 Capacity',
  DATE '2026-06-01',
  DATE '2026-06-07',
  COALESCE(sum(capacity), 0),
  'open',
  'HQ Operations'
FROM rider_slots
WHERE date BETWEEN DATE '2026-06-01' AND DATE '2026-06-07'
ON CONFLICT (id) DO UPDATE SET
  platform_capacity = EXCLUDED.platform_capacity,
  updated_at = now();

UPDATE rider_slots
SET quota_cycle_id = 'quota-20260601'
WHERE date BETWEEN DATE '2026-06-01' AND DATE '2026-06-07'
  AND quota_cycle_id IS NULL;

INSERT INTO slot_franchise_quotas (
  id,
  cycle_id,
  slot_date,
  start_time,
  end_time,
  franchise_tenant_id,
  franchise_external_id,
  franchise_name,
  quota,
  allocated_by
)
SELECT
  concat(
    'fsq-', to_char(slot.date, 'YYYYMMDD'), '-',
    replace(to_char(slot.start_time, 'HH24MI'), ':', ''), '-',
    slot.franchise_id
  ),
  'quota-20260601',
  slot.date,
  slot.start_time,
  slot.end_time,
  CASE slot.franchise_id
    WHEN 'fr-sp-01' THEN 'tenant-fr-sp-core'
    WHEN 'fr-sp-02' THEN 'tenant-fr-tatuape'
    WHEN 'fr-sp-03' THEN 'tenant-fr-pinheiros'
  END,
  slot.franchise_id,
  slot.franchise_name,
  sum(slot.capacity)::integer,
  'HQ Operations'
FROM rider_slots slot
WHERE slot.date BETWEEN DATE '2026-06-01' AND DATE '2026-06-07'
GROUP BY slot.date, slot.start_time, slot.end_time, slot.franchise_id, slot.franchise_name
ON CONFLICT (cycle_id, slot_date, start_time, end_time, franchise_tenant_id)
DO UPDATE SET
  quota = EXCLUDED.quota,
  updated_at = now();

INSERT INTO slot_station_quotas (
  id,
  franchise_slot_quota_id,
  station_tenant_id,
  ponto_external_id,
  ponto_name,
  rider_slot_id,
  quota,
  allocated_by
)
SELECT
  concat('ssq-', slot.id),
  franchise_quota.id,
  CASE slot.ponto_external_id
    WHEN 'p-001' THEN 'tenant-st-paulista'
    WHEN 'p-002' THEN 'tenant-st-liberdade'
    WHEN 'p-003' THEN 'tenant-st-tatuape'
    WHEN 'p-004' THEN 'tenant-st-pinheiros'
  END,
  slot.ponto_external_id,
  slot.ponto_name,
  slot.id,
  slot.capacity,
  slot.franchise_name
FROM rider_slots slot
JOIN slot_franchise_quotas franchise_quota
  ON franchise_quota.cycle_id = 'quota-20260601'
 AND franchise_quota.slot_date = slot.date
 AND franchise_quota.start_time = slot.start_time
 AND franchise_quota.end_time = slot.end_time
 AND franchise_quota.franchise_external_id = slot.franchise_id
WHERE slot.date BETWEEN DATE '2026-06-01' AND DATE '2026-06-07'
ON CONFLICT (rider_slot_id) DO UPDATE SET
  quota = EXCLUDED.quota,
  updated_at = now();

CREATE OR REPLACE FUNCTION set_franchise_slot_quota(
  p_franchise_slot_quota_id text,
  p_quota integer,
  p_actor text
)
RETURNS slot_franchise_quotas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row slot_franchise_quotas;
  v_station_total integer;
BEGIN
  IF p_quota < 0 THEN
    RAISE EXCEPTION 'Quota cannot be negative';
  END IF;

  SELECT *
  INTO v_row
  FROM slot_franchise_quotas
  WHERE id = p_franchise_slot_quota_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Franchise slot quota not found';
  END IF;

  SELECT COALESCE(sum(quota), 0)
  INTO v_station_total
  FROM slot_station_quotas
  WHERE franchise_slot_quota_id = v_row.id;

  IF p_quota < v_station_total THEN
    RAISE EXCEPTION 'Franchise quota cannot be lower than allocated station quota %', v_station_total;
  END IF;

  UPDATE slot_franchise_quotas
  SET quota = p_quota,
      allocated_by = p_actor,
      allocated_at = now(),
      updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  UPDATE quota_cycles cycle
  SET platform_capacity = (
        SELECT COALESCE(sum(quota), 0)
        FROM slot_franchise_quotas
        WHERE cycle_id = v_row.cycle_id
      ),
      updated_at = now()
  WHERE cycle.id = v_row.cycle_id;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION set_station_slot_quota(
  p_station_slot_quota_id text,
  p_quota integer,
  p_actor text
)
RETURNS slot_station_quotas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station slot_station_quotas;
  v_franchise slot_franchise_quotas;
  v_other_station_total integer;
  v_enrolled integer;
BEGIN
  IF p_quota < 0 THEN
    RAISE EXCEPTION 'Quota cannot be negative';
  END IF;

  SELECT *
  INTO v_station
  FROM slot_station_quotas
  WHERE id = p_station_slot_quota_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station slot quota not found';
  END IF;

  SELECT *
  INTO v_franchise
  FROM slot_franchise_quotas
  WHERE id = v_station.franchise_slot_quota_id
  FOR UPDATE;

  SELECT enrolled
  INTO v_enrolled
  FROM rider_slots
  WHERE id = v_station.rider_slot_id
  FOR UPDATE;

  IF p_quota < v_enrolled THEN
    RAISE EXCEPTION 'Station quota cannot be lower than enrolled riders %', v_enrolled;
  END IF;

  SELECT COALESCE(sum(quota), 0)
  INTO v_other_station_total
  FROM slot_station_quotas
  WHERE franchise_slot_quota_id = v_station.franchise_slot_quota_id
    AND id <> v_station.id;

  IF v_other_station_total + p_quota > v_franchise.quota THEN
    RAISE EXCEPTION 'Station quotas exceed franchise quota %', v_franchise.quota;
  END IF;

  UPDATE slot_station_quotas
  SET quota = p_quota,
      allocated_by = p_actor,
      allocated_at = now(),
      updated_at = now()
  WHERE id = v_station.id
  RETURNING * INTO v_station;

  UPDATE rider_slots
  SET capacity = p_quota,
      updated_at = now()
  WHERE id = v_station.rider_slot_id;

  RETURN v_station;
END;
$$;

CREATE OR REPLACE FUNCTION clone_slot_week(
  p_source_week_start date,
  p_target_week_start date,
  p_actor text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_cycle quota_cycles;
  v_target_cycle_id text;
  v_day_offset integer;
  v_slot_count integer := 0;
  v_source_slot rider_slots;
  v_source_franchise slot_franchise_quotas;
  v_new_slot_id text;
  v_source_station slot_station_quotas;
  v_target_franchise_id text;
BEGIN
  IF p_target_week_start <= p_source_week_start THEN
    RAISE EXCEPTION 'Target week must be after source week';
  END IF;

  SELECT *
  INTO v_source_cycle
  FROM quota_cycles
  WHERE business_week_start = p_source_week_start;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source quota cycle not found';
  END IF;

  v_target_cycle_id := concat('quota-', to_char(p_target_week_start, 'YYYYMMDD'));
  v_day_offset := p_target_week_start - p_source_week_start;

  INSERT INTO quota_cycles (
    id, external_schedule_ref, name, business_week_start, business_week_end,
    platform_capacity, status, created_by
  )
  VALUES (
    v_target_cycle_id,
    concat('PLANNED-', to_char(p_target_week_start, 'IYYY-IW')),
    concat('Week ', to_char(p_target_week_start, 'IW'), ' Capacity'),
    p_target_week_start,
    p_target_week_start + 6,
    v_source_cycle.platform_capacity,
    'allocating',
    p_actor
  )
  ON CONFLICT (business_week_start) DO UPDATE SET
    platform_capacity = EXCLUDED.platform_capacity,
    updated_at = now();

  FOR v_source_franchise IN
    SELECT *
    FROM slot_franchise_quotas
    WHERE cycle_id = v_source_cycle.id
  LOOP
    v_target_franchise_id := concat(
      'fsq-', to_char(v_source_franchise.slot_date + v_day_offset, 'YYYYMMDD'), '-',
      to_char(v_source_franchise.start_time, 'HH24MI'), '-',
      v_source_franchise.franchise_external_id
    );

    INSERT INTO slot_franchise_quotas (
      id, cycle_id, slot_date, start_time, end_time, franchise_tenant_id,
      franchise_external_id, franchise_name, quota, allocated_by
    )
    VALUES (
      v_target_franchise_id,
      v_target_cycle_id,
      v_source_franchise.slot_date + v_day_offset,
      v_source_franchise.start_time,
      v_source_franchise.end_time,
      v_source_franchise.franchise_tenant_id,
      v_source_franchise.franchise_external_id,
      v_source_franchise.franchise_name,
      v_source_franchise.quota,
      p_actor
    )
    ON CONFLICT (cycle_id, slot_date, start_time, end_time, franchise_tenant_id) DO NOTHING;
  END LOOP;

  FOR v_source_slot IN
    SELECT *
    FROM rider_slots
    WHERE quota_cycle_id = v_source_cycle.id
    ORDER BY date, start_time
  LOOP
    SELECT *
    INTO v_source_station
    FROM slot_station_quotas
    WHERE rider_slot_id = v_source_slot.id;

    v_new_slot_id := concat(
      'slot-', to_char(v_source_slot.date + v_day_offset, 'YYYYMMDD'), '-',
      to_char(v_source_slot.start_time, 'HH24MI'), '-',
      replace(v_source_slot.ponto_external_id, '-', '')
    );
    v_target_franchise_id := concat(
      'fsq-', to_char(v_source_slot.date + v_day_offset, 'YYYYMMDD'), '-',
      to_char(v_source_slot.start_time, 'HH24MI'), '-',
      v_source_slot.franchise_id
    );

    INSERT INTO rider_slots (
      id, week, date, weekday, start_time, end_time, ponto_external_id,
      ponto_name, franchise_id, franchise_name, capacity, enrolled, status,
      priority, quota_note, quota_cycle_id, external_schedule_ref
    )
    VALUES (
      v_new_slot_id,
      concat(p_target_week_start, ' / ', p_target_week_start + 6),
      v_source_slot.date + v_day_offset,
      CASE extract(isodow FROM v_source_slot.date + v_day_offset)
        WHEN 1 THEN '周一' WHEN 2 THEN '周二' WHEN 3 THEN '周三'
        WHEN 4 THEN '周四' WHEN 5 THEN '周五' WHEN 6 THEN '周六' ELSE '周日'
      END,
      v_source_slot.start_time,
      v_source_slot.end_time,
      v_source_slot.ponto_external_id,
      v_source_slot.ponto_name,
      v_source_slot.franchise_id,
      v_source_slot.franchise_name,
      v_source_slot.capacity,
      0,
      'open',
      v_source_slot.priority,
      v_source_slot.quota_note,
      v_target_cycle_id,
      concat('PLANNED-', to_char(p_target_week_start, 'IYYY-IW'))
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO slot_station_quotas (
      id, franchise_slot_quota_id, station_tenant_id, ponto_external_id,
      ponto_name, rider_slot_id, quota, allocated_by
    )
    VALUES (
      concat('ssq-', v_new_slot_id),
      v_target_franchise_id,
      v_source_station.station_tenant_id,
      v_source_slot.ponto_external_id,
      v_source_slot.ponto_name,
      v_new_slot_id,
      v_source_slot.capacity,
      p_actor
    )
    ON CONFLICT (rider_slot_id) DO NOTHING;

    v_slot_count := v_slot_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'cycleId', v_target_cycle_id,
    'weekStart', p_target_week_start,
    'weekEnd', p_target_week_start + 6,
    'slotCount', v_slot_count
  );
END;
$$;

REVOKE ALL ON FUNCTION set_franchise_slot_quota(text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_station_slot_quota(text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION clone_slot_week(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_franchise_slot_quota(text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION set_station_slot_quota(text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION clone_slot_week(date, date, text) TO service_role;

SELECT clone_slot_week(DATE '2026-06-01', DATE '2026-06-08', 'HQ Operations')
WHERE NOT EXISTS (
  SELECT 1
  FROM rider_slots
  WHERE date BETWEEN DATE '2026-06-08' AND DATE '2026-06-14'
);
