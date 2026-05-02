-- ── Migration 0008: Allow authenticated executives to update session_settings ─
-- Migration 0002 locked session_settings to SELECT-only for all users.
-- Direct .update() calls from the frontend were silently returning 0 rows.
-- This adds an UPDATE policy for authenticated (logged-in) users only.

CREATE POLICY "auth update settings" ON public.session_settings
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Also fix register_corps_member — migration 0002 hardcoded the venue
-- coordinates (6.4360344, 3.523451, 200m). Replace with the configurable
-- version from 0005 that reads live values from session_settings.
CREATE OR REPLACE FUNCTION public.register_corps_member(
  p_state_code text,
  p_full_name  text,
  p_device_id  text    DEFAULT NULL,
  p_lat        float   DEFAULT NULL,
  p_lng        float   DEFAULT NULL
)
RETURNS public.registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings  public.session_settings%ROWTYPE;
  v_distance  float;
  v_next_q    int;
  v_batch     int;
  v_row       public.registrations;
BEGIN
  -- Lock settings row to serialize queue assignment
  SELECT * INTO v_settings FROM public.session_settings WHERE id = 1 FOR UPDATE;

  IF NOT v_settings.registration_open THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;

  -- Reject duplicate state codes for active (non-voided) entries
  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE state_code = p_state_code AND voided = false
  ) THEN
    RAISE EXCEPTION 'duplicate_state_code' USING ERRCODE = 'P0002';
  END IF;

  -- Spam protection: max 5 per device per session
  IF p_device_id IS NOT NULL AND (
    SELECT count(*) FROM public.registrations
    WHERE device_id = p_device_id
      AND registered_at >= v_settings.session_started_at
  ) >= 5 THEN
    RAISE EXCEPTION 'device_limit_reached' USING ERRCODE = 'P0003';
  END IF;

  -- Server-side geofence: reads live venue coords from session_settings
  IF v_settings.geofencing_enabled AND p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    v_distance := 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_settings.venue_lat) / 2), 2) +
      cos(radians(v_settings.venue_lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_settings.venue_lng) / 2), 2)
    ));
    IF v_distance > v_settings.venue_radius_m THEN
      RAISE EXCEPTION 'outside_geofence' USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- Assign queue number and batch
  SELECT coalesce(max(queue_number), 0) + 1
    INTO v_next_q FROM public.registrations;

  v_batch := ceil(v_next_q::numeric / v_settings.batch_size)::int;

  INSERT INTO public.registrations (
    state_code, full_name, queue_number, batch_number, device_id
  ) VALUES (
    p_state_code, p_full_name, v_next_q, v_batch, p_device_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
