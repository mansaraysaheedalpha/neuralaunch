// src/app/api/voice/transcribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import { transcribeAudio, TranscriptionError } from '@/lib/voice/transcriber';
import { assertCompoundTier, VoiceTierError } from '@/lib/voice/tier-gate';
import { logger } from '@/lib/logger';

// A 25MB upload at ~32kbps speech-quality Opus is roughly two hours of
// audio, well over any realistic single utterance. The cap is a belt-and-
// braces defence against clients trying to drive per-request Deepgram
// spend through the roof.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Deepgram + Whisper both happily accept these container types. Anything
// else is rejected at the edge before we spend provider quota.
const ALLOWED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
]);

function isAllowedMime(mime: string): boolean {
  if (!mime) return false;
  const normalized = mime.toLowerCase().split(';')[0].trim();
  for (const allowed of ALLOWED_MIME_TYPES) {
    if (allowed.toLowerCase().split(';')[0].trim() === normalized) return true;
  }
  return false;
}

// Transcription happens in the Node runtime because the providers are
// called via fetch with raw Buffers / FormData. The audio is held in
// memory for the duration of the request and discarded after the
// provider returns — see the spec § 6.5.
export const runtime  = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await assertCompoundTier(userId);
    await rateLimitByUser(userId, 'voice:transcribe', RATE_LIMITS.VOICE_TRANSCRIPTION);

    const formData = await req.formData().catch(() => {
      throw new HttpError(400, 'Invalid multipart body');
    });

    const audioFile = formData.get('audio');
    if (!(audioFile instanceof File)) {
      throw new HttpError(400, 'No audio file provided');
    }

    if (audioFile.size === 0) {
      throw new HttpError(400, 'Audio file is empty');
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      throw new HttpError(413, 'Audio file too large');
    }
    if (!isAllowedMime(audioFile.type)) {
      throw new HttpError(400, 'Unsupported audio format');
    }

    const result = await transcribeAudio(audioFile);

    logger.debug('Voice transcription succeeded', {
      userId,
      provider: result.provider,
      duration: result.duration,
      bytes:    audioFile.size,
    });

    return NextResponse.json({
      text:       result.text,
      duration:   result.duration,
      confidence: result.confidence,
    });
  } catch (err) {
    if (err instanceof VoiceTierError) {
      return NextResponse.json(
        { error: 'Voice mode requires the Compound plan' },
        { status: 403 },
      );
    }
    if (err instanceof TranscriptionError) {
      logger.error(
        'Transcription provider chain exhausted',
        err.cause instanceof Error ? err.cause : new Error(String(err.cause ?? err.message)),
      );
      return NextResponse.json(
        { error: 'Transcription service unavailable' },
        { status: 500 },
      );
    }
    return httpErrorToResponse(err);
  }
}
