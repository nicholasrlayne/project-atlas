# Atlas Database Schema

Current as of: 2026-07-31. Reflects the live database — not migration intentions.

---

## Relationships at a glance

```
auth.users
  └── profiles        (1:1 — one profile per user)
  └── customers       (1:N — each user owns their own customers)
       ├── properties (1:N — each customer has one or more properties)
       │    └── visits (1:N — each property can have many visits)
       │         ├── voice_recordings (1:N)
       │         ├── typed_entries    (1:N)
       │         ├── photos           (1:N)
       │         ├── tasks            (1:N)
       │         └── proposals        (1:N)
       ├── customer_facts (1:N — durable relationship intelligence per customer)
       ├── suggestions    (1:N — Atlas-generated recommendations, scoped to customer + user)
       └── projects       (1:N — named groupings of visits for a customer)
            └── visits    (N:1 — visits optionally belong to a project via project_id)
```

Each visit belongs to one customer and optionally one property.
Each user can only see their own rows (RLS on every table uses `auth.uid() = user_id`).

---

## Controlled vocabularies (CHECK constraints)

| Table | Column | Allowed values |
|---|---|---|
| `visits` | `service_type` | `landscaping`, `pest_control`, `irrigation`, `dryer_vent_cleaning`, `pressure_washing`, `general` |
| `visits` | `status` | `active`, `summarized`, `saved` |
| `tasks` | `status` | `open`, `done` |
| `tasks` | `priority` | `low`, `medium`, `high` |
| `proposals` | `status` | `draft`, `sent` |
| `reminders` | `urgency` | `high`, `normal` |
| `customer_facts` | `type` | `decision_maker`, `process`, `renewal_timing`, `upsell_opportunity` |

---

## Tables

### `profiles`
One row per authenticated user. Created during onboarding.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `user_id` | uuid PK | NO | FK → `auth.users(id)` ON DELETE CASCADE. Also the RLS key. |
| `full_name` | text | NO | Owner's full name from onboarding. |
| `business_name` | text | NO | Business name from onboarding. |
| `summary_email` | text | YES | Optional address where visit summaries are sent. |
| `created_at` | timestamptz | NO | Row creation time. |
| `updated_at` | timestamptz | NO | Auto-updated by `trg_profiles_touch` trigger. |

**RLS:** Owner-scoped SELECT / INSERT / UPDATE / DELETE via `auth.uid() = user_id`.

---

### `customers`
Top-level account entity. Represents a property manager, HOA, business, or individual.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | `gen_random_uuid()` |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. Owner isolation. |
| `name` | text | NO | Business or individual name. |
| `contact_name` | text | YES | Primary contact person's name. |
| `contact_email` | text | YES | Contact email. |
| `contact_phone` | text | YES | Contact phone. |
| `notes` | text | YES | Freeform notes about this customer. |
| `created_at` | timestamptz | NO | |
| `updated_at` | timestamptz | NO | Auto-updated by `trg_customers_touch`. |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_customers_user` on `(user_id)`.

---

### `properties`
Physical site belonging to a customer. A customer may have multiple properties.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | |
| `customer_id` | uuid | NO | FK → `customers(id)` ON DELETE CASCADE. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. Owner isolation. |
| `name` | text | YES | Short label for the site (e.g. "Bldg C"). |
| `address` | text | YES | Street address. |
| `latitude` | numeric | YES | GPS latitude. Used for proximity matching during visits. |
| `longitude` | numeric | YES | GPS longitude. Used for proximity matching during visits. |
| `notes` | text | YES | Freeform notes about this property. |
| `created_at` | timestamptz | NO | |
| `updated_at` | timestamptz | NO | Auto-updated by `trg_properties_touch`. |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_properties_user` on `(user_id)`.

**Flag:** `latitude`/`longitude` added in a later migration (`20260728024132`). Any property created before that migration has NULL coordinates and will never match on GPS proximity.

---

### `visits`
The central object. One visit = one on-site session. All captured data hangs off a visit.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | |
| `customer_id` | uuid | YES | FK → `customers(id)` ON DELETE SET NULL. May be null when visit starts; linked later via GPS or manual selection. |
| `property_id` | uuid | YES | FK → `properties(id)` ON DELETE SET NULL. Same latent-link behavior as `customer_id`. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. Owner isolation. |
| `service_type` | text | YES | Type of work performed. CHECK: `landscaping`, `pest_control`, `irrigation`, `dryer_vent_cleaning`, `pressure_washing`, `general`. |
| `status` | text | NO | Lifecycle state. CHECK: `active` (in progress) → `summarized` (AI extraction done) → `saved` (owner confirmed). Default: `active`. |
| `started_at` | timestamptz | NO | When the visit was initiated. Default: `now()`. |
| `ended_at` | timestamptz | YES | When the visit was ended. NULL while still active. |
| `summary` | text | YES | AI-generated summary written by `extract-visit` edge function. |
| `created_at` | timestamptz | NO | |
| `updated_at` | timestamptz | NO | Auto-updated by `trg_visits_touch`. |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_visits_customer`, `idx_visits_property`, `idx_visits_status`, `idx_visits_user`.

---

### `voice_recordings`
One row per recording segment captured during a visit. A single visit may have many segments (start/stop multiple times).

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | |
| `visit_id` | uuid | NO | FK → `visits(id)` ON DELETE CASCADE. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. |
| `transcript` | text | YES | Whisper-generated transcript of the audio. NULL if transcription failed. |
| `duration_sec` | int | YES | Length of the recording in seconds. |
| `confidence` | numeric | YES | Transcription confidence score (0–1) returned by `transcribe-visit` edge function. Added in migration `20260727182230`. |
| `created_at` | timestamptz | NO | |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_voice_visit` on `(visit_id)`, `idx_voice_recordings_user` on `(user_id)`.

