'use client';

/**
 * Client-side counterpart to lib/voice/tier-gate.ts.
 *
 * Single swap point for tier resolution on the client. Today returns
 * 'compound' unconditionally because the Paddle integration (which
 * exposes the tier on session.user.tier) is still on a parallel
 * branch. When Paddle merges, update this file to read tier from the
 * NextAuth session and every voice integration picks up the change
 * without further edits.
 */

export type VoiceTier = 'execute' | 'compound';

export function useVoiceTier(): VoiceTier {
  // STUB — replace with useSession().data?.user?.tier once Paddle merges.
  return 'compound';
}

export function canUseVoiceMode(tier: VoiceTier): boolean {
  return tier === 'compound';
}
