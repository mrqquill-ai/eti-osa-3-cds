-- ── Migration 0007: Announcement broadcast field ─────────────────────────────
-- Adds announcement TEXT column to session_settings so executives can
-- broadcast messages to all corps member status screens in real time.

ALTER TABLE public.session_settings
  ADD COLUMN IF NOT EXISTS announcement text NOT NULL DEFAULT '';

-- Seed existing row
UPDATE public.session_settings
SET announcement = ''
WHERE id = 1;
