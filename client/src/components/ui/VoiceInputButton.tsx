'use client';

import * as React from 'react';
import { Loader2, Mic, MicOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackVoiceEvent } from '@/lib/voice/analytics';
import { MicPermissionHelp } from './MicPermissionHelp';

/**
 * VoiceInputButton — microphone primitive that captures audio via
 * MediaRecorder, uploads it to /api/voice/transcribe, and hands the
 * transcribed text to the parent via onTranscription.
 *
 * The component owns recording and transcription only. Tier gating
 * (hiding the button for non-Compound users) and post-transcription
 * review UI (edit / send / re-record) live in the parent so surface-
 * specific behaviour stays out of this primitive.
 *
 * State machine:
 *   idle      → tap mic → recording
 *   recording → tap stop → processing → (onTranscription) → idle
 *   recording → tap X    → idle  (audio discarded, no upload)
 */

type VoiceState = 'idle' | 'recording' | 'processing';

/**
 * Microphone permission state surfaced to the UI.
 *
 *   unknown — the Permissions API is unavailable; we fall through to
 *             treating the first tap as the permission request.
 *   prompt  — browser will surface a native dialog on the next tap.
 *   granted — no prompt needed; the tap starts recording immediately.
 *   denied  — the browser silently refuses getUserMedia. Without this
 *             pre-check, the bare "Microphone permission denied" error
 *             left founders with no actionable path forward, especially
 *             on Android Chrome where the native prompt never re-fires
 *             once a site or the global default is in the blocked state.
 */
type MicPermission = 'unknown' | 'prompt' | 'granted' | 'denied';

