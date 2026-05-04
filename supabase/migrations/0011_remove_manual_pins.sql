-- =============================================================
-- Migration 0011: Remove Legacy Manual PINs
-- Switches all RPCs from using string PINs to using Supabase Auth
-- =============================================================

-- ─── 1. Security Helper Functions ────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_approved_exec()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF public.is_super_admin() THEN RETURN true; END IF;
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.exec_profiles WHERE id = auth.uid() AND status = 'approved');
END;
$$;

-- ─── 2. Drop Legacy Functions ────────────────────────────────
DROP FUNCTION IF EXISTS public.get_super_pin();
DROP FUNCTION IF EXISTS public.get_exec_pin();
DROP FUNCTION IF EXISTS public.verify_login(text);
DROP FUNCTION IF EXISTS public.verify_admin_pin(text);
DROP FUNCTION IF EXISTS public.admin_change_pin(text, text);
DROP FUNCTION IF EXISTS public.super_admin_change_pin(text, text);
DROP FUNCTION IF EXISTS public.super_admin_set_exec_pin(text, text);
DROP FUNCTION IF EXISTS public.super_admin_toggle_pin_lock(text);
DROP FUNCTION IF EXISTS public.get_pin_lock_status(text);

-- ─── 3. Recreate Super Admin Functions ───────────────────────

