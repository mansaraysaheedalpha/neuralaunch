// src/app/api/discovery/ventures/[ventureId]/transformation/route.ts
//
// GET — return the transformation-report row for the venture so the
// private viewer can render either the step-progress ladder (during
// generation) or the finished report (once stage='complete').
//
// Ownership-scoped via findFirst({ ventureId, userId }) — a leaked
// ventureId cannot read another user's report.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import {
  safeParseTransformationReport,
  RedactionEditsSchema,
  RedactionCandidatesArraySchema,
  TRANSFORMATION_PUBLISH_STATES,
} from '@/lib/transformation';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ventureId: string }> },
) {
  try {
    const userId = await requireUserId();
    // Polling endpoint — use the read-tier cap so the client can
    // refresh frequently while a report is in flight.
    await rateLimitByUser(userId, 'transformation-status', RATE_LIMITS.API_READ);

    const { ventureId } = await params;

    const report = await prisma.transformationReport.findFirst({
      where:  { ventureId, userId },
      select: {
        id:                  true,
        stage:               true,
        errorMessage:        true,
        startedAt:           true,
        updatedAt:           true,
        completedAt:         true,
        content:             true,
        redactionCandidates: true,
        redactionEdits:      true,
        publishState:        true,
        publicSlug:          true,
        publishedAt:         true,
        venture: { select: { id: true, name: true, status: true } },
      },
    });

    if (!report) {
      // 404 here means either the venture doesn't exist for this
      // user OR Mark Complete has not been clicked yet. The viewer
      // page will redirect on this.
      throw new HttpError(404, 'Transformation report not found');
    }

    // Validate the JSONB columns through their schemas so a
    // corrupt row surfaces as `null` (or `[]`) on the wire instead
    // of breaking the renderer with malformed shapes.
    const candidatesParsed = report.redactionCandidates
      ? RedactionCandidatesArraySchema.safeParse(report.redactionCandidates)
      : null;
    const editsParsed = report.redactionEdits
      ? RedactionEditsSchema.safeParse(report.redactionEdits)
      : null;

    return NextResponse.json({
      id:                  report.id,
      stage:               report.stage,
      errorMessage:        report.errorMessage,
      startedAt:           report.startedAt.toISOString(),
      updatedAt:           report.updatedAt.toISOString(),
      completedAt:         report.completedAt?.toISOString() ?? null,
      content:             safeParseTransformationReport(report.content),
      redactionCandidates: candidatesParsed?.success ? candidatesParsed.data : [],
      redactionEdits:      editsParsed?.success      ? editsParsed.data      : {},
      publishState:        report.publishState,
      publicSlug:          report.publicSlug,
      publishedAt:         report.publishedAt?.toISOString() ?? null,
      venture:             report.venture,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH — two orthogonal payloads:
//
//   { redactionEdits } → save the founder's keep/redact/replace
//                        choices. Idempotent. Does NOT publish.
//   { action: 'publish' } → flip publishState to 'pending_review'.
//                        Locks in the redactionEdits as the
//                        snapshot the publish render reads.
//                        No public archive UI yet — the row sits.
//   { action: 'unpublish' } → flip publishState to 'unpublished'
//                        if it was 'public' or 'pending_review'.
//                        Frees the venture for future reopen if
//                        within the 24h window.
//
// All paths are ownership-scoped via findFirst({ ventureId, userId }).
// ---------------------------------------------------------------------------

const PatchBodySchema = z.object({
  redactionEdits: RedactionEditsSchema.optional(),
  action:         z.enum(['publish', 'unpublish']).optional(),
}).refine(
  (v) => v.redactionEdits !== undefined || v.action !== undefined,
  { message: 'Body must include redactionEdits or action' },
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ventureId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const userId = await requireUserId();
    await rateLimitByUser(userId, 'transformation-patch', RATE_LIMITS.API_AUTHENTICATED);

    const { ventureId } = await params;

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = PatchBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid body — provide redactionEdits or action');
    }

    const report = await prisma.transformationReport.findFirst({
      where:  { ventureId, userId },
      select: { id: true, stage: true, publishState: true },
    });
    if (!report) throw new HttpError(404, 'Transformation report not found');

    if (report.stage !== 'complete') {
      throw new HttpError(
        409,
        'The report is still generating. Wait for it to finish before saving redactions or publishing.',
      );
    }

    const data: {
      redactionEdits?: ReturnType<typeof toJsonValue>;
      publishState?:   typeof TRANSFORMATION_PUBLISH_STATES[number];
      publishedAt?:    Date | null;
    } = {};

    if (parsed.data.redactionEdits !== undefined) {
      data.redactionEdits = toJsonValue(parsed.data.redactionEdits);
    }

    if (parsed.data.action === 'publish') {
      // 'private' or 'unpublished' → 'pending_review'. The
      // pending_review state means the founder consented + finished
      // the redaction step, but the row is sitting in the DB
      // until the public archive ships (separate work).
      if (report.publishState === 'public' || report.publishState === 'pending_review') {
        throw new HttpError(409, 'This report is already in the publish pipeline.');
      }
      data.publishState = 'pending_review';
    }

    if (parsed.data.action === 'unpublish') {
      if (report.publishState === 'private') {
        throw new HttpError(409, 'This report has not been shared.');
      }
      data.publishState = 'unpublished';
      data.publishedAt  = null;
    }

    await prisma.transformationReport.update({
      where: { id: report.id },
      data,
      select: { id: true },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
