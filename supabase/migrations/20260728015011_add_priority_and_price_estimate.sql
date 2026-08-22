/*
# Add priority to tasks and price_estimate to proposals

1. Purpose
The AI extraction feature (extract-visit edge function) returns structured
output from Claude that includes a priority on each task and a numeric
price estimate on proposals. The existing schema has no columns to store
these, so this migration adds them.

2. Modified Tables
- `tasks`
  - New column: `priority` (text, nullable). Values: 'low' | 'medium' | 'high'.
    Nullable so existing rows are unaffected.
- `proposals`
  - New column: `price_estimate` (numeric, nullable). Stores the numeric
    dollar estimate from AI extraction. The existing `price_text` column
    remains for display-formatted prices.

3. Security
- No changes to RLS policies. Existing anon/authenticated CRUD policies
  already cover the new columns (they apply at the row level, not column level).
*/

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS price_estimate numeric(10,2);
