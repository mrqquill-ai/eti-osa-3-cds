-- ── Migration 0005: Configurable geofencing settings ─────────────────────────
-- Adds venue_lat, venue_lng, venue_radius_m, geofencing_enabled to
-- session_settings so super admin can update them from the dashboard
-- without redeploying the app.

-- 1. Add columns to session_settings
ALTER TABLE public.session_settings
  ADD COLUMN IF NOT EXISTS geofencing_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS venue_lat          float   NOT NULL DEFAULT 6.4360344,
  ADD COLUMN IF NOT EXISTS venue_lng          float   NOT NULL DEFAULT 3.523451,
  ADD COLUMN IF NOT EXISTS venue_radius_m     int     NOT NULL DEFAULT 350;

-- Seed existing row with defaults (350m radius is more forgiving than 200m)
UPDATE public.session_settings
SET
  geofencing_enabled = true,
  venue_lat          = 6.4360344,
  venue_lng          = 3.523451,
  venue_radius_m     = 350
WHERE id = 1;

-- 2. Update register_corps_member to use configurable geo settings
CREATE OR REPLACE FUNCTION public.register_corps_member(
  p_full_name  text,
  p_state_code text,
  p_device_id  text  DEFAULT NULL,
  p_lat        float DEFAULT NULL,
  p_lng        float DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings  public.session_settings%ROWTYPE;
  v_distance  float;
  v_next_q    int;
  v_batch     int;
  v_reg       public.registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_settings FROM public.session_settings WHERE id = 1;

  -- Registration must be open
  IF NOT v_settings.registration_open THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = 'P0001';
  END IF;

  -- Duplicate check
  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE state_code = upper(trim(p_state_code))
      AND registered_at >= v_settings.session_started_at
      AND NOT voided
  ) THEN
    RAISE EXCEPTION 'duplicate_registration' USING ERRCODE = 'P0002';
  END IF;

  -- Spam protection: max 5 registrations per device per session
  IF p_device_id IS NOT NULL AND (
    SELECT count(*) FROM public.registrations
    WHERE device_id = p_device_id
      AND registered_at >= v_settings.session_started_at
  ) >= 5 THEN
    RAISE EXCEPTION 'device_limit_reached' USING ERRCODE = 'P0003';
  END IF;

  -- Server-side geofence (only if enabled AND coordinates provided)
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
    INTO v_next_q
    FROM public.registrations;

  v_batch := ceil(v_next_q::numeric / v_settings.batch_size)::int;

  INSERT INTO public.registrations (
    full_name, state_code, queue_number, batch_number, device_id
  ) VALUES (
    trim(p_full_name), upper(trim(p_state_code)), v_next_q, v_batch, p_device_id
  )
  RETURNING * INTO v_reg;

  RETURN row_to_json(v_reg);
END;
$$;

-- 3. RPC for super admin to update venue / geo settings
CREATE OR REPLACE FUNCTION public.super_admin_update_geo_settings(
  p_super_pin         text,
  p_geofencing_enabled boolean,
  p_venue_lat         float,
  p_venue_lng         float,
  p_venue_radius_m    int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored text;
BEGIN
  SELECT super_pin INTO v_stored FROM public.admin_secrets WHERE id = 1;
  IF v_stored IS DISTINCT FROM p_super_pin THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.session_settings SET
    geofencing_enabled = p_geofencing_enabled,
    venue_lat          = p_venue_lat,
    venue_lng          = p_venue_lng,
    venue_radius_m     = p_venue_radius_m
  WHERE id = 1;

  PERFORM log_activity(
    'geo_settings_updated',
    format(
      'Geofencing: %s | Lat: %s | Lng: %s | Radius: %sm',
      p_geofencing_enabled, p_venue_lat, p_venue_lng, p_venue_radius_m
    ),
    'super_admin'
  );
END;
$$;
