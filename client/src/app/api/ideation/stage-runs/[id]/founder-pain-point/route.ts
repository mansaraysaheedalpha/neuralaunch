// src/app/api/ideation/stage-runs/[id]/founder-pain-point/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import {
  enforceSameOrigin,
  HttpError,
  httpErrorToResponse,
  rateLimitByUser,
  RATE_LIMITS,
  requireUserId,
} from '@/lib/validation/server-helpers';
import {
  requireOwnedStageRun,
  safeParseStage3AuthoringState,
  persistFounderPainPoint,
  persistReplacePainPoint,
  persistRemovePainPoint,
  buildPainPoint,
  applyFounderScores,
  allPainPoints,
} from '@/lib/ideation';
import {
  FOUNDER_CONTEXT_TAGS,
} from '@neuralaunch/constants';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Body schemas — one per method
// ---------------------------------------------------------------------------

const PostSchema = z.object({
  description:    z.string().min(1).max(600),
  founderContext: z.enum(FOUNDER_CONTEXT_TAGS).nullable(),
  founderNotes:   z.string().max(600).nullable(),
});

const PatchSchema = z.union([
  // Founder edit of an existing pain point (description / context / notes).
  z.object({
    kind:           z.literal('edit'),
    id:             z.string().min(1),
    description:    z.string().min(1).max(600).optional(),
    founderContext: z.enum(FOUNDER_CONTEXT_TAGS).nullable().optional(),
    founderNotes:   z.string().max(600).nullable().optional(),
  }),
  // Founder applies final scores (any source — agent or founder pain point).
  z.object({
    kind: z.literal('score'),
    id:   z.string().min(1),
    scores: z.object({
      intensity:        z.number(),
      frequency:        z.number(),
      nicheSpecificity: z.number(),
    }),
  }),
]);

const DeleteSchema = z.object({
  id: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST — add a founder-sourced pain point (Human Scout layer)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-founder-pain-point', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 3) throw new HttpError(409, 'Not a Stage 3 run');
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'Stage 3 row is not in authoring state');
    }

    const pp = buildPainPoint({
      source:         'founder',
      description:    parsed.data.description,
      founderContext: parsed.data.founderContext,
      founderNotes:   parsed.data.founderNotes,
    });
    await persistFounderPainPoint(id, userId, pp);

    logger.child({ route: 'POST /api/ideation/stage-runs/[id]/founder-pain-point', userId, stageRunId: id })
          .debug('Founder pain point added', { painPointId: pp.id });

    return NextResponse.json({ ok: true, painPoint: pp });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH — edit or score
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-founder-pain-point', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 3) throw new HttpError(409, 'Not a Stage 3 run');
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'Stage 3 row is not in authoring state');
    }

    const state  = safeParseStage3AuthoringState(run.output);
    const target = allPainPoints(state).find(p => p.id === parsed.data.id);
    if (!target) throw new HttpError(404, 'Pain point not found');

    if (parsed.data.kind === 'edit') {
      // Editing description/context/notes is only allowed for founder-
      // sourced pain points. Agent-sourced rows are read-only on the
      // founder-edit path — the founder can reject (DELETE) or rate
      // (kind='score') them, but not rewrite their description.
      if (target.source !== 'founder') {
        throw new HttpError(403, 'You can only edit pain points you added yourself. Push back on agent-surfaced picks instead.');
      }
      const next = {
        ...target,
        description:    parsed.data.description    ?? target.description,
        founderContext: parsed.data.founderContext === undefined
          ? target.founderContext
          : parsed.data.founderContext,
        founderNotes:   parsed.data.founderNotes   === undefined
          ? target.founderNotes
          : parsed.data.founderNotes,
      };
      await persistReplacePainPoint(id, userId, target.id, next);

      logger.child({ route: 'PATCH /api/ideation/stage-runs/[id]/founder-pain-point', userId, stageRunId: id })
            .debug('Pain point edited', { painPointId: target.id });

      return NextResponse.json({ ok: true, painPoint: next });
    }

    // kind === 'score'
    const next = applyFounderScores(target, parsed.data.scores);
    await persistReplacePainPoint(id, userId, target.id, next);

    logger.child({ route: 'PATCH /api/ideation/stage-runs/[id]/founder-pain-point', userId, stageRunId: id })
          .debug('Pain point scored', { painPointId: target.id, combined: next.combinedScore });

    return NextResponse.json({ ok: true, painPoint: next });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove a pain point (founder rejection)
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    enforceSameOrigin(req);
    const userId = await requireUserId(req);
    await rateLimitByUser(userId, 'ideation-founder-pain-point', RATE_LIMITS.API_AUTHENTICATED);

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); }
    catch { throw new HttpError(400, 'Invalid JSON'); }
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, 'Invalid body');

    const run = await requireOwnedStageRun(id, userId);
    if (run.stageNumber !== 3) throw new HttpError(409, 'Not a Stage 3 run');
    if (run.status !== 'authoring') {
      throw new HttpError(409, 'Stage 3 row is not in authoring state');
    }

    await persistRemovePainPoint(id, userId, parsed.data.id);

    logger.child({ route: 'DELETE /api/ideation/stage-runs/[id]/founder-pain-point', userId, stageRunId: id })
          .debug('Pain point removed', { painPointId: parsed.data.id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
