// src/lib/continuation/parking-lot-schema.ts
//
// Parking lot — adjacent ideas the founder mentioned during execution
// that did not belong on the active roadmap. Surfaced in section 5 of
// the continuation brief at "What's Next?" time. See
// docs/ROADMAP_CONTINUATION.md for the spec rationale.

import { z } from 'zod';
import { PARKING_LOT_MAX_ITEMS, PARKING_LOT_IDEA_MAX_LENGTH } from './constants';

/**
 * Where the parking lot item came from. The auto-capture vector is
 * the check-in agent (a structured-output field on its response). The
 * manual vector is the founder pressing "Park this idea" on the
 * roadmap UI.
 *
 * 'interview' and 'pushback' are reserved for future backfill — the
 * spec calls them out as sources but the immediate continuation flow
 * does not depend on them being populated, so we leave the writers
 * for a follow-up rather than instrumenting every interview / pushback
 * exchange today.
 */
export const PARKING_LOT_SOURCES = ['checkin', 'manual', 'interview', 'pushback'] as const;
export type ParkingLotSource = typeof PARKING_LOT_SOURCES[number];

/**
 * One parked idea. Shape is intentionally tiny — the value of the
 * parking lot is keeping adjacent ideas visible at the moment they
 * become relevant, not in capturing rich metadata.
 */
export const ParkingLotItemSchema = z.object({
  id:           z.string().describe('Stable item id (cuid-like prefixed string)'),
  idea:         z.string().min(1),
  surfacedAt:   z.string(),
  surfacedFrom: z.enum(PARKING_LOT_SOURCES),
  taskContext:  z.string().nullable(),
});
export type ParkingLotItem = z.infer<typeof ParkingLotItemSchema>;

export const ParkingLotArraySchema = z.array(ParkingLotItemSchema);
export type ParkingLot = z.infer<typeof ParkingLotArraySchema>;

/**
 * Safely parse a Roadmap.parkingLot JSONB value into a ParkingLot.
 * On parse failure (corrupt row, schema drift, null) returns an empty
 * array so the caller can proceed without a runtime crash. Mirrors
 * the safeParseDiscoveryContext / safeParsePushbackHistory pattern.
 */
export function safeParseParkingLot(value: unknown): ParkingLot {
  const parsed = ParkingLotArraySchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

/**
 * Build a fresh ParkingLotItem ready for append. The id uses
 * crypto.randomUUID (CLAUDE.md forbids Math.random for IDs). The
 * idea text is trimmed and clamped here so callers cannot smuggle
 * runaway lengths past the cap.
 */
export function buildParkingLotItem(input: {
  idea:         string;
  surfacedFrom: ParkingLotSource;
  taskContext?: string | null;
}): ParkingLotItem {
  const trimmed = input.idea.trim().slice(0, PARKING_LOT_IDEA_MAX_LENGTH);
  return {
    id:           `pl_${crypto.randomUUID()}`,
    idea:         trimmed,
    surfacedAt:   new Date().toISOString(),
    surfacedFrom: input.surfacedFrom,
    taskContext:  input.taskContext?.trim() || null,
  };
}

/**
 * Append-with-guard. Pure — does not mutate the input. Returns:
 *   - the new array on success
 *   - null when the cap is reached
 *   - null when the idea duplicates an existing entry (case-insensitive)
 *
 * Callers use the null return to surface a 409 / 422 to the client
 * without polluting the column with garbage. The agent path treats
 * a null return as "skip silently" — a duplicate auto-detection is
 * not an error worth surfacing to the founder.
 */
export type AppendOutcome =
  | { ok: true;  parkingLot: ParkingLot }
  | { ok: false; reason: 'cap_reached' | 'duplicate' };

export function appendParkingLotItem(
  current: ParkingLot,
  item:    ParkingLotItem,
): AppendOutcome {
  if (current.length >= PARKING_LOT_MAX_ITEMS) {
    return { ok: false, reason: 'cap_reached' };
  }

  const trimmed = item.idea.trim().toLowerCase();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'duplicate' };
  }
  if (current.some(existing => existing.idea.trim().toLowerCase() === trimmed)) {
    return { ok: false, reason: 'duplicate' };
  }

  return { ok: true, parkingLot: [...current, item] };
}

/**
 * Convenience helper for the check-in route. Reads the raw JSONB
 * parkingLot column, attempts to append a captured idea from the
 * agent's structured response, and returns the next array (or null
 * if nothing was captured / the append was a duplicate / the cap
 * was reached). Pure — does not write to the database.
 *
 * The route uses the null return to decide whether to include
 * `parkingLot` in its Prisma update payload at all.
 */
export function captureParkingLotFromCheckin(input: {
  rawParkingLot:    unknown;
  capturedIdea:     string | undefined;
  taskTitle:        string;
}): { previous: ParkingLot; next: ParkingLot | null } {
  const previous = safeParseParkingLot(input.rawParkingLot);
  if (!input.capturedIdea) return { previous, next: null };

  const item = buildParkingLotItem({
    idea:         input.capturedIdea,
    surfacedFrom: 'checkin',
    taskContext:  input.taskTitle,
  });

  const outcome = appendParkingLotItem(previous, item);
  return {
    previous,
    next: outcome.ok ? outcome.parkingLot : null,
  };
}
