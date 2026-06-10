UPDATE app_test_accounts
SET name = 'Carlos Mendes',
    updated_at = now()
WHERE id = 'acct-rider';

ALTER TABLE app_test_accounts
  ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rider_slots_enrolled_within_capacity'
  ) THEN
    ALTER TABLE rider_slots
      ADD CONSTRAINT rider_slots_enrolled_within_capacity
      CHECK (enrolled <= capacity);
  END IF;
END;
$$;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY slot_id, rider_external_id
      ORDER BY submitted_at, id
    ) AS duplicate_rank
  FROM slot_enrollments
  WHERE status NOT IN ('rejected', 'cancelled')
),
cancelled AS (
  UPDATE slot_enrollments enrollment
  SET status = 'cancelled',
      note = concat_ws(' ', NULLIF(enrollment.note, ''), 'Automatically cancelled during duplicate enrollment cleanup.'),
      updated_at = now()
  FROM ranked
  WHERE enrollment.id = ranked.id
    AND ranked.duplicate_rank > 1
  RETURNING enrollment.slot_id
),
released AS (
  SELECT slot_id, count(*)::integer AS duplicate_count
  FROM cancelled
  GROUP BY slot_id
)
UPDATE rider_slots slot
SET enrolled = GREATEST(0, slot.enrolled - released.duplicate_count),
    updated_at = now()
FROM released
WHERE slot.id = released.slot_id;

CREATE UNIQUE INDEX IF NOT EXISTS slot_enrollments_active_rider_slot_uq
  ON slot_enrollments(slot_id, rider_external_id)
  WHERE status NOT IN ('rejected', 'cancelled');

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
BEGIN
  SELECT *
  INTO v_slot
  FROM rider_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Slot not found';
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
    id,
    slot_id,
    rider_external_id,
    rider_name,
    rider_tier,
    status,
    submitted_at,
    note
  )
  VALUES (
    p_id,
    p_slot_id,
    p_rider_external_id,
    p_rider_name,
    p_rider_tier,
    'submitted',
    now(),
    COALESCE(p_note, '')
  )
  RETURNING * INTO v_enrollment;

  UPDATE rider_slots
  SET enrolled = enrolled + 1,
      updated_at = now()
  WHERE id = p_slot_id;

  RETURN v_enrollment;
END;
$$;

CREATE OR REPLACE FUNCTION review_slot_enrollment(
  p_enrollment_id text,
  p_action text,
  p_reviewer text,
  p_note text DEFAULT ''
)
RETURNS slot_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment slot_enrollments;
BEGIN
  SELECT *
  INTO v_enrollment
  FROM slot_enrollments
  WHERE id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found';
  END IF;

  IF p_action = 'ponto_approve' THEN
    IF v_enrollment.status <> 'submitted' THEN
      RAISE EXCEPTION 'Only submitted enrollments can be approved by the station';
    END IF;
    UPDATE slot_enrollments
    SET status = 'ponto_approved',
        ponto_reviewed_by = p_reviewer,
        ponto_reviewed_at = now(),
        note = COALESCE(p_note, note),
        updated_at = now()
    WHERE id = p_enrollment_id
    RETURNING * INTO v_enrollment;
  ELSIF p_action = 'franchise_confirm' THEN
    IF v_enrollment.status <> 'ponto_approved' THEN
      RAISE EXCEPTION 'Only station-approved enrollments can be confirmed by the franchise';
    END IF;
    UPDATE slot_enrollments
    SET status = 'franchise_confirmed',
        franchise_confirmed_by = p_reviewer,
        franchise_confirmed_at = now(),
        note = COALESCE(p_note, note),
        updated_at = now()
    WHERE id = p_enrollment_id
    RETURNING * INTO v_enrollment;
  ELSIF p_action = 'hq_review' THEN
    IF v_enrollment.status <> 'franchise_confirmed' THEN
      RAISE EXCEPTION 'Only franchise-confirmed enrollments can be reviewed by headquarters';
    END IF;
    UPDATE slot_enrollments
    SET status = 'hq_reviewed',
        hq_reviewed_by = p_reviewer,
        hq_reviewed_at = now(),
        whitelist_status = 'ready',
        note = COALESCE(p_note, note),
        updated_at = now()
    WHERE id = p_enrollment_id
    RETURNING * INTO v_enrollment;
  ELSIF p_action = 'reject' THEN
    IF v_enrollment.status NOT IN ('submitted', 'ponto_approved') THEN
      RAISE EXCEPTION 'This enrollment can no longer be rejected by the station';
    END IF;
    UPDATE slot_enrollments
    SET status = 'rejected',
        ponto_reviewed_by = p_reviewer,
        ponto_reviewed_at = now(),
        note = COALESCE(p_note, note),
        updated_at = now()
    WHERE id = p_enrollment_id
    RETURNING * INTO v_enrollment;

    UPDATE rider_slots
    SET enrolled = GREATEST(0, enrolled - 1),
        updated_at = now()
    WHERE id = v_enrollment.slot_id;
  ELSE
    RAISE EXCEPTION 'Unsupported review action';
  END IF;

  RETURN v_enrollment;
END;
$$;

REVOKE ALL ON FUNCTION submit_slot_enrollment(text, text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION review_slot_enrollment(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_slot_enrollment(text, text, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION review_slot_enrollment(text, text, text, text) TO service_role;