**Flag:** `storage_path` is never written or read anywhere in the codebase. Audio is transcribed in-memory and the file is not persisted. Either the storage integration is planned but not built, or this column is dead weight.

---

### `typed_entries`
Typed notes captured during a visit (alternative to voice recording).

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | |
| `visit_id` | uuid | NO | FK → `visits(id)` ON DELETE CASCADE. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. |
| `body` | text | NO | The note text. |
| `created_at` | timestamptz | NO | When the note was added. Used for timeline ordering. |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_typed_visit`, `idx_typed_entries_user`.

---

### `photos`
Photos captured during a visit.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | |
| `visit_id` | uuid | NO | FK → `visits(id)` ON DELETE CASCADE. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. |
| `storage_path` | text | YES | Path to image in Supabase Storage. Currently not populated — photo capture is stubbed. |
| `caption` | text | YES | Optional description of the photo. |
| `created_at` | timestamptz | NO | |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_photos_visit`, `idx_photos_user`.

**Flag:** `storage_path` is never populated. `addPhoto()` in `api.ts` inserts a row with only `visit_id` and `caption` — no actual image upload is wired. The photo capture UI is a placeholder.

---

### `tasks`
Action items extracted from a visit by the AI, or potentially added manually.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | |
| `visit_id` | uuid | NO | FK → `visits(id)` ON DELETE CASCADE. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. |
| `title` | text | NO | Short description of the action item. |
| `due_context` | text | YES | Freeform timing context (e.g. "by end of week"). Not a machine-parseable date. |
| `priority` | text | YES | Urgency level. CHECK: `low`, `medium`, `high`. Set by AI extraction. |
| `status` | text | NO | CHECK: `open` (default) or `done`. Toggled by the owner in the Visit Summary screen. |
| `created_at` | timestamptz | NO | |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_tasks_visit`, `idx_tasks_user`.

**Flag:** `due_context` is a freeform string, not a `date` or `timestamptz`. This is intentional (captures what the AI said about timing) but means you cannot sort or filter tasks by actual due date.

---

### `proposals`
Proposal drafts generated from a visit by the AI.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | |
| `visit_id` | uuid | NO | FK → `visits(id)` ON DELETE CASCADE. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. |
| `title` | text | YES | Proposal headline (e.g. "Dryer vent cleaning + cap install"). |
| `price_text` | text | YES | Display-formatted price string (e.g. "$350"). Derived from `price_estimate` at write time. |
| `price_estimate` | numeric(10,2) | YES | Raw numeric dollar amount. Added in migration `20260728015011`. |
| `description` | text | YES | Longer description of the proposed work. |
| `status` | text | NO | CHECK: `draft` (default) or `sent`. Changed manually by the owner. |
| `created_at` | timestamptz | NO | |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_proposals_visit`, `idx_proposals_user`.

**Flag:** `price_text` and `price_estimate` represent the same value in two formats. `price_text` is derived from `price_estimate` at insert time in the edge function and never updated separately. If `price_estimate` were ever corrected, `price_text` would be stale. Consider generating `price_text` at read time from `price_estimate` and dropping the column eventually.

---

