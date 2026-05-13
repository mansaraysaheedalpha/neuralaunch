// src/app/api/discovery/no-idea/[sessionId]/route.ts
//
// GET /api/discovery/no-idea/[sessionId]
//
// Hydration endpoint for the mobile No Idea Stage 1 screen. Mirrors
// the server-component fetch performed by
// client/src/app/(app)/discovery/no-idea/[sessionId]/page.tsx — auth
// + flag + ownership scope, load the active IdeationStageRun, load the
// recent conversation messages, and return everything the mobile
// dispatcher needs to decide which surface to show.
//
// The web page consumes its data via React Server Components and never
// crosses an API boundary; mobile cannot, so this route exists as the
// REST mirror. Keep response shape stable — mobile clients in the
// field depend on it.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isNoIdeaEnabled } from '@/lib/env';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  safeParseStage1AuthoringState,
  safeParseOutcomeDocument,
  type OutcomeDocument,
} from '@/lib/ideation';

export type Stage1Message = {
  id:          string;
  role:        'user' | 'assistant';
  content:     string;
  inputMethod: 'voice' | null;
};

export type NoIdeaSessionResponse = {
  sessionId: string;
  active: {
    id:          string;
    stageNumber: number;
    status:      'authoring' | 'output_ready' | 'committed';
    output:      unknown | null;
  };
  messages:          Stage1Message[];
  editingDimension:  'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference' | null;
  hasPriorSnapshot:  boolean;
  /** True when status is output_ready/committed but the output JSON
   *  failed to parse. The mobile chat surface will degrade to authoring
   *  mode and let the agent recompose, just like the web page. */
  documentLoadError: boolean;
  /** The parsed Outcome Document for output_ready / committed stage
   *  runs. Null while authoring or when the output JSON failed to
   *  parse (in which case documentLoadError is true). Mobile renders
   *  OutcomeDocumentView from this field — no client-side zod runtime
   *  needed. Shape is OutcomeDocument from @/lib/ideation; clients
   *  declare a parallel TS interface matching the wire format. */
  document: OutcomeDocument | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const userId = await requireUserId(request);
    // API_READ tier — this is a read-only hydration endpoint hit on
    // every Stage 1 screen mount and occasionally after a turn lands.
    await rateLimitByUser(userId, 'no-idea-session-get', RATE_LIMITS.API_READ);

    if (!isNoIdeaEnabled()) {
      throw new HttpError(400, 'no_idea archetype is not enabled in this environment');
    }

    const { sessionId } = await params;

    const discoverySession = await prisma.discoverySession.findFirst({
      where:  { id: sessionId, userId },
      select: {
        id:           true,
        status:       true,
        ideationRuns: {
          select: {
            id:          true,
            stageNumber: true,
            status:      true,
            output:      true,
          },
          orderBy: { stageNumber: 'desc' },
        },
        conversation: {
          select: {
            messages: {
              select:  { id: true, role: true, content: true, inputMethod: true, createdAt: true },
              orderBy: { createdAt: 'asc' },
              take:    400,
            },
          },
        },
      },
    });

    if (!discoverySession) {
      throw new HttpError(404, 'Session not found');
    }

    // Locate the active stage row — first non-committed, else highest-
    // numbered (matches the page.tsx dispatch logic).
    const runs = discoverySession.ideationRuns;
    const active = runs.find(r => r.status !== 'committed') ?? runs[0];
    if (!active) {
      throw new HttpError(404, 'No ideation stage runs for session');
    }

    // Default values for Stage 1 metadata. Only meaningful when the
    // active run is Stage 1 in authoring/output_ready/committed.
    let editingDimension:  NoIdeaSessionResponse['editingDimension'] = null;
    let hasPriorSnapshot   = false;
    let documentLoadError  = false;
    let document: OutcomeDocument | null = null;

    if (active.stageNumber === 1) {
      if (active.status === 'authoring') {
        const authoring = safeParseStage1AuthoringState(active.output);
        editingDimension = authoring.editTargetDimension;
        hasPriorSnapshot = authoring.priorCommittedSnapshot !== null;
      } else {
        // output_ready or committed — parse the document once on the
        // server so mobile receives a typed shape. A null result means
        // the row's output JSON is malformed; mobile shows the
        // recovery banner and degrades to authoring.
        document = safeParseOutcomeDocument(active.output);
        if (!document) documentLoadError = true;
      }
    }

    const messages: Stage1Message[] = (discoverySession.conversation?.messages ?? [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        id:          m.id,
        role:        m.role as 'user' | 'assistant',
        content:     m.content,
        inputMethod: m.inputMethod === 'voice' ? 'voice' : null,
      }));

    const response: NoIdeaSessionResponse = {
      sessionId: discoverySession.id,
      active: {
        id:          active.id,
        stageNumber: active.stageNumber,
        status:      active.status as 'authoring' | 'output_ready' | 'committed',
        output:      active.output,
      },
      messages,
      editingDimension,
      hasPriorSnapshot,
      documentLoadError,
      document,
    };

    return NextResponse.json(response);
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
