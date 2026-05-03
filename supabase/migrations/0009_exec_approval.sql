-- ── Migration 0009: Exec approval system ────────────────────────────────────
-- Execs who sign up land in 'pending' state.
-- Super admin can approve or reject them from the dashboard.
-- Existing users are backfilled as 'approved' so they keep working.

-- ── 1. exec_profiles table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exec_profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        text NOT NULL DEFAULT '',
  state_code       text NOT NULL DEFAULT '',
  email            text NOT NULL DEFAULT '',
  role             text NOT NULL DEFAULT 'executive',
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz
);

ALTER TABLE public.exec_profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own profile
DROP POLICY IF EXISTS "exec read own profile" ON public.exec_profiles;
CREATE POLICY "exec read own profile" ON public.exec_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- ── 2. Backfill existing auth users as approved ─────────────────────────────
-- Any user who existed before this migration is trusted and approved.
INSERT INTO public.exec_profiles (id, full_name, state_code, email, role, status)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'full_name', ''),
  COALESCE(raw_user_meta_data->>'state_code', ''),
  COALESCE(email, ''),
  COALESCE(raw_user_meta_data->>'role', 'executive'),
  'approved'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ── 3. Trigger: auto-create profile on new signup ───────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_exec_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.exec_profiles (id, full_name, state_code, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'state_code', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'executive'),
    -- Super admin accounts are auto-approved; everyone else is pending
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', '') = 'super_admin' THEN 'approved'
      ELSE 'pending'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and recreate to ensure idempotency
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_exec_signup();

-- ── 4. get_my_exec_profile() — returns caller's own profile ─────────────────
CREATE OR REPLACE FUNCTION public.get_my_exec_profile()
RETURNS public.exec_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.exec_profiles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_profile FROM public.exec_profiles WHERE id = auth.uid();
  RETURN v_profile;
END;
$$;

-- ── 5. Super admin: list all exec profiles ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.super_admin_list_execs(p_super_pin text)
RETURNS SETOF public.exec_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_secrets WHERE id = 1 AND super_pin = p_super_pin
  ) THEN
    RAISE EXCEPTION 'invalid_super_pin' USING ERRCODE = 'P0010';
  END IF;
  RETURN QUERY
    SELECT * FROM public.exec_profiles
    ORDER BY
      CASE status
        WHEN 'pending'  THEN 0
        WHEN 'approved' THEN 1
        ELSE 2
      END,
      created_at DESC;
END;
$$;

-- ── 6. Super admin: approve exec ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.super_admin_approve_exec(
  p_super_pin text,
  p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_secrets WHERE id = 1 AND super_pin = p_super_pin
  ) THEN
    RAISE EXCEPTION 'invalid_super_pin' USING ERRCODE = 'P0010';
  END IF;
  UPDATE public.exec_profiles
  SET status = 'approved', reviewed_at = now(), rejection_reason = NULL
  WHERE id = p_user_id;
END;
$$;

-- ── 7. Super admin: reject exec ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.super_admin_reject_exec(
  p_super_pin text,
  p_user_id   uuid,
  p_reason    text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_secrets WHERE id = 1 AND super_pin = p_super_pin
  ) THEN
    RAISE EXCEPTION 'invalid_super_pin' USING ERRCODE = 'P0010';
  END IF;
  UPDATE public.exec_profiles
  SET status = 'rejected', reviewed_at = now(), rejection_reason = p_reason
  WHERE id = p_user_id;
END;
$$;
