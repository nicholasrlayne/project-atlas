import { useEffect, useMemo, useRef, useState } from 'react';
import { Folder } from 'lucide-react';
import { Hex, HEX_CLIP } from '@/components/Hex';
import { TopBar, TimerChip } from '@/components/TopBar';
import { CustomerSheet } from '@/components/CustomerSheet';
import { addTypedEntry, addVoiceRecording, addPhoto, getPhotoUrl, updatePhotoCaption, fetchVisit, transcribeAudio, fetchNearbyProperties, attachCustomerToVisit, discardEmptyVisit } from '@/lib/api';
import { ProjectSheet } from '@/components/ProjectSheet';
import type { VoiceRecording, TypedEntry, Photo } from '@/lib/types';

interface ActiveVisitProps {
  visitId: string;
  onSummary: () => void;
  onBack: () => void;
}

type TranscribeState = 'idle' | 'transcribing' | 'done' | 'failed';

type TimelineEntry =
  | { kind: 'voice'; id: string; text: string; createdAt: string; duration: number | null; confidence: number | null }
  | { kind: 'typed'; id: string; text: string; createdAt: string }
  | { kind: 'photo'; id: string; text: string; createdAt: string; storagePath: string; caption: string | null };

const GPS_MATCH_RADIUS_M = 100;

