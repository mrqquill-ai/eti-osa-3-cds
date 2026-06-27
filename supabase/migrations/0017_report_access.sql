-- Migration 0017: Exec-accessible report data
-- Reports are available to super admins AND approved executives.
-- Existing archive functions are super-admin only, so these new functions
-- expose past-session data to any approved exec (read-only).

-- Helper: true if the caller is a super admin or an approved exec
CREATE OR REPLACE FUNCTION public.is_report_viewer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.exec_profiles
      WHERE id = auth.uid() AND status = 'approved'
    );
$$;

-- List archived session dates with their entry counts
CREATE OR REPLACE FUNCTION public.report_session_dates()
RETURNS TABLE(session_date date, entry_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_report_viewer() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
    SELECT ra.session_date, count(*) AS entry_count
    FROM registrations_archive ra
    WHERE ra.session_date IS NOT NULL
    GROUP BY ra.session_date
    ORDER BY ra.session_date DESC;
END;
$$;

-- Fetch all registrations archived for a given session date
CREATE OR REPLACE FUNCTION public.report_session_data(p_date date)
RETURNS SETOF public.registrations_archive
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_report_viewer() THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
    SELECT * FROM registrations_archive
    WHERE session_date = p_date
    ORDER BY queue_number;
END;
$$;
