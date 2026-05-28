// src/app/api/discovery/sessions/[sessionId]/belief/route.ts
//
// Read-only belief-state surface for the standard discovery rail.
//
// The turn route already persists the full belief state, phase,
// questionCount, activeField, and audienceType to the DiscoverySession
// row on every turn. This endpoint surfaces that persisted state to the
// client so the Institute <BeliefRail> can render the 15 fields live —
// it changes nothing about extraction, prompts, or the schema. Pure
// render-layer plumbing.
//
// The client (useBeliefRailState) fetches this on mount and after each
// turn completes (keyed on questionCount).

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import {
  safeParseDiscoveryContext,
  MIN_FIELD_CONFIDENCE,
  SYNTHESIS_READINESS_RATIO,
  type DiscoveryContext,
} from '@/lib/discovery';
import type { AudienceType, InterviewPhase } from '@/lib/discovery';

/** All 15 belief fields, in the order the rail renders them. */
const BELIEF_FIELDS = [
  'situation', 'background', 'whatTriedBefore',
  'primaryGoal', 'successDefinition', 'timeHorizon',
  'availableTimePerWeek', 'availableBudget', 'teamSize', 'technicalAbility', 'geographicMarket',
  'commitmentLevel', 'biggestConcern', 'whyNow', 'motivationAnchor',
] as const satisfies readonly (keyof DiscoveryContext)[];

const TOTAL_FIELDS = BELIEF_FIELDS.length;
/** Fields needed before synthesis unlocks — the engine's readiness bar. */
const SYNTH_TARGET = Math.ceil(TOTAL_FIELDS * SYNTHESIS_READINESS_RATIO);

export interface BeliefStateResponse {
  phase:         InterviewPhase;
  questionCount: number;
  audienceType:  AudienceType | null;
  /** The field the engine is currently probing — rendered as "live". */
  activeField:   string | null;
  /** 0–100, share of the 15 fields captured at/above MIN_FIELD_CONFIDENCE. */
  completionPct: number;
  /** Captured-field count and the synthesis target, for the readiness label. */
  capturedCount: number;
  synthTarget:   number;
  /** The full 15-field belief state — value + confidence per field. */
  context:       DiscoveryContext;
}

/** GET — current belief state for the owning user's session. */
export async function GET(
  req:     NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'discovery-belief', RATE_LIMITS.API_READ);

    const { sessionId } = await params;

    // Ownership-scoped single-query read — never findUnique + manual check.
    const row = await prisma.discoverySession.findFirst({
      where:  { id: sessionId, userId },
      select: {
        beliefState:   true,
        phase:         true,
        questionCount: true,
        activeField:   true,
        audienceType:  true,
      },
    });
    if (!row) throw new HttpError(404, 'Session not found');

    const context = safeParseDiscoveryContext(row.beliefState);
    const capturedCount = BELIEF_FIELDS.reduce(
      (acc, key) => acc + (context[key].confidence >= MIN_FIELD_CONFIDENCE ? 1 : 0),
      0,
    );
    const completionPct = Math.round((capturedCount / TOTAL_FIELDS) * 100);

    const body: BeliefStateResponse = {
      phase:         (row.phase as InterviewPhase | null) ?? 'ORIENTATION',
      questionCount: row.questionCount,
      audienceType:  (row.audienceType as AudienceType | null) ?? null,
      activeField:   row.activeField ?? null,
      completionPct,
      capturedCount,
      synthTarget:   SYNTH_TARGET,
      context,
    };
    return NextResponse.json(body);
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
