-- ── Migration 0015: Super admin queue number management ─────────────
-- Adds two RPCs:
--   1. super_admin_set_queue_number — change one person's queue number,
--      automatically swapping with whoever currently holds that number
--   2. super_admin_renumber_queue — close all gaps left by voided
--      entries, reassigning numbers 1…N in current queue order

-- 1. Set a specific queue number (swaps if slot is taken)
CREATE OR REPLACE FUNCTION public.super_admin_set_queue_number(
  p_registration_id uuid,
  p_queue_number    int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_number   int;
  v_conflict_id  uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;

  -- Grab the current number of the target person
  SELECT queue_number INTO v_old_number
  FROM registrations WHERE id = p_registration_id;

  IF v_old_number IS NULL THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_number = p_queue_number THEN
    RETURN; -- nothing to do
  END IF;

  -- Check if the target slot is occupied
  SELECT id INTO v_conflict_id
  FROM registrations
  WHERE queue_number = p_queue_number AND id != p_registration_id;

  -- If occupied, swap that person to the old number
  IF v_conflict_id IS NOT NULL THEN
    UPDATE registrations SET queue_number = v_old_number WHERE id = v_conflict_id;
  END IF;

  -- Assign the new number
  UPDATE registrations SET queue_number = p_queue_number WHERE id = p_registration_id;

  PERFORM log_activity(
    'queue_number_changed',
    'Queue #' || v_old_number || ' → #' || p_queue_number,
    'super_admin'
  );
END;
$$;

-- 2. Renumber all active registrations 1…N, preserving current order
CREATE OR REPLACE FUNCTION public.super_admin_renumber_queue()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY queue_number ASC) AS new_num
    FROM registrations
    WHERE voided = false
  )
  UPDATE registrations r
  SET queue_number = ranked.new_num
  FROM ranked
  WHERE r.id = ranked.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM log_activity(
    'queue_renumbered',
    v_count || ' entries renumbered from 1',
    'super_admin'
  );

  RETURN v_count;
END;
$$;
