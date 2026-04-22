'use client';

/**
 * Voice mode analytics — pure helpers + thin event tracker.
 *
 * Pure helpers (wordCount, voiceMessageCallout) are safe to call from any
 * component. The event tracker (trackVoiceEvent) POSTs a beacon to
 * /api/lp/analytics, the existing first-party analytics pipeline. We
 * deliberately reuse that endpoint instead of introducing a new one —
 * voice events are low-volume and fit its event-name-plus-payload shape.
 *
 * All client metrics from spec § 12:
 *   - voice_recording_started
 *   - voice_transcribed         (with wordCount, duration, confidence, surface)
 *   - voice_message_sent        (with wordCount, edited, surface)
 *   - voice_recording_cancelled (before upload)
 *   - voice_rerecord            (after transcription)
 *   - voice_error               (with errorMessage)
 */

const AVERAGE_WORDS_PER_MINUTE = 165;

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/** Human-readable callout shown beneath a just-sent voice message. */
export function voiceMessageCallout(text: string): string {
  const words = wordCount(text);
  const minutes = words / AVERAGE_WORDS_PER_MINUTE;
  if (minutes < 0.5) {
    const seconds = Math.max(10, Math.round(minutes * 60 / 5) * 5);
    return `${words} words — about ${seconds} seconds of speaking`;
  }
  const rounded = Math.round(minutes * 2) / 2;
  return `${words} words — about ${rounded} minute${rounded === 1 ? '' : 's'} of speaking`;
}

export type VoiceSurface =
  | 'discovery_interview'
  | 'pushback'
  | 'checkin'
  | 'coach_setup'
  | 'composer'
  | 'research'
  | 'packager';

export interface VoiceEventPayload {
  surface?:      VoiceSurface;
  wordCount?:    number;
  duration?:     number;
  confidence?:   number;
  edited?:       boolean;
  provider?:     string;
  errorMessage?: string;
}

export type VoiceEventName =
  | 'voice_recording_started'
  | 'voice_transcribed'
  | 'voice_message_sent'
  | 'voice_recording_cancelled'
  | 'voice_rerecord'
  | 'voice_error';

/**
 * Fire-and-forget analytics beacon. Failures are swallowed — analytics
 * should never break the UX. Uses sendBeacon when available so the
 * request survives page unload.
 */
export function trackVoiceEvent(event: VoiceEventName, payload: VoiceEventPayload = {}): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({
    eventType: 'voice',
    event,
    payload,
    at: Date.now(),
  });

  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon(
        '/api/lp/analytics',
        new Blob([body], { type: 'application/json' }),
      );
      if (ok) return;
    }
    void fetch('/api/lp/analytics', {
      method:  'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => { /* ignore */ });
  } catch {
    /* ignore — analytics must never break UX */
  }
}
