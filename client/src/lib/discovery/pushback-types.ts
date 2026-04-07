// src/lib/discovery/pushback-types.ts
//
// Pure type definitions for the pushback transcript shape. Lives in
// its own file (no 'server-only' import) so client components can
// reference the canonical types instead of redefining their own.
//
// The runtime Zod schemas live in pushback-engine.ts alongside the
// LLM call. Keep this file dependency-free.

/**
 * One turn in the pushback conversation. Stored as a row in
 * Recommendation.pushbackHistory (a JSONB array). The shape is
 * append-only and self-describing — every turn carries its round
 * number so the history does not have to be parsed positionally.
 */
export interface PushbackTurnUser {
  role:      'user';
  content:   string;
  round:     number;
  timestamp: string;
}

export interface PushbackTurnAgent {
  role:      'agent';
  content:   string;
  round:     number;
  mode:      'analytical' | 'fear' | 'lack_of_belief';
  action:    'continue_dialogue' | 'defend' | 'refine' | 'replace' | 'closing';
  converging: boolean;
  timestamp: string;
}

export type PushbackTurn = PushbackTurnUser | PushbackTurnAgent;
