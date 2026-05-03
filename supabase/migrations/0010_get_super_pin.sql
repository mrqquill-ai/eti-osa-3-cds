-- ── Migration 0010: get_super_pin() RPC ─────────────────────────────────────
-- Returns the super admin PIN to any authenticated user.
-- Mirrors get_exec_pin() but returns super_pin instead of pin.
-- Only authenticated sessions can call this (auth.uid() IS NULL check).

CREATE OR REPLACE FUNCTION public.get_super_pin()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;
  RETURN (SELECT super_pin FROM admin_secrets WHERE id = 1);
END;
$$;
