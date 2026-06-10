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

  IF (now() AT TIME ZONE 'America/Sao_Paulo') >= (v_slot.date + v_slot.start_time) THEN
    RAISE EXCEPTION 'Slot has already started';
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

REVOKE ALL ON FUNCTION submit_slot_enrollment(text, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_slot_enrollment(text, text, text, text, integer, text) TO service_role;
