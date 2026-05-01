-- ── Migration 0006: Auth bridge — get_exec_pin() ────────────────────────────
-- Returns the executive PIN to any authenticated Supabase user.
-- auth.uid() is NULL for anonymous / unauthenticated callers, so this
-- is safe to expose as a public RPC — only logged-in users can call it.

CREATE OR REPLACE FUNCTION public.get_exec_pin()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;
  RETURN (SELECT pin FROM admin_secrets WHERE id = 1);
END;
$$;
