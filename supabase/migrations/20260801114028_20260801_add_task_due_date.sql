/*
# Add due_date to tasks

1. Purpose
The new Tasks screen groups open tasks into three tiers (overdue/due soon,
no due date, due later) based on a concrete date. The existing tasks table
only has a freeform `due_context` text column, which cannot be sorted or
filtered by date. This migration adds a nullable `due_date` date column.

2. Modified Tables
- `tasks`
  - New column: `due_date` (date, nullable). Stores the concrete due date
    for tier grouping and sorting. Nullable so existing rows and AI-extracted
    tasks (which may not always produce a date) are unaffected.

3. Security
- No RLS changes. Existing owner-scoped policies already cover the new
  column (they apply at the row level, not column level).
*/

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date date;

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
