-- Migration 0018: Relax the wave size constraint
-- The original constraint locked batch_size between 20 and 50, which blocked
-- changing the wave size to smaller values mid-session. Widen to 5..100 so
-- execs have freedom to set smaller or larger waves.

ALTER TABLE public.session_settings
  DROP CONSTRAINT IF EXISTS session_settings_batch_size_check;

ALTER TABLE public.session_settings
  ADD CONSTRAINT session_settings_batch_size_check
  CHECK (batch_size BETWEEN 5 AND 100);
