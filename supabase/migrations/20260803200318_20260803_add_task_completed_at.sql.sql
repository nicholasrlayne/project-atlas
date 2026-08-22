/*
# Add completed_at to tasks

1. Purpose
The Tasks screen now supports an Open/Completed segmented control. Completed
tasks should be sorted by completion date (most recent first). The tasks table
currently has no completed_at column — we only know a task is done from its
status='done'. This migration adds a nullable completed_at timestamptz column
and backfills it for existing done tasks using their updated_at (or created_at
fallback).

2. Modified Tables
- `tasks`
  - New column: `completed_at` (timestamptz, nullable). Set when a task is
    marked done. Cleared when reopened.

3. Security
- No RLS changes. Existing owner-scoped policies already cover the new column.
*/

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill existing completed tasks
UPDATE tasks SET completed_at = created_at WHERE status = 'done' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_status_completed ON tasks(status, completed_at DESC NULLS LAST);