export function ActiveVisit({ visitId, onSummary, onBack }: ActiveVisitProps) {
  const [title, setTitle] = useState('Active visit');
  const [subtitle, setSubtitle] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [typedOpen, setTypedOpen] = useState(false);
  const [typedBody, setTypedBody] = useState('');
  const [entries, setEntries] = useState<TypedEntry[]>([]);
  const [voiceEntries, setVoiceEntries] = useState<VoiceRecording[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribeState, setTranscribeState] = useState<TranscribeState>('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const [micDenied, setMicDenied] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [endVisitPending, setEndVisitPending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoThumbs, setPhotoThumbs] = useState<Record<string, string>>({});

  const tickRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const elapsedAtStopRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await fetchVisit(visitId);
        if (!alive || !v) return;
        setCustomerId(v.customer_id ?? null);
        setPropertyId(v.property_id ?? null);
        setCustomerName(v.customer?.name ?? null);
        setPropertyName(v.property?.name ?? null);
        setProjectId(v.project_id ?? null);
        setProjectName(v.project?.name ?? null);
        setTitle(v.customer?.name ?? 'Active visit');
        setSubtitle(
          [v.property?.name, v.service_type].filter(Boolean).join(' · ') || 'New visit',
        );
        setVoiceEntries(v.voice_recordings ?? []);
        setEntries(v.typed_entries ?? []);
        setPhotos(v.photos ?? []);
        // Load signed URLs for any existing photos
        const existingPaths = (v.photos ?? []).map((p) => p.storage_path).filter(Boolean) as string[];
        if (existingPaths.length > 0) {
          const urls = await Promise.all(existingPaths.map((path) => getPhotoUrl(path, 3600)));
          const thumbMap: Record<string, string> = {};
          existingPaths.forEach((path, i) => { if (urls[i]) thumbMap[path] = urls[i]!; });
          if (alive) setPhotoThumbs(thumbMap);
        }
        const start = new Date(v.started_at).getTime();
        setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load visit');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  useEffect(() => {
    let alive = true;
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        if (!alive) return;
        const { latitude: lat, longitude: lng } = pos.coords;
        setGps({ lat, lng });
        try {
          const nearby = await fetchNearbyProperties(lat, lng, 1);
          if (!alive) return;
          if (nearby.length > 0 && nearby[0].distance_m <= GPS_MATCH_RADIUS_M) {
            await attachCustomerToVisit(visitId, nearby[0].customer_id, nearby[0].id);
            if (!alive) return;
            setCustomerId(nearby[0].customer_id);
            setPropertyId(nearby[0].id);
            setCustomerName(nearby[0].customer_name);
            setPropertyName(nearby[0].name);
            setProjectId(null);
            setProjectName(null);
            setTitle(nearby[0].customer_name);
            setSubtitle(nearby[0].name ?? '');
          }
        } catch {
          // GPS matching is best-effort; ignore errors
        }
      },
      () => { /* GPS denied or unavailable — non-blocking */ },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  useEffect(() => {
    if (!recording) return;
    tickRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [recording]);

  useEffect(() => {
    const t = window.setTimeout(() => startRecording(), 600);
    return () => {
      window.clearTimeout(t);
      stopTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function fmtTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  async function startRecording() {
    setError(null);
    setTranscribeState('idle');
    setLastTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setMicDenied(false);
    } catch {
      setMicDenied(true);
      setRecording(false);
    }
  }

  function pickMime(): string | undefined {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
    }
    return undefined;
  }

  async function handleStop() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setRecording(false);
      stopTracks();
      return;
    }

    elapsedAtStopRef.current = elapsed;
    setRecording(false);
    setSaving(true);

    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await stopped;
    stopTracks();

    const blob = new Blob(chunksRef.current, {
      type: recorder.mimeType || 'audio/webm',
    });
    chunksRef.current = [];

    if (blob.size === 0) return;

    setTranscribeState('transcribing');
    setSaving(true);

    let transcript = '';
    let confidence: number | null = null;
    let failed = false;

    try {
      const result = await transcribeAudio(blob);
      transcript = result.transcript;
      confidence = result.confidence;
    } catch (e) {
      failed = true;
      setError(e instanceof Error ? e.message : 'Transcription failed — audio still saved');
    }

    try {
      const rec = await addVoiceRecording(visitId, {
        transcript: transcript || '[transcription unavailable]',
        duration_sec: elapsedAtStopRef.current,
        confidence,
      });
      setVoiceEntries((prev) => [...prev, rec]);
      if (transcript) {
        setLastTranscript(transcript);
        setTranscribeState('done');
      } else {
        setTranscribeState('failed');
      }
    } catch (e) {
      setTranscribeState('failed');
      setError(e instanceof Error ? e.message : 'Could not save recording');
    } finally {
      setSaving(false);
      if (failed && transcript) {
        // saved successfully despite earlier transcription error path
      }
    }
  }

  async function handleSaveTyped() {
    if (!typedBody.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const entry = await addTypedEntry(visitId, typedBody.trim());
      setEntries((prev) => [...prev, entry]);
      setTypedBody('');
      setTypedOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save note');
    } finally {
      setSaving(false);
    }
  }

  function handlePhoto() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so selecting the same file twice fires onChange
    e.target.value = '';

    setUploadingPhoto(true);
    setError(null);
    try {
      const p = await addPhoto(visitId, file);
      setPhotos((prev) => [...prev, p]);
      const url = await getPhotoUrl(p.storage_path!, 3600);
      if (url) setPhotoThumbs((prev) => ({ ...prev, [p.storage_path!]: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveCaption(photoId: string, caption: string) {
    try {
      const updated = await updatePhotoCaption(photoId, caption);
      setPhotos((prev) => prev.map((p) => (p.id === photoId ? updated : p)));
    } catch {
      // non-blocking — caption save is best-effort
    }
  }

  function handleReviewSummary() {
    // Same empty check as handleBack — this is the primary way a visit
    // gets "closed out" (far more common than the back arrow), so it
    // needs the same discard, not just a lighter version of it. Checked
    // before the customer-required branch: if there's nothing captured,
    // there's no reason to force customer identification first.
    if (timeline.length === 0 && !recording && !isTranscribing) {
      discardEmptyVisit(visitId).catch(() => {});
      onBack();
      return;
    }
    if (!customerId || !propertyId) {
      setEndVisitPending(true);
      setSheetOpen(true);
      return;
    }
    onSummary();
  }

  const timeline = useMemo<TimelineEntry[]>(() => {
    const voice: TimelineEntry[] = voiceEntries.map((r) => ({
      kind: 'voice',
      id: r.id,
      text: r.transcript ?? '[transcription unavailable]',
      createdAt: r.created_at,
      duration: r.duration_sec,
      confidence: r.confidence,
    }));
    const typed: TimelineEntry[] = entries.map((e) => ({
      kind: 'typed',
      id: e.id,
      text: e.body,
      createdAt: e.created_at,
    }));
    const photoEntries: TimelineEntry[] = photos.map((p) => ({
      kind: 'photo',
      id: p.id,
      text: 'Photo captured',
      createdAt: p.created_at,
      storagePath: p.storage_path ?? '',
      caption: p.caption,
    }));
    return [...voice, ...typed, ...photoEntries].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [voiceEntries, entries, photos]);

  const isTranscribing = transcribeState === 'transcribing';
  const showEmpty = timeline.length === 0 && !recording && !isTranscribing;

  // Nothing captured — no voice, no typed notes, no photos, and nothing
  // mid-flight (recording or transcribing) — so backing out means abandon,
  // not finish. Discard rather than leave a blank visit in history.
  // Best-effort: never block the owner from leaving over a delete failure.
  async function handleBack() {
    if (timeline.length === 0 && !recording && !isTranscribing) {
      discardEmptyVisit(visitId).catch(() => {});
    }
    onBack();
  }

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden px-[18px] pt-6">
        <TopBar
          onBack={handleBack}
          title={customerName ?? 'Tap to identify customer'}
          onTitleClick={() => setSheetOpen(true)}
          subtitle={subtitle}
          trailing={<TimerChip label={fmt(elapsed)} />}
        />

        {/* TEMPORARY ROLLBACK (prod only): project assignment hidden while
            gauging organic demand before exposing it to test users. To
            restore, delete this comment and change `false &&` back to just
            `customerId &&` below. */}
        {false && customerId && (
          <button
            onClick={() => setProjectSheetOpen(true)}
            className="mb-3.5 mt-1 flex items-center gap-1.5 text-[12px] text-amber"
          >
            <Folder size={13} />
            <span>{projectName ? `Project: ${projectName}` : 'Assign project'}</span>
          </button>
        )}

        <div className="relative flex flex-col items-center pt-5">
          <Hex
            variant="cta"
            onClick={recording ? handleStop : startRecording}
            disabled={saving}
            title={recording ? 'Stop recording' : 'Record'}
            className={`disabled:opacity-60 ${
              recording ? 'h-[139px] w-[120px]' : 'h-[173px] w-[150px]'
            }`}
          >
            {recording ? (
              <Waveform />
            ) : (
              <span className="font-head text-[14px] font-semibold text-amber-ink">
                {isTranscribing ? '…' : 'Record'}
              </span>
            )}
          </Hex>
          <p className="mt-2.5 max-w-[260px] text-center text-[11px] leading-snug text-mist-dim">
            Tap to start or stop recording as many times as you need — everything is combined into this visit automatically.
          </p>
        </div>

        {micDenied && (
          <div className="mt-3 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[11.5px] text-coral">
            Microphone access denied — you can still type notes below.
          </div>
        )}

        <div className="mt-3.5 flex justify-center gap-2.5">
          <button
            onClick={() => setTypedOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-[20px] border border-border-strong bg-cell-2 px-4 py-2 text-[12.5px] text-mist transition-colors hover:text-chalk"
          >
            Type instead
          </button>
          <button
            onClick={handlePhoto}
            className="flex items-center gap-1.5 rounded-[20px] border border-border-strong bg-cell-2 px-4 py-2 text-[12.5px] text-mist transition-colors hover:text-chalk"
          >
            <Hex variant="sm" className="relative h-[20px] w-[20px]">
              {uploadingPhoto ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
              ) : (
                <span className="text-[8px] text-chalk">Photo</span>
              )}
            </Hex>
            Add photo
          </button>
        </div>

        {typedOpen && (
          <div className="mt-3 rounded-[16px] border border-border bg-cell p-3">
            <textarea
              autoFocus
              value={typedBody}
              onChange={(e) => setTypedBody(e.target.value)}
              placeholder="Type what you noticed on this visit…"
              className="h-20 w-full resize-none bg-transparent text-[12.5px] text-chalk placeholder:text-mist-dim focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTypedOpen(false)}
                className="rounded-[10px] px-3 py-1.5 text-[12px] text-mist"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTyped}
                disabled={!typedBody.trim() || saving}
                className="rounded-[10px] bg-amber px-3 py-1.5 text-[12px] font-semibold text-amber-ink disabled:opacity-40"
              >
                Add note
              </button>
            </div>
          </div>
        )}

        <div className="mt-3.5 flex-1 space-y-2 overflow-y-auto no-scrollbar">
          {isTranscribing && (
            <div className="flex items-center gap-2.5 rounded-[16px] border border-border bg-cell px-3 py-2.5">
              <Hex variant="tag" />
              <div className="flex items-center gap-2 text-[12.5px] text-amber">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-strong border-t-amber" />
                Transcribing latest recording…
              </div>
            </div>
          )}

          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-[12.5px] text-mist-dim">
                Nothing captured yet — tap record or type instead to begin.
              </p>
            </div>
          )}

          {timeline.map((item) => (
            <TimelineRow
              key={item.id}
              item={item}
              fmtTime={fmtTime}
              thumbUrl={item.kind === 'photo' ? photoThumbs[item.storagePath] : undefined}
              onSaveCaption={item.kind === 'photo' ? (cap) => handleSaveCaption(item.id, cap) : undefined}
            />
          ))}
        </div>

        {error && (
          <div className="mt-3 rounded-[10px] border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
            {error}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-border px-[18px] pt-3.5 pb-5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelected}
          className="hidden"
        />
        <button
          onClick={handleReviewSummary}
          className="flex-1 rounded-[10px] bg-amber py-3 text-center font-head text-[13px] font-semibold text-amber-ink"
        >
          Review summary
        </button>
      </div>

      {sheetOpen && (
        <CustomerSheet
          visitId={visitId}
          gps={gps}
          onAttached={(_custId, custName, propName) => {
            setCustomerName(custName);
            setPropertyName(propName);
            setTitle(custName);
            setSubtitle(propName ?? '');
            setSheetOpen(false);
            if (endVisitPending) {
              setEndVisitPending(false);
              onSummary();
            }
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {projectSheetOpen && customerId && (
        <ProjectSheet
          visitId={visitId}
          customerId={customerId}
          currentProjectId={projectId}
          onSelected={(newId, newName) => {
            setProjectId(newId);
            setProjectName(newName);
            setProjectSheetOpen(false);
          }}
          onClose={() => setProjectSheetOpen(false)}
        />
      )}
    </>
  );
}

function TimelineRow({
  item,
  fmtTime,
  thumbUrl,
  onSaveCaption,
}: {
  item: TimelineEntry;
  fmtTime: (iso: string) => string;
  thumbUrl?: string;
  onSaveCaption?: (caption: string) => void;
}) {
  const isVoice = item.kind === 'voice';
  const isPhoto = item.kind === 'photo';
  const [captionDraft, setCaptionDraft] = useState('');
  const [captionSaved, setCaptionSaved] = useState(false);

  const photoLabel = isPhoto && item.caption ? item.caption : isPhoto ? 'Photo' : null;

  return (
    <div className="flex items-start gap-2.5 rounded-[16px] border border-border bg-cell px-3 py-2.5">
      <div className="mt-0.5 shrink-0">
        <Hex variant={isVoice ? 'tag' : isPhoto ? 'avatar-sm' : 'tag-dusk'} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="truncate text-[9.5px] uppercase tracking-[0.06em] text-mist-dim">
            {isVoice ? 'Voice' : photoLabel ?? 'Note'}
          </span>
          <span className="shrink-0 font-mono text-[9.5px] text-mist-dim">
            {fmtTime(item.createdAt)}
          </span>
          {isVoice && item.duration != null && (
            <span className="shrink-0 font-mono text-[9.5px] text-mist-dim">
              · {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
            </span>
          )}
        </div>
        {isPhoto && thumbUrl ? (
          <>
            <img src={thumbUrl} alt="Site photo" className="mt-1 max-h-[120px] w-full rounded-[10px] object-cover" />
            {item.caption && captionSaved ? (
              <p className="mt-1 truncate text-[11px] text-mist">{item.caption}</p>
            ) : (
              <input
                type="text"
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value.slice(0, 140))}
                onBlur={() => {
                  if (captionDraft.trim() && onSaveCaption) {
                    onSaveCaption(captionDraft);
                    setCaptionSaved(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Done') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Add a caption (optional)"
                className="mt-1 w-full bg-transparent text-[11px] text-chalk placeholder:text-mist-dim focus:outline-none"
              />
            )}
          </>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-chalk">{item.text}</p>
        )}
      </div>
    </div>
  );
}

function Waveform() {
  const bars = [8, 16, 24, 14, 20, 10, 18, 12, 22, 9, 16, 14];
  return (
    <div className="flex h-6 items-center gap-[3px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className="wave-bar rounded-[2px] bg-amber-ink"
          style={{ width: 3, height: h, animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  );
}