export interface VoiceInputButtonProps {
  onTranscription: (text: string, meta: { duration: number; confidence: number }) => void;
  onError?:        (message: string) => void;
  disabled?:       boolean;
  className?:      string;
  /** Max recording length in seconds. Defaults to 5 minutes. */
  maxDurationSec?: number;
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickSupportedMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'audio/webm';
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceInputButton({
  onTranscription,
  onError,
  disabled,
  className,
  maxDurationSec = 300,
}: VoiceInputButtonProps) {
  const [state, setState]     = React.useState<VoiceState>('idle');
  const [elapsed, setElapsed] = React.useState(0);
  const [permission, setPermission] = React.useState<MicPermission>('unknown');
  const [helpOpen, setHelpOpen]     = React.useState(false);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef        = React.useRef<MediaStream | null>(null);
  const chunksRef        = React.useRef<Blob[]>([]);
  const tickRef          = React.useRef<number | null>(null);
  const cancelledRef     = React.useRef(false);
  const startedAtRef     = React.useRef<number>(0);

  // Pre-check permission state on mount. Keeps the UI in sync when the
  // founder later fixes the permission in browser settings — no page
  // reload required. The Permissions API is unavailable in older
  // Safari and some Android WebViews; when missing we stay in 'unknown'
  // and fall back to the legacy tap-and-see-what-happens flow.
  React.useEffect(() => {
    let cancelled = false;
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      setPermission('prompt');
      return;
    }
    let status: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then(s => {
        if (cancelled) return;
        status = s;
        setPermission(mapPermissionState(s.state));
        s.onchange = () => setPermission(mapPermissionState(s.state));
      })
      .catch(() => {
        if (!cancelled) setPermission('prompt');
      });
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, []);

  const cleanupStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    // Safety net: if the component unmounts mid-recording, release the mic.
    return () => cleanupStream();
  }, [cleanupStream]);

  const uploadAndTranscribe = React.useCallback(async (blob: Blob) => {
    const form = new FormData();
    const ext  = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    form.append('audio', new File([blob], `voice.${ext}`, { type: blob.type }));

    const res = await fetch('/api/voice/transcribe', {
      method: 'POST',
      body:   form,
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({})) as { error?: unknown };
      const msg     = typeof payload.error === 'string' ? payload.error : 'Transcription failed';
      throw new Error(msg);
    }

    const data = await res.json() as {
      text: string;
      duration: number;
      confidence: number;
    };
    return data;
  }, []);

  const startRecording = React.useCallback(async () => {
    if (state !== 'idle' || disabled) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const isDenied = err instanceof Error && err.name === 'NotAllowedError';
      if (isDenied) {
        // Flip into the denied UI so the help panel becomes reachable
        // from the next render — bare error toasts offered no recovery
        // path on Android Chrome, where the native dialog never re-fires
        // after a prior denial.
        setPermission('denied');
        setHelpOpen(true);
      }
      const message = isDenied
        ? 'Microphone permission denied'
        : 'Could not access microphone';
      onError?.(message);
      return;
    }
    // Successful getUserMedia grant — sync the local state so the
    // Permissions API 'onchange' is not the only way to leave denied.
    if (permission !== 'granted') setPermission('granted');

    streamRef.current = stream;
    cancelledRef.current = false;
    chunksRef.current = [];
    const mimeType = pickSupportedMime();
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const wasCancelled = cancelledRef.current;
      const collectedType = chunksRef.current[0]?.type || mimeType;
      const blob = new Blob(chunksRef.current, { type: collectedType });
      cleanupStream();

      if (wasCancelled) {
        trackVoiceEvent('voice_recording_cancelled');
        setState('idle');
        setElapsed(0);
        return;
      }

      setState('processing');
      try {
        const result = await uploadAndTranscribe(blob);
        onTranscription(result.text, {
          duration:   result.duration,
          confidence: result.confidence,
        });
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Transcription failed');
      } finally {
        setState('idle');
        setElapsed(0);
      }
    };

    startedAtRef.current = Date.now();
    recorder.start();
    setState('recording');
    setElapsed(0);
    trackVoiceEvent('voice_recording_started');
    tickRef.current = window.setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(nextElapsed);
      if (nextElapsed >= maxDurationSec && recorder.state === 'recording') {
        recorder.stop();
      }
    }, 250);
  }, [state, disabled, onError, onTranscription, uploadAndTranscribe, cleanupStream, maxDurationSec, permission]);

  const stopRecording = React.useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      cancelledRef.current = false;
      recorder.stop();
    }
  }, []);

  const cancelRecording = React.useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      cancelledRef.current = true;
      recorder.stop();
    }
  }, []);

  if (state === 'processing') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground',
          className,
        )}
      >
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        <span>Transcribing…</span>
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div
        role="group"
        aria-label="Recording voice input"
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary transition-colors duration-fast',
          className,
        )}
      >
        <button
          type="button"
          onClick={cancelRecording}
          aria-label="Cancel recording"
          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 transition-colors duration-fast"
        >
          <X className="size-4" aria-hidden />
        </button>
        <span className="flex items-center gap-1.5 font-mono tabular-nums">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-primary animate-pulse"
          />
          {formatElapsed(elapsed)}
        </span>
        <button
          type="button"
          onClick={stopRecording}
          aria-label="Stop recording"
          className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30 transition-colors duration-fast"
        >
          <span className="block size-2.5 rounded-[2px] bg-primary-foreground" aria-hidden />
        </button>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className={cn('relative inline-flex', className)}>
        <button
          type="button"
          onClick={() => setHelpOpen(v => !v)}
          aria-label="Microphone blocked — show help"
          aria-expanded={helpOpen}
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-full text-red-500',
            'hover:bg-red-500/10 transition-colors duration-fast',
            'outline-none focus-visible:ring-[3px] focus-visible:ring-red-500/30',
          )}
        >
          <MicOff className="size-4" aria-hidden />
        </button>
        {helpOpen && (
          <div className="absolute right-0 top-full z-20 mt-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)]">
            <MicPermissionHelp />
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { void startRecording(); }}
      disabled={disabled}
      aria-label="Record voice input"
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-full text-muted-foreground',
        'hover:bg-primary/5 hover:text-primary transition-colors duration-fast',
        'outline-none focus-visible:ring-[3px] focus-visible:ring-primary/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <Mic className="size-4" aria-hidden />
    </button>
  );
}

function mapPermissionState(state: PermissionState): MicPermission {
  switch (state) {
    case 'granted': return 'granted';
    case 'denied':  return 'denied';
    default:        return 'prompt';
  }
}
