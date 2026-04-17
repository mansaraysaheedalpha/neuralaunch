// src/lib/voice/transcriber.ts
import 'server-only';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Transcription service — provider-agnostic abstraction.
 *
 * Primary: Deepgram Nova-2 ($0.0043/min, strong accent support).
 * Fallback: OpenAI Whisper ($0.006/min, simpler REST contract).
 *
 * The route layer never calls providers directly. It calls transcribeAudio()
 * and receives a normalised TranscriptionResult. If Deepgram throws, we catch,
 * log, and retry once with Whisper. If both fail the final error bubbles up
 * so the route can translate it into a user-facing 500.
 */

export interface TranscriptionResult {
  /** Verbatim transcribed text. */
  text: string;
  /** Audio duration in seconds. */
  duration: number;
  /** Provider-reported confidence in [0, 1]. */
  confidence: number;
  /** Which provider produced the result. */
  provider: 'deepgram' | 'whisper';
}

export class TranscriptionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

/**
 * Run the configured provider chain on the audio file. Deepgram is tried
 * first; on any error Whisper is tried as a fallback. Throws
 * TranscriptionError when both providers fail or when no provider is
 * configured.
 */
export async function transcribeAudio(audioFile: File): Promise<TranscriptionResult> {
  const hasDeepgram = Boolean(env.DEEPGRAM_API_KEY);
  const hasWhisper  = Boolean(env.OPENAI_API_KEY);

  if (!hasDeepgram && !hasWhisper) {
    throw new TranscriptionError('No transcription provider configured');
  }

  if (hasDeepgram) {
    try {
      return await transcribeWithDeepgram(audioFile);
    } catch (error) {
      logger.error(
        'Deepgram transcription failed — falling back to Whisper',
        error instanceof Error ? error : new Error(String(error)),
      );
      if (!hasWhisper) {
        throw new TranscriptionError('Deepgram failed and no Whisper fallback configured', error);
      }
    }
  }

  try {
    return await transcribeWithWhisper(audioFile);
  } catch (error) {
    throw new TranscriptionError('All transcription providers failed', error);
  }
}

async function transcribeWithDeepgram(audioFile: File): Promise<TranscriptionResult> {
  const apiKey = env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set');

  const buffer = Buffer.from(await audioFile.arrayBuffer());

  const response = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': audioFile.type || 'audio/webm',
      },
      body: buffer,
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Deepgram ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as DeepgramResponse;
  const alternative = data?.results?.channels?.[0]?.alternatives?.[0];
  if (!alternative) throw new Error('Deepgram returned no alternatives');

  return {
    text:       alternative.transcript ?? '',
    duration:   data?.metadata?.duration ?? 0,
    confidence: typeof alternative.confidence === 'number' ? alternative.confidence : 0,
    provider:   'deepgram',
  };
}

async function transcribeWithWhisper(audioFile: File): Promise<TranscriptionResult> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  formData.append('response_format', 'verbose_json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body:    formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Whisper ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as WhisperResponse;

  return {
    text:       data.text ?? '',
    duration:   typeof data.duration === 'number' ? data.duration : 0,
    // Whisper does not return confidence. Report a neutral-high value so
    // the confidence-warning UI does not misfire for Whisper paths.
    confidence: 0.95,
    provider:   'whisper',
  };
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string; confidence?: number }>;
    }>;
  };
}

interface WhisperResponse {
  text?: string;
  duration?: number;
}
