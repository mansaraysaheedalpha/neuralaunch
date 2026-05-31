// src/app/api/discovery/roadmaps/[id]/continuation/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  safeParseContinuationBrief,
  safeParseDiagnosticHistory,
  safeParseParkingLot,
  loadValidationSignal,
  type ValidationSignal,
} from '@/lib/continuation';
import { isLegacyBrief } from '@/lib/continuation/brief-schema';
import type { ExecutionMetrics } from '@/lib/continuation';
import { requireTierOrThrow } from '@/lib/auth/require-tier';

export const maxDuration = 300;

/**
 * GET /api/discovery/roadmaps/[id]/continuation
 *
 * Polling endpoint the client uses while the brief is being
 * generated and to render the brief once it lands. Returns:
 *
 *   - continuationStatus  — null | CHECKING | DIAGNOSING |
 *                           GENERATING_BRIEF | BRIEF_READY |
 *                           FORK_SELECTED
 *   - continuationBrief   — full brief once status is BRIEF_READY
 *   - diagnosticHistory   — full chat transcript (Scenario A/B only)
 *   - parkingLot          — full parking-lot array
 *
 * READ-only. Read-tier rate limit. The client polls this every few
 * seconds while status is GENERATING_BRIEF.
 *
 * Tier gate: Execute+. The continuation brief is shipped to both paid
 * tiers as of 2026-04-28; Compound's differentiation is multi-venture
 * scale + cross-venture memory + 15-round pushback + voice, NOT
 * exclusive access to continuation. Cross-venture memory itself stays
 * Compound-only and is gated inside loadCrossVentureSummaries — Execute
 * users get a brief built from THEIR venture's signals only.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await requireTierOrThrow(userId, 'execute');
    await rateLimitByUser(userId, 'roadmap-continuation-read', RATE_LIMITS.API_READ);

    const { id: roadmapId } = await params;

    const row = await prisma.roadmap.findFirst({
      where:  { id: roadmapId, userId },
      select: {
        id:                 true,
        continuationStatus: true,
        continuationBrief:  true,
        diagnosticHistory:  true,
        parkingLot:         true,
        executionMetrics:   true,
        parentRoadmapId:    true,
        ventureId:          true,
        // Cover-stats source — read from the same place PR 07's
        // RoadmapView reads from so the brief cover figures reconcile
        // exactly with the roadmap stats strip.
        progress: {
          select: {
            totalTasks:     true,
            completedTasks: true,
          },
        },
      },
    });
    if (!row) throw new HttpError(404, 'Not found');

    // Cover stats — computed at READ time so they always reflect the
    // current roadmap (no drift from a frozen snapshot). Derived hours
    // come from the persisted ExecutionMetrics; validation signal is
    // loaded from the venture (null when no landing page exists).
    const metrics = (row.executionMetrics ?? null) as ExecutionMetrics | null;
    const validation: ValidationSignal | null = row.ventureId
      ? await loadValidationSignal(row.ventureId)
      : null;
    const brief = safeParseContinuationBrief(row.continuationBrief);

    // PR 16-data — 4th cover stat. The brief's §III evidence ledger
    // already ranks signals from highest-density first; lifting the
    // top row gives the founder a single concrete number / observation
    // on the cover ("price tolerance · 2 of 4 paid $40"). Null on V1
    // legacy briefs (whatTheEvidenceSays was prose, not a structured
    // ledger) and on empty / pre-BRIEF_READY states. Truncated server-
    // side so the stat card never needs to handle long values.
    let keyOutcomeMetric: { label: string; value: string } | null = null;
    if (brief && !isLegacyBrief(brief)) {
      const firstSignal = brief.whatTheEvidenceSays?.[0];
      if (firstSignal) {
        keyOutcomeMetric = {
          label: firstSignal.metric.slice(0, 60),
          value: firstSignal.reading.slice(0, 160),
        };
      }
    }

    const coverStats = {
      tasksComplete:       row.progress?.completedTasks ?? 0,
      tasksTotal:          row.progress?.totalTasks ?? 0,
      derivedHoursPerWeek: metrics?.derivedWeeklyHours ?? null,
      statedHoursPerWeek:  metrics?.statedWeeklyHours ?? null,
      paceLabel:           metrics?.paceLabel ?? null,
      validationSignal:    validation?.signalStrength ?? null,
      keyOutcomeMetric,
    };

    return NextResponse.json({
      id:                row.id,
      continuationStatus: row.continuationStatus,
      brief,
      diagnosticHistory: safeParseDiagnosticHistory(row.diagnosticHistory),
      parkingLot:        safeParseParkingLot(row.parkingLot),
      executionMetrics:  row.executionMetrics ?? null,
      parentRoadmapId:   row.parentRoadmapId,
      coverStats,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
