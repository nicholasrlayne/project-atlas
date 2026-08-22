/*
# Drop unused voice_recordings.storage_path column

1. Context
   - The `voice_recordings.storage_path` column was created in the initial
     schema (`20260727180918_atlas_core_schema`) to store the Supabase Storage
     path for audio files.
   - Audio is transcribed in-memory by the `transcribe-visit` edge function
     and never persisted to Storage. The column is written as NULL on every
     insert (confirmed in `addVoiceRecording` in api.ts) and never read by any
     code path — not the frontend, not any edge function, not any migration.
   - SCHEMA.md flag #1 documented this as dead weight.

2. Changes
   - Drop `storage_path` column from `voice_recordings`.
   - The `photos.storage_path` column was also flagged but is actively used
     (photo upload, signed-URL generation, send-visit-summary edge function)
     and is NOT dropped.

3. Security
   - No RLS or policy changes. Existing policies on `voice_recordings` are
     unaffected (they reference `user_id`, not `storage_path`).

4. Important notes
   - This is a destructive column drop. It is safe because the column is
     nullable, always NULL, and never read. No data is lost.
   - The TypeScript type `VoiceRecording` in `src/lib/types.ts` has been
     updated to remove the `storage_path` field in the same change.
*/