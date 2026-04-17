// src/lib/voice/tier-gate.ts
import "server-only";
import prisma from "@/lib/prisma";

/**
 * Voice mode is gated to the Compound tier ($49/mo).
 *
 * Tier resolution reads from the Subscription record populated by the
 * Paddle webhook processor. This matches the pattern used by
 * require-tier.ts for API route gating.
 */

export type VoiceTier = "free" | "execute" | "compound";

export async function getVoiceTier(userId: string): Promise<VoiceTier> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { tier: true, status: true },
  });

  if (!subscription) return "free";
  if (subscription.status === "canceled") return "free";

  return (subscription.tier ?? "free") as VoiceTier;
}

export async function assertCompoundTier(userId: string): Promise<void> {
  const tier = await getVoiceTier(userId);
  if (tier !== "compound") {
    throw new VoiceTierError("Voice mode requires the Compound plan");
  }
}

export class VoiceTierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceTierError";
  }
}
