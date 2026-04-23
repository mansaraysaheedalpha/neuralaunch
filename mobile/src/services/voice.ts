// src/services/voice.ts
//
// Helpers for mobile voice input — uploads a recorded file to the
// `/api/voice/transcribe` endpoint and returns the transcription in
// the same { text, duration, confidence } shape the web client sees.
//
// The endpoint is Compound-tier gated server-side; the VoiceInputButton
// parent is responsible for hiding the mic when the user isn't on that
// tier. A forbidden response surfaces as a TranscriptionForbiddenError
// so the UI can distinguish "you need to upgrade" from "the service
// hit a transcription provider failure".

import { getToken, API_BASE_URL } from './api-client';

export interface TranscriptionResult {
  text:       string;
  duration:   number;
  confidence: number;
}

export class TranscriptionForbiddenError extends Error {
  constructor() {
    super('Voice mode requires the Compound plan.');
    this.name = 'TranscriptionForbiddenError';
  }
}

export class TranscriptionUnavailableError extends Error {
  constructor(message = 'Transcription service unavailable.') {
    super(message);
    this.name = 'TranscriptionUnavailableError';
  }
}

/**
 * Upload a recording to the transcribe endpoint. The URI comes from
 * expo-audio's `AudioRecorder.uri` after stop — an iOS/Android file://
 * URI pointing at the locally written m4a.
 *
 * We attach it to the form as a File-shaped object; React Native's
 * fetch lifts that into a multipart/form-data upload without requiring
 * us to read the bytes into memory first.
 */
export async function transcribeRecording(
  uri: string,
  mimeType: string = 'audio/m4a',
): Promise<TranscriptionResult> {
  const token = await getToken();
  const form = new FormData();
  // RN FormData accepts a { uri, name, type } file shape — handled
  // natively by the runtime's multipart serializer.
  form.append('audio', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uri,
    name: uri.split('/').pop() ?? 'recording.m4a',
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(`${API_BASE_URL}/api/voice/transcribe`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (res.status === 403) throw new TranscriptionForbiddenError();
  if (!res.ok) {
    let message = 'Transcription service unavailable.';
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* fall through to generic copy */ }
    throw new TranscriptionUnavailableError(message);
  }

  return res.json() as Promise<TranscriptionResult>;
}
