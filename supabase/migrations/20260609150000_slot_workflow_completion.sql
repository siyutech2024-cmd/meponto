CREATE OR REPLACE FUNCTION upsert_station_slot_quota(
  p_franchise_slot_quota_id text,
  p_station_tenant_id text,
  p_quota integer,
  p_actor text
)
RETURNS slot_station_quotas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_franchise slot_franchise_quotas;
  v_station_tenant tenants;
  v_station slot_station_quotas;
  v_other_station_total integer;
  v_enrolled integer := 0;
  v_ponto_external_id text;
  v_rider_slot_id text;
  v_cycle_status text;
BEGIN
  IF p_quota < 0 THEN
    RAISE EXCEPTION 'Quota cannot be negative';
  END IF;

  SELECT *
  INTO v_franchise
  FROM slot_franchise_quotas
  WHERE id = p_franchise_slot_quota_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Franchise slot quota not found';
  END IF;

  SELECT *
  INTO v_station_tenant
  FROM tenants
  WHERE id = p_station_tenant_id
    AND tenant_type = 'station'
    AND parent_tenant_id = v_franchise.franchise_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Station does not belong to this franchise';
  END IF;

  v_ponto_external_id := COALESCE(
    NULLIF(v_station_tenant.metadata ->> 'external_id', ''),
    p_station_tenant_id
  );
  v_rider_slot_id := concat(
    'slot-', to_char(v_franchise.slot_date, 'YYYYMMDD'), '-',
    to_char(v_franchise.start_time, 'HH24MI'), '-',
    regexp_replace(v_ponto_external_id, '[^a-zA-Z0-9]+', '', 'g')
  );

  SELECT *
  INTO v_station
  FROM slot_station_quotas
  WHERE franchise_slot_quota_id = v_franchise.id
    AND station_tenant_id = p_station_tenant_id
  FOR UPDATE;

  IF FOUND THEN
    SELECT enrolled
    INTO v_enrolled
    FROM rider_slots
    WHERE id = v_station.rider_slot_id
    FOR UPDATE;
  END IF;

  IF p_quota < v_enrolled THEN
    RAISE EXCEPTION 'Station quota cannot be lower than enrolled riders %', v_enrolled;
  END IF;

  SELECT COALESCE(sum(quota), 0)
  INTO v_other_station_total
  FROM slot_station_quotas
  WHERE franchise_slot_quota_id = v_franchise.id
    AND station_tenant_id <> p_station_tenant_id;

  IF v_other_station_total + p_quota > v_franchise.quota THEN
    RAISE EXCEPTION 'Station quotas exceed franchise quota %', v_franchise.quota;
  END IF;

  SELECT status
  INTO v_cycle_status
  FROM quota_cycles
  WHERE id = v_franchise.cycle_id;

  INSERT INTO rider_slots (
    id,
    week,
    date,
    weekday,
    start_time,
    end_time,
    ponto_external_id,
    ponto_name,
    franchise_id,
    franchise_name,
    capacity,
    enrolled,
    status,
    priority,
    quota_note,
    quota_cycle_id,
    external_schedule_ref
  )
  VALUES (
    v_rider_slot_id,
    concat(v_franchise.slot_date - (extract(isodow FROM v_franchise.slot_date)::integer - 1), ' / ',
      v_franchise.slot_date - (extract(isodow FROM v_franchise.slot_date)::integer - 1) + 6),
    v_franchise.slot_date,
    CASE extract(isodow FROM v_franchise.slot_date)
      WHEN 1 THEN '周一' WHEN 2 THEN '周二' WHEN 3 THEN '周三'
      WHEN 4 THEN '周四' WHEN 5 THEN '周五' WHEN 6 THEN '周六' ELSE '周日'
    END,
    v_franchise.start_time,
    v_franchise.end_time,
    v_ponto_external_id,
    v_station_tenant.name,
    v_franchise.franchise_external_id,
    v_franchise.franchise_name,
    p_quota,
    0,
    CASE WHEN v_cycle_status = 'open' THEN 'open'::slot_status ELSE 'closed'::slot_status END,
    false,
    concat('Franchise allocation to ', v_station_tenant.name),
    v_franchise.cycle_id,
    concat('ALLOCATED-', v_franchise.cycle_id)
  )
  ON CONFLICT (id) DO UPDATE SET
    capacity = EXCLUDED.capacity,
    ponto_name = EXCLUDED.ponto_name,
    franchise_id = EXCLUDED.franchise_id,
    franchise_name = EXCLUDED.franchise_name,
    quota_cycle_id = EXCLUDED.quota_cycle_id,
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
  VALUES (
    concat('ssq-', v_rider_slot_id),
    v_franchise.id,
    p_station_tenant_id,
    v_ponto_external_id,
    v_station_tenant.name,
    v_rider_slot_id,
    p_quota,
    p_actor
  )
  ON CONFLICT (franchise_slot_quota_id, station_tenant_id) DO UPDATE SET
    quota = EXCLUDED.quota,
    allocated_by = EXCLUDED.allocated_by,
    allocated_at = now(),
    updated_at = now()
  RETURNING * INTO v_station;

  RETURN v_station;
