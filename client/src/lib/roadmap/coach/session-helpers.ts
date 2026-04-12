// src/lib/roadmap/coach/session-helpers.ts
//
// Helpers for reading and writing standalone Coach sessions in the
// roadmap.toolSessions JSONB column. Task-level sessions use
// patchTask instead — these helpers are only for the standalone
// (tools-menu) path.

import { safeParseToolSessions, type CoachSession } from './schemas';
import { COACH_TOOL_ID } from './constants';

/**
 * Find a session by ID in the parsed toolSessions array.
 */
export function findSession(
  rawToolSessions: unknown,
  sessionId: string,
): CoachSession | null {
  const sessions = safeParseToolSessions(rawToolSessions);
  return sessions.find(s => s.id === sessionId) ?? null;
}

/**
 * Upsert a session in the toolSessions array by ID.
 * Returns the updated array (does not mutate the input).
 */
export function upsertSession(
  rawToolSessions: unknown,
  session: Record<string, unknown>,
): Record<string, unknown>[] {
  const sessions = safeParseToolSessions(rawToolSessions) as Record<string, unknown>[];
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    return sessions.map((s, i) => (i === idx ? session : s));
  }
  return [...sessions, session];
}

/**
 * Create a new empty standalone session shell. The setup route
 * calls this on the first exchange.
 */
export function createSessionShell(sessionId: string): Record<string, unknown> {
  return {
    id:           sessionId,
    tool:         COACH_TOOL_ID,
    setupHistory: [],
    channel:      null,
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };
}