### `reminders`
Attention items surfaced on the Home screen ("needs attention" list).

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | |
| `customer_id` | uuid | YES | FK → `customers(id)` ON DELETE SET NULL. Optional link to a specific customer. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. |
| `title` | text | NO | Short label shown in the UI. |
| `detail` | text | YES | Optional longer description. |
| `urgency` | text | NO | CHECK: `high` or `normal`. Default: `normal`. Mapped to color in the UI (high → amber hex, normal → teal hex). |
| `done` | boolean | NO | Whether this reminder has been dismissed. Default: false. |
| `due_date` | date | YES | Optional date after which the reminder is considered overdue. |
| `created_at` | timestamptz | NO | |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_reminders_open` on `(done, due_date)`, `idx_reminders_user` on `(user_id)`.

---

## Edge functions

### `transcribe-visit`
Accepts raw audio (binary POST body), calls the Whisper API, returns `{ transcript, confidence }`. Called from the browser during Active Visit after each recording segment stops.

### `extract-visit`
Accepts `{ visit_id }`, reads all `voice_recordings` and `typed_entries` for that visit, calls Claude (`claude-haiku-4-5-20251001`) with a tool-use prompt, and writes back `summary` to `visits`, plus inserts `tasks` and optionally a `proposal`. Uses the service role key (bypasses RLS) and must set `user_id` explicitly on every row it inserts.

---

### `customer_facts`
Durable relationship intelligence per customer — decision makers, process notes, renewal timing, upsell opportunities. Captured automatically during visit extraction (extract-visit edge function) and editable manually on Customer Detail.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | `gen_random_uuid()` |
| `customer_id` | uuid | NO | FK → `customers(id)` ON DELETE CASCADE. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. Owner isolation. |
| `type` | text | NO | CHECK: `decision_maker`, `process`, `renewal_timing`, `upsell_opportunity`. |
| `value` | text | NO | The fact content (e.g. "Property manager, direct line 615-555-0148"). |
| `source_visit_id` | uuid | YES | FK → `visits(id)` ON DELETE SET NULL. Null when manually typed. |
| `is_manual` | boolean | NO | Default false. True when the owner typed it manually. |
| `previous_value` | text | YES | Only populated when an existing fact of the same type gets overwritten by extraction. |
| `acknowledged` | boolean | NO | Default true. Set false when extraction overwrites an existing fact; set back to true when the owner opens the edit view. |
| `created_at` | timestamptz | NO | |
| `updated_at` | timestamptz | NO | Auto-updated by `trg_customer_facts_touch`. |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_customer_facts_customer`, `idx_customer_facts_user`, `idx_customer_facts_type` on `(customer_id, type)`.

---

### `projects`
Named groupings of visits for a customer. An owner can manually group visits into a project during or after a visit. Nothing auto-creates projects yet — that detection logic is a separate, later phase.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | `gen_random_uuid()` |
| `customer_id` | uuid | NO | FK → `customers(id)` ON DELETE CASCADE. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. Owner isolation. `DEFAULT auth.uid()`. |
| `name` | text | NO | Project name (owner-supplied). |
| `created_at` | timestamptz | NO | |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_projects_customer` on `(customer_id)`, `idx_projects_user` on `(user_id)`.

### `visits.project_id` (added)
Nullable FK → `projects(id)` ON DELETE SET NULL. A visit with `project_id = NULL` is a standalone visit — the default, fully valid state. Deleting a project ungroups its visits (sets their `project_id` to NULL) rather than deleting them.
**Index:** `idx_visits_project` on `(project_id)`.

---

### `suggestions`
Generic, type-agnostic recommendations surfaced to the user on the Home screen. Nothing populates this table yet — the first writer (project-grouping detection) is a separate, later build. The `type` column has no CHECK constraint so new suggestion types can be added without a migration.

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `id` | uuid PK | NO | `gen_random_uuid()` |
| `customer_id` | uuid | NO | FK → `customers(id)` ON DELETE CASCADE. |
| `user_id` | uuid | NO | FK → `auth.users(id)` ON DELETE CASCADE. Owner isolation. `DEFAULT auth.uid()`. |
| `type` | text | NO | No CHECK constraint — open-ended. First type: `group_into_project`. Future types added without migration. |
| `payload` | jsonb | YES | Shape depends on `type`. For `group_into_project` this will eventually hold candidate visit IDs. |
| `status` | text | NO | CHECK: `pending`, `accepted`, `dismissed`. Default: `pending`. |
| `created_at` | timestamptz | NO | |

**RLS:** Owner-scoped CRUD via `auth.uid() = user_id`.
**Indexes:** `idx_suggestions_user` on `(user_id)`, `idx_suggestions_status` on `(status)`.

---

## Triggers

| Trigger | Table | Fires | Effect |
|---|---|---|---|
| `trg_customers_touch` | `customers` | BEFORE UPDATE | Sets `updated_at = now()` |
| `trg_properties_touch` | `properties` | BEFORE UPDATE | Sets `updated_at = now()` |
| `trg_visits_touch` | `visits` | BEFORE UPDATE | Sets `updated_at = now()` |
| `trg_profiles_touch` | `profiles` | BEFORE UPDATE | Sets `updated_at = now()` |

`tasks`, `proposals`, `reminders`, `voice_recordings`, `typed_entries`, and `photos` have no `updated_at` column and no update trigger (they are append-only or toggled via full-row reads in the app). `customer_facts` does have an `updated_at` trigger (`trg_customer_facts_touch`) because facts can be overwritten by extraction.

---

## Known flags / things to decide

| # | Table.column | Issue |
|---|---|---|
| 1 | `voice_recordings.storage_path` | Written as NULL on every insert; never read. Audio files are not persisted. Either wire up Storage or drop this column. |
| 2 | `photos.storage_path` | Same as above — photo capture is stubbed; no image is actually uploaded. |
| 3 | `proposals.price_text` | Redundant with `price_estimate`; derived once at insert time and never updated. |
| 4 | `tasks.due_context` | Freeform string, not a date. Cannot be sorted or filtered by time. Intentional but worth revisiting once task management grows. |
| 5 | `properties.latitude/longitude` | Added in a later migration; all properties created before that migration have NULL coordinates and will never GPS-match. |