END;
$$;

CREATE OR REPLACE FUNCTION set_slot_cycle_status(
  p_cycle_id text,
  p_status text,
  p_actor text
)
RETURNS quota_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle quota_cycles;
BEGIN
  IF p_status NOT IN ('allocating', 'open', 'closed') THEN
    RAISE EXCEPTION 'Unsupported cycle status';
  END IF;

  UPDATE quota_cycles
  SET status = p_status,
      updated_at = now()
  WHERE id = p_cycle_id
  RETURNING * INTO v_cycle;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota cycle not found';
  END IF;

  UPDATE rider_slots
  SET status = CASE WHEN p_status = 'open' THEN 'open'::slot_status ELSE 'closed'::slot_status END,
      quota_note = concat_ws(' · ', NULLIF(quota_note, ''), concat('Cycle ', p_status, ' by ', p_actor)),
      updated_at = now()
  WHERE quota_cycle_id = p_cycle_id;

  RETURN v_cycle;
END;
$$;

CREATE OR REPLACE FUNCTION submit_slot_enrollment(
  p_id text,
  p_slot_id text,
  p_rider_external_id text,
  p_rider_name text,
  p_rider_tier integer,
  p_note text DEFAULT ''
)
RETURNS slot_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot rider_slots;
  v_enrollment slot_enrollments;
  v_cycle_status text;
BEGIN
  SELECT *
  INTO v_slot
  FROM rider_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found';
  END IF;

  SELECT status
  INTO v_cycle_status
  FROM quota_cycles
  WHERE id = v_slot.quota_cycle_id;

  IF v_cycle_status <> 'open' THEN
    RAISE EXCEPTION 'Schedule week is not open for rider applications';
  END IF;

  IF v_slot.status <> 'open' THEN
    RAISE EXCEPTION 'Slot is not open';
  END IF;

  IF v_slot.enrolled >= v_slot.capacity THEN
    RAISE EXCEPTION 'Slot is already full';
  END IF;

  IF p_rider_tier < 2 THEN
    RAISE EXCEPTION 'Rider tier is not eligible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM slot_enrollments
    WHERE slot_id = p_slot_id
      AND rider_external_id = p_rider_external_id
      AND status NOT IN ('rejected', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Active slot enrollment already exists';
  END IF;

  INSERT INTO slot_enrollments (
    id, slot_id, rider_external_id, rider_name, rider_tier, status, submitted_at, note
  )
  VALUES (
    p_id, p_slot_id, p_rider_external_id, p_rider_name, p_rider_tier, 'submitted', now(), COALESCE(p_note, '')
  )
  RETURNING * INTO v_enrollment;

  UPDATE rider_slots
  SET enrolled = enrolled + 1,
      updated_at = now()
  WHERE id = p_slot_id;

  RETURN v_enrollment;
END;
$$;

REVOKE ALL ON FUNCTION upsert_station_slot_quota(text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_slot_cycle_status(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION submit_slot_enrollment(text, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_station_slot_quota(text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION set_slot_cycle_status(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION submit_slot_enrollment(text, text, text, text, integer, text) TO service_role;

UPDATE rider_slots slot
SET status = 'closed'
FROM quota_cycles cycle
WHERE slot.quota_cycle_id = cycle.id
  AND cycle.status <> 'open'
  AND slot.status = 'open';
