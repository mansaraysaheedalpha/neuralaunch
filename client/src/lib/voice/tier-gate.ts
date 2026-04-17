// src/lib/voice/tier-gate.ts
import 'server-only';

/**
 * Voice mode is gated to the Compound tier ($49/mo).
 *
 * Tier resolution is intentionally behind this helper so the rest of the
 * voice code does not need to know where the tier comes from. Today the
 * canonical source is the session JWT written by Paddle — which is being
 * built on a parallel branch (feat/paddle-integration). Until that merges,
 * this helper short-circuits to 'compound' so the voice flow is testable.
 *
 * When Paddle lands, replace the body of getVoiceTier() with a read of
 * session.user.tier. No other call site changes.
 */

export type VoiceTier = 'execute' | 'compound';

export async function getVoiceTier(_userId: string): Promise<VoiceTier> {
  // STUB — Paddle tier-in-JWT work has not merged yet. Returning
  // 'compound' unconditionally allows the voice flow to be exercised
  // end-to-end on feat/voice-mode. The delivery report flags this.
  return 'compound';
}

export async function assertCompoundTier(userId: string): Promise<void> {
  const tier = await getVoiceTier(userId);
  if (tier !== 'compound') {
    throw new VoiceTierError('Voice mode requires the Compound plan');
  }
}

export class VoiceTierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceTierError';
  }
}
