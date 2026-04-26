// src/app/api/discovery/ventures/[ventureId]/transformation/route.ts
//
// GET — return the transformation-report row for the venture so the
// private viewer can render either the step-progress ladder (during
// generation) or the finished report (once stage='complete').
//
// Ownership-scoped via findFirst({ ventureId, userId }) — a leaked
// ventureId cannot read another user's report.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  requireUserId,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { safeParseTransformationReport } from '@/lib/transformation';

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
        id:           true,
        stage:        true,
        errorMessage: true,
        startedAt:    true,
        updatedAt:    true,
        completedAt:  true,
        content:      true,
        publishState: true,
        publicSlug:   true,
        publishedAt:  true,
        venture:      { select: { id: true, name: true, status: true } },
      },
    });

    if (!report) {
      // 404 here means either the venture doesn't exist for this
      // user OR Mark Complete has not been clicked yet. The viewer
      // page will redirect on this.
      throw new HttpError(404, 'Transformation report not found');
    }

    return NextResponse.json({
      id:           report.id,
      stage:        report.stage,
      errorMessage: report.errorMessage,
      startedAt:    report.startedAt.toISOString(),
      updatedAt:    report.updatedAt.toISOString(),
      completedAt:  report.completedAt?.toISOString() ?? null,
      // Validate against the schema before sending — a corrupt row
      // surfaces as null content rather than a malformed render.
      content:      safeParseTransformationReport(report.content),
      publishState: report.publishState,
      publicSlug:   report.publicSlug,
      publishedAt:  report.publishedAt?.toISOString() ?? null,
      venture:      report.venture,
    });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
