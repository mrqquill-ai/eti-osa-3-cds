-- ── Migration 0013: Restrict session_settings UPDATE to approved execs only ──
-- Migration 0008 allowed ANY authenticated user to update session_settings.
-- A freshly signed-up (unapproved) exec could call a direct PATCH to close
-- registration or move the venue. This locks it down to:
--   • super_admin (role in JWT metadata)
--   • approved exec (status = 'approved' in exec_profiles)

DROP POLICY IF EXISTS "auth update settings" ON public.session_settings;

CREATE POLICY "approved exec update settings" ON public.session_settings
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.exec_profiles
      WHERE id = auth.uid()
        AND status = 'approved'
    )
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.exec_profiles
      WHERE id = auth.uid()
        AND status = 'approved'
    )
  );