CREATE OR REPLACE FUNCTION public.super_admin_add_registration(
  p_state_code text,
  p_full_name  text
) RETURNS public.registrations LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_settings public.session_settings;
  v_next_q   integer;
  v_batch    integer;
  v_row      public.registrations;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_settings FROM public.session_settings WHERE id = 1 FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.registrations WHERE state_code = p_state_code AND voided = false) THEN
    RAISE EXCEPTION 'duplicate_state_code' USING ERRCODE = 'P0002';
  END IF;
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO v_next_q FROM public.registrations;
  v_batch := ceil(v_next_q::numeric / v_settings.batch_size)::int;
  INSERT INTO public.registrations (state_code, full_name, queue_number, batch_number)
  VALUES (p_state_code, p_full_name, v_next_q, v_batch) RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_edit_registration(
  p_registration_id uuid,
  p_full_name       text DEFAULT NULL,
  p_state_code      text DEFAULT NULL
) RETURNS public.registrations LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_row public.registrations;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_row FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  IF p_state_code IS NOT NULL AND p_state_code <> v_row.state_code THEN
    IF EXISTS (SELECT 1 FROM registrations WHERE state_code = p_state_code AND voided = false AND id <> p_registration_id) THEN
      RAISE EXCEPTION 'duplicate_state_code' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  UPDATE registrations SET full_name = COALESCE(p_full_name, full_name), state_code = COALESCE(p_state_code, state_code) WHERE id = p_registration_id RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_delete_registration(p_registration_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM registrations WHERE id = p_registration_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_list_execs()
RETURNS SETOF public.exec_profiles LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  RETURN QUERY SELECT * FROM public.exec_profiles ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_approve_exec(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.exec_profiles SET status = 'approved', reviewed_at = now(), rejection_reason = NULL WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_reject_exec(p_user_id uuid, p_reason text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.exec_profiles SET status = 'rejected', reviewed_at = now(), rejection_reason = p_reason WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_get_activity_log(p_limit integer DEFAULT 100)
RETURNS SETOF public.activity_log LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  RETURN QUERY SELECT * FROM activity_log ORDER BY created_at DESC LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_set_announcement(p_announcement text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  UPDATE session_settings SET announcement = COALESCE(p_announcement, '') WHERE id = 1;
  PERFORM log_activity('announcement_set', p_announcement, 'super_admin');
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_toggle_freeze()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_new boolean;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  UPDATE session_settings SET exec_frozen = NOT exec_frozen WHERE id = 1 RETURNING exec_frozen INTO v_new;
  PERFORM log_activity('exec_freeze_toggle', CASE WHEN v_new THEN 'frozen' ELSE 'unfrozen' END, 'super_admin');
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_move_to_wave(p_registration_id uuid, p_target_wave integer)
RETURNS public.registrations LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_row public.registrations;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  UPDATE registrations SET batch_number = p_target_wave WHERE id = p_registration_id RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  PERFORM log_activity('move_to_wave', v_row.full_name || ' moved to wave ' || p_target_wave, 'super_admin');
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_set_note(p_registration_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  UPDATE registrations SET admin_note = COALESCE(p_note, '') WHERE id = p_registration_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_swap_positions(p_id_a uuid, p_id_b uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_q_a integer; v_q_b integer; v_b_a integer; v_b_b integer;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  SELECT queue_number, batch_number INTO v_q_a, v_b_a FROM registrations WHERE id = p_id_a;
  SELECT queue_number, batch_number INTO v_q_b, v_b_b FROM registrations WHERE id = p_id_b;
  IF v_q_a IS NULL OR v_q_b IS NULL THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  UPDATE registrations SET queue_number = v_q_b, batch_number = v_b_b WHERE id = p_id_a;
  UPDATE registrations SET queue_number = v_q_a, batch_number = v_b_a WHERE id = p_id_b;
  PERFORM log_activity('swap_positions', 'Swapped Q#' || v_q_a || ' and Q#' || v_q_b, 'super_admin');
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_get_archives(p_date date DEFAULT NULL)
RETURNS SETOF public.registrations_archive LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  IF p_date IS NOT NULL THEN
    RETURN QUERY SELECT * FROM registrations_archive WHERE session_date = p_date ORDER BY queue_number;
  ELSE
    RETURN QUERY SELECT * FROM registrations_archive ORDER BY session_date DESC, queue_number LIMIT 2000;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_get_archive_dates()
RETURNS TABLE(session_date date, entry_count bigint) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  RETURN QUERY SELECT ra.session_date, count(*) AS entry_count FROM registrations_archive ra WHERE ra.session_date IS NOT NULL GROUP BY ra.session_date ORDER BY ra.session_date DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_find_duplicates()
RETURNS TABLE(full_name text, state_code text, match_count bigint) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  RETURN QUERY SELECT r.full_name, r.state_code, count(*) AS match_count FROM registrations r GROUP BY r.full_name, r.state_code HAVING count(*) > 1 ORDER BY count(*) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_update_geo_settings(p_lat numeric, p_lng numeric, p_radius numeric, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  UPDATE session_settings SET venue_lat = p_lat, venue_lng = p_lng, venue_radius_m = p_radius, venue_geo_enabled = p_enabled WHERE id = 1;
  PERFORM log_activity('geo_settings_updated', 'Geo settings updated by super admin', 'super_admin');
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_get_active_sessions()
RETURNS TABLE(page text, device_count bigint) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM exec_sessions WHERE last_seen < now() - interval '5 minutes';
  RETURN QUERY SELECT es.page, count(DISTINCT es.device_id) AS device_count FROM exec_sessions es GROUP BY es.page;
END;
$$;

-- ─── 4. Recreate Admin Functions (Exec + Super Admin) ────────

CREATE OR REPLACE FUNCTION public.admin_call_next_batch()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_next integer; v_role text;
BEGIN
  IF NOT public.is_approved_exec() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM session_settings WHERE id = 1 AND exec_frozen = true) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'dashboard_frozen' USING ERRCODE = 'P0012';
  END IF;
  v_role := CASE WHEN public.is_super_admin() THEN 'super_admin' ELSE 'executive' END;
  UPDATE session_settings SET current_batch = current_batch + 1 WHERE id = 1 RETURNING current_batch INTO v_next;
  PERFORM log_activity('call_wave', 'Called wave ' || v_next, v_role);
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_go_back_batch()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_prev integer; v_role text;
BEGIN
  IF NOT public.is_approved_exec() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM session_settings WHERE id = 1 AND exec_frozen = true) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'dashboard_frozen' USING ERRCODE = 'P0012';
  END IF;
  v_role := CASE WHEN public.is_super_admin() THEN 'super_admin' ELSE 'executive' END;
  UPDATE session_settings SET current_batch = GREATEST(current_batch - 1, 0) WHERE id = 1 RETURNING current_batch INTO v_prev;
  PERFORM log_activity('go_back_wave', 'Went back to wave ' || v_prev, v_role);
  RETURN v_prev;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_served(p_registration_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_row public.registrations; v_role text;
BEGIN
  IF NOT public.is_approved_exec() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM session_settings WHERE id = 1 AND exec_frozen = true) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'dashboard_frozen' USING ERRCODE = 'P0012';
  END IF;
  v_role := CASE WHEN public.is_super_admin() THEN 'super_admin' ELSE 'executive' END;
  SELECT * INTO v_row FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  IF v_row.served_at IS NOT NULL THEN
    UPDATE registrations SET served_at = NULL WHERE id = p_registration_id;
    PERFORM log_activity('unmark_served', v_row.full_name, v_role);
  ELSE
    UPDATE registrations SET served_at = now() WHERE id = p_registration_id;
    PERFORM log_activity('mark_served', v_row.full_name, v_role);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_void(p_registration_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_row public.registrations; v_role text;
BEGIN
  IF NOT public.is_approved_exec() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM session_settings WHERE id = 1 AND exec_frozen = true) AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'dashboard_frozen' USING ERRCODE = 'P0012';
  END IF;
  v_role := CASE WHEN public.is_super_admin() THEN 'super_admin' ELSE 'executive' END;
  SELECT * INTO v_row FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  UPDATE registrations SET voided = NOT v_row.voided WHERE id = p_registration_id;
  PERFORM log_activity(CASE WHEN v_row.voided THEN 'restore' ELSE 'void' END, v_row.full_name, v_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_registration()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_new boolean; v_role text;
BEGIN
  IF NOT public.is_approved_exec() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  v_role := CASE WHEN public.is_super_admin() THEN 'super_admin' ELSE 'executive' END;
  UPDATE session_settings SET registration_open = NOT registration_open WHERE id = 1 RETURNING registration_open INTO v_new;
  PERFORM log_activity(CASE WHEN v_new THEN 'registration_opened' ELSE 'registration_closed' END, NULL, v_role);
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_day(p_batch_size integer DEFAULT 30)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count integer; v_role text;
BEGIN
  IF NOT public.is_approved_exec() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001'; END IF;
  v_role := CASE WHEN public.is_super_admin() THEN 'super_admin' ELSE 'executive' END;
  SELECT count(*) INTO v_count FROM registrations;

  INSERT INTO public.registrations_archive
    (id, state_code, full_name, queue_number, batch_number, registered_at, served_at, voided, device_id, session_date, archived_at)
    SELECT r.id, r.state_code, r.full_name, r.queue_number, r.batch_number, r.registered_at, r.served_at, r.voided, r.device_id, current_date, now()
    FROM public.registrations r;

  DELETE FROM public.registrations WHERE id IS NOT NULL;

  UPDATE public.session_settings
     SET batch_size = p_batch_size,
         current_batch = 0,
         registration_open = true,
         session_started_at = now(),
         announcement = '',
         exec_frozen = false
   WHERE id = 1;

  PERFORM log_activity('reset_day', v_count || ' entries archived', v_role);
END;
$$;
