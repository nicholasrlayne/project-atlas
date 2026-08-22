/*
# Create export_log table

1. Purpose
Tracks every export of a visit artifact (summary, proposal) so the app
has an audit trail of where/when summaries were sent. Used by the
send-visit-summary edge function when emailing a visit summary.

2. New Tables
- `export_log`
  - id (uuid, PK)
  - user_id (uuid, NOT NULL, FK -> auth.users ON DELETE CASCADE, DEFAULT auth.uid())
  - visit_id (uuid, NOT NULL, FK -> visits ON DELETE CASCADE)
  - artifact_type (text, NOT NULL) — what was exported: 'visit_summary' | 'proposal'
  - export_method (text, NOT NULL) — how it was sent: 'email' (future: 'pdf', 'sms')
  - destination (text, NOT NULL) — where it was sent (e.g. the email address)
  - created_at (timestamptz, DEFAULT now())

3. Security
- RLS enabled on export_log.
- Owner-scoped CRUD: each authenticated user can only access their own
  export log rows (auth.uid() = user_id).
- user_id defaults to auth.uid() so inserts that omit it still satisfy
  the INSERT WITH CHECK policy.
*/

CREATE TABLE IF NOT EXISTS export_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  export_method text NOT NULL,
  destination text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_export_log_user ON export_log(user_id);
CREATE INDEX IF NOT EXISTS idx_export_log_visit ON export_log(visit_id);

DROP POLICY IF EXISTS "select_own_export_log" ON export_log;
CREATE POLICY "select_own_export_log" ON export_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_export_log" ON export_log;
CREATE POLICY "insert_own_export_log" ON export_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_export_log" ON export_log;
CREATE POLICY "update_own_export_log" ON export_log FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_export_log" ON export_log;
CREATE POLICY "delete_own_export_log" ON export_log FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
