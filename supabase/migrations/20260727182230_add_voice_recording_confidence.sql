/*
# Add confidence column to voice_recordings

1. Purpose
Deepgram's prerecorded API returns a confidence score alongside the transcript.
This adds an optional `confidence` column so we can persist it per recording.

2. Changes
- `voice_recordings.confidence` (float, nullable) — Deepgram overall confidence
  for the transcript (0.0–1.0). Null when transcription failed or wasn't run.

3. Security
- No policy changes; RLS already enabled on voice_recordings.
*/

ALTER TABLE voice_recordings
  ADD COLUMN IF NOT EXISTS confidence float;
