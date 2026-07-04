-- Migration 0020: Exempt approved execs from the geofence requirement
-- Migration 0016 made coordinates mandatory whenever geofencing is on, which
-- also blocked manual registration from the exec Check In page (it sends no
-- coordinates by design; it is the fallback for members without phones).
-- The caller's role tells the two apart: corps members register anonymously,
-- execs are authenticated. Geofence now applies only to anonymous callers,
-- so the direct-API loophole stays closed while exec registration works.

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
  SELECT * INTO v_settings FROM public.session_settings WHERE id = 1 FOR UPDATE;

  IF NOT v_settings.registration_open THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE state_code = p_state_code AND voided = false
  ) THEN
    RAISE EXCEPTION 'duplicate_state_code' USING ERRCODE = 'P0002';
  END IF;

  IF p_device_id IS NOT NULL AND (
    SELECT count(*) FROM public.registrations
    WHERE device_id = p_device_id
      AND registered_at >= v_settings.session_started_at
  ) >= 5 THEN
    RAISE EXCEPTION 'device_limit_reached' USING ERRCODE = 'P0003';
  END IF;

  -- Geofence: enforced for anonymous callers only. Approved execs and super
  -- admins (authenticated) register from the desk without coordinates.
  IF v_settings.geofencing_enabled AND NOT public.is_approved_exec() THEN
    IF p_lat IS NULL OR p_lng IS NULL THEN
      RAISE EXCEPTION 'location_required' USING ERRCODE = 'P0007';
    END IF;
    v_distance := 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_settings.venue_lat) / 2), 2) +
      cos(radians(v_settings.venue_lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_settings.venue_lng) / 2), 2)
    ));
    IF v_distance > v_settings.venue_radius_m THEN
      RAISE EXCEPTION 'outside_geofence' USING ERRCODE = 'P0004';
    END IF;
  END IF;

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
