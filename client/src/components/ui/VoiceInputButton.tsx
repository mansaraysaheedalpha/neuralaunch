'use client';

import * as React from 'react';
import { Loader2, Mic, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef        = React.useRef<MediaStream | null>(null);
  const chunksRef        = React.useRef<Blob[]>([]);
  const tickRef          = React.useRef<number | null>(null);
  const cancelledRef     = React.useRef(false);
  const startedAtRef     = React.useRef<number>(0);

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
      const payload = await res.json().catch(() => ({}));
      const msg     = typeof payload?.error === 'string' ? payload.error : 'Transcription failed';
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
      const message = err instanceof Error && err.name === 'NotAllowedError'
        ? 'Microphone permission denied'
        : 'Could not access microphone';
      onError?.(message);
      return;
    }

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
    tickRef.current = window.setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(nextElapsed);
      if (nextElapsed >= maxDurationSec && recorder.state === 'recording') {
        recorder.stop();
      }
    }, 250);
  }, [state, disabled, onError, onTranscription, uploadAndTranscribe, cleanupStream, maxDurationSec]);

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

  return (
    <button
      type="button"
      onClick={startRecording}
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
