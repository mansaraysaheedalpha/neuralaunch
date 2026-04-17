// src/lib/lifecycle/profile.ts
//
// Database helpers for the FounderProfile model. Read-path parses
// through Zod; write-path validates before persisting.

import 'server-only';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  FounderProfileSchema,
  safeParseFounderProfile,
  type FounderProfile,
} from './schemas';

/**
 * Read the Founder Profile for a user. Returns null when no profile
 * exists yet (expected for first-cycle founders) or when the stored
 * JSON fails schema validation (logged, treated as absent).
 */
export async function getFounderProfile(
  userId: string,
): Promise<FounderProfile | null> {
  const row = await prisma.founderProfile.findUnique({
    where:  { userId },
    select: { profile: true },
  });
  if (!row) return null;

  const parsed = safeParseFounderProfile(row.profile);
  if (!parsed) {
    logger.warn('[Lifecycle] FounderProfile failed schema validation', { userId });
  }
  return parsed;
}

/**
 * Create or update the Founder Profile for a user. Validates the
 * profile through Zod before writing — rejects with an Error if
 * the profile is malformed. This ensures every persisted profile
 * conforms to the schema regardless of which caller produced it
 * (the Lifecycle Transition Engine or the backfill script).
 */
export async function upsertFounderProfile(
  userId:  string,
  profile: FounderProfile,
  cycleId: string | null,
): Promise<void> {
  const validated = FounderProfileSchema.parse(profile);
  const data = {
    profile:              toJsonValue(validated),
    lastUpdatedByCycleId: cycleId,
  };
  await prisma.founderProfile.upsert({
    where:  { userId },
    create: { userId, ...data },
    update: data,
  });
}
