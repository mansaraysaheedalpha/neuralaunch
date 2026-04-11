// src/app/api/discovery/roadmaps/[id]/diagnostic/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { inngest } from '@/inngest/client';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  CONTINUATION_BRIEF_EVENT,
  CONTINUATION_STATUSES,
  DIAGNOSTIC_HARD_CAP_TURNS,
  evaluateScenario,
  loadContinuationEvidence,
  runDiagnosticTurn,
  buildDiagnosticTurnPair,
  nextStatusForVerdict,
} from '@/lib/continuation';

export const maxDuration = 60;

const BodySchema = z.object({
  message: z.string().min(1).max(3000),
});

/**
 * POST /api/discovery/roadmaps/[id]/diagnostic
 *
 * One round of the diagnostic chat for Scenarios A and B. Calls the
 * diagnostic engine, persists both turns into Roadmap.diagnosticHistory,
 * and applies the verdict via nextStatusForVerdict (release_to_brief
 * is the only verdict that flips status; everything else keeps the
 * chat open at DIAGNOSING). See lib/continuation/diagnostic-engine.ts
 * for the verdict semantics.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'roadmap-diagnostic', RATE_LIMITS.AI_GENERATION);

    const { id: roadmapId } = await params;
    const log = logger.child({ route: 'POST roadmap-diagnostic', roadmapId, userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const loaded = await loadContinuationEvidence({ roadmapId, userId });
    if (!loaded.ok) {
      if (loaded.reason === 'not_found') throw new HttpError(404, 'Not found');
      if (loaded.reason === 'no_belief_state')
        throw new HttpError(409, 'Roadmap is missing its parent recommendation context');
      throw new HttpError(409, 'Roadmap content is malformed');
    }
    const evidence = loaded.evidence;

    if (evidence.continuationStatus !== CONTINUATION_STATUSES.DIAGNOSING) {
      throw new HttpError(409, 'Diagnostic is not active for this roadmap. Hit "What\'s Next?" first.');
    }

    // Hard cap on diagnostic agent turns — defence in depth alongside
    // the model's own 5-turn self-imposed rule in the prompt.
    const agentTurnCount = evidence.diagnosticHistory.filter(t => t.role === 'agent').length;
    if (agentTurnCount >= DIAGNOSTIC_HARD_CAP_TURNS) {
      throw new HttpError(409, 'Diagnostic conversation has reached its turn cap. Either accept the brief or start a fresh discovery session.');
    }

    // Re-evaluate from live counters — the founder may have completed
    // a task between checkpoint and this POST, in which case skip the
    // chat and queue the brief directly.
    const evaluation = evaluateScenario({
      totalTasks:     evidence.progress.totalTasks,
      completedTasks: evidence.progress.completedTasks,
    });
    if (evaluation.scenario !== 'A' && evaluation.scenario !== 'B') {
      await prisma.roadmap.update({
        where: { id: roadmapId },
        data:  { continuationStatus: CONTINUATION_STATUSES.GENERATING_BRIEF },
      });
      await inngest.send({ name: CONTINUATION_BRIEF_EVENT, data: { roadmapId, userId } });
      return NextResponse.json({ skippedToBrief: true, scenario: evaluation.scenario });
    }

    const response = await runDiagnosticTurn({
      scenario:              evaluation.scenario,
      founderMessage:        parsed.data.message,
      history:               evidence.diagnosticHistory,
      context:               evidence.context,
      recommendationPath:    evidence.recommendation.path,
      recommendationSummary: evidence.recommendation.summary,
      totalTasks:            evidence.progress.totalTasks,
      completedTasks:        evidence.progress.completedTasks,
      blockedTasks:          evidence.progress.blockedTasks,
      motivationAnchor:      evidence.motivationAnchor,
      roadmapId,
    });

    const { founderTurn, agentTurn } = buildDiagnosticTurnPair({
      founderMessage: parsed.data.message,
      agentResponse:  response,
    });
    const newHistory = [...evidence.diagnosticHistory, founderTurn, agentTurn];
    const nextStatus = nextStatusForVerdict(response.verdict);
    const releasing  = nextStatus === CONTINUATION_STATUSES.GENERATING_BRIEF;

    await prisma.roadmap.update({
      where: { id: roadmapId },
      data:  {
        diagnosticHistory:  toJsonValue(newHistory),
        continuationStatus: nextStatus,
      },
    });

    if (releasing) {
      await inngest.send({
        name: CONTINUATION_BRIEF_EVENT,
        data: { roadmapId, userId },
      });
      log.info('[Diagnostic] Released to brief generation');
    } else {
      log.info('[Diagnostic] Turn persisted', { verdict: response.verdict });
    }

    return NextResponse.json({
      agent:           agentTurn,
      releasedToBrief: releasing,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
