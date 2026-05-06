-- Announcement history — persists across device refreshes and exec handoffs.
-- Previously stored in sessionStorage (lost on refresh/tab close).

CREATE TABLE IF NOT EXISTS announcement_history (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  text       text        NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE announcement_history ENABLE ROW LEVEL SECURITY;

-- Authenticated executives can read, write, and clear history
CREATE POLICY "exec_read_history"   ON announcement_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "exec_insert_history" ON announcement_history
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "exec_delete_history" ON announcement_history
  FOR DELETE TO authenticated USING (true);
