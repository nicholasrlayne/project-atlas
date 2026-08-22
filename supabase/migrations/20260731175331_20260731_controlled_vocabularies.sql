/*
# Controlled vocabularies: CHECK constraints + rename reminders.severity → urgency

Converts all freeform categorical text columns to constrained vocabularies.

Data migration:
  visits.service_type had 5 live rows with value 'Dryer vent service'
  → mapped to 'dryer_vent_cleaning' before constraint is applied.
  All other tables had no rows; visits.status values ('saved','active') are
  already valid under the new constraint.

Changes:
  visits.service_type   mapped 'Dryer vent service'→'dryer_vent_cleaning',
                        CHECK IN ('landscaping','pest_control','irrigation',
                                  'dryer_vent_cleaning','pressure_washing','general')
  visits.status         CHECK IN ('active','summarized','saved')
  tasks.status          CHECK IN ('open','done')
  tasks.priority        CHECK IN ('low','medium','high')
  proposals.status      CHECK IN ('draft','sent')
  reminders.severity    RENAMED TO reminders.urgency, values 'high'/'normal'
                        (was 'amber'/'teal' — color belongs in UI, urgency in data)
*/

-- Map existing freeform service_type values to canonical enum values
UPDATE visits SET service_type = 'dryer_vent_cleaning' WHERE service_type = 'Dryer vent service';

-- visits.service_type
ALTER TABLE visits
  ADD CONSTRAINT chk_visits_service_type
  CHECK (service_type IN ('landscaping','pest_control','irrigation','dryer_vent_cleaning','pressure_washing','general'));

-- visits.status
ALTER TABLE visits
  ADD CONSTRAINT chk_visits_status
  CHECK (status IN ('active','summarized','saved'));

-- tasks.status
ALTER TABLE tasks
  ADD CONSTRAINT chk_tasks_status
  CHECK (status IN ('open','done'));

-- tasks.priority
ALTER TABLE tasks
  ADD CONSTRAINT chk_tasks_priority
  CHECK (priority IN ('low','medium','high'));

-- proposals.status
ALTER TABLE proposals
  ADD CONSTRAINT chk_proposals_status
  CHECK (status IN ('draft','sent'));

-- reminders: rename column severity → urgency and redefine allowed values
ALTER TABLE reminders RENAME COLUMN severity TO urgency;
ALTER TABLE reminders ALTER COLUMN urgency SET DEFAULT 'normal';
ALTER TABLE reminders
  ADD CONSTRAINT chk_reminders_urgency
  CHECK (urgency IN ('high','normal'));
