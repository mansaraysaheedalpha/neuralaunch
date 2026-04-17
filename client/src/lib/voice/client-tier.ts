"use client";

import { useSession } from "next-auth/react";

/**
 * Client-side counterpart to lib/voice/tier-gate.ts.
 *
 * Reads the tier from the NextAuth session. The Paddle integration
 * populates session.user.tier via the session callback in auth.ts.
 */

export type VoiceTier = "free" | "execute" | "compound";

export function useVoiceTier(): VoiceTier {
  const { data } = useSession();
  return (data?.user?.tier ?? "free") as VoiceTier;
}

export function canUseVoiceMode(tier: VoiceTier): boolean {
  return tier === "compound";
}
