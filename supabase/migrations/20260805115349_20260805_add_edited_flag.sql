/*
# Add `edited` boolean column to visits and tasks

1. Purpose
Lightweight future-proofing flag. Set to true whenever a human manually
edits the visit summary text (Part 1) or a task title (Part 2) after AI
extraction. No UI surfaces this flag yet — it is purely for later
correction-pattern analysis per the PRD.

2. Modified Tables
- `visits` — added `edited boolean NOT NULL DEFAULT false`
- `tasks`  — added `edited boolean NOT NULL DEFAULT false`

3. Security
No RLS policy changes needed — the column is writable by the existing
owner-scoped UPDATE policies on both tables.

4. Important Notes
  1. DEFAULT false means all existing rows are automatically false
     (backfill via ALTER TABLE ... DEFAULT false is instant for boolean).
  2. The flag is set ONLY by the manual-edit code paths
     (updateVisitSummary / updateTaskTitle), never by the AI extraction
     pipeline or any other automated write path.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visits' AND column_name = 'edited') THEN
    ALTER TABLE visits ADD COLUMN edited boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'edited') THEN
    ALTER TABLE tasks ADD COLUMN edited boolean NOT NULL DEFAULT false;
  END IF;
END $$;
