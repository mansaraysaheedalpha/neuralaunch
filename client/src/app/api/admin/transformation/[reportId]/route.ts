// src/app/api/admin/transformation/[reportId]/route.ts
//
// Admin-only PATCH endpoint for the public-archive moderation
// queue. Three actions, each fully transactional:
//
//   approve    — flip publishState 'pending_review' → 'public',
//                mint publicSlug if absent, stamp outcomeLabel,
//                persist moderator-edited cardSummary, set
//                publishedAt + reviewedAt
//   send_back  — flip publishState 'pending_review' → 'private',
//                store reviewNotes (visible to the founder),
//                set reviewedAt. The founder's transformation
//                viewer surfaces these notes as a banner.
//   decline    — flip publishState 'pending_review' → 'unpublished',
//                store reviewNotes (internal only — the founder
//                never sees these, the row is preserved for
//                later analysis), set reviewedAt.
//
// Allow-list-gated via assertAdminOrThrow. Same-origin checked,
// rate-limited per admin user.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma, { toJsonValue } from '@/lib/prisma';
import {
  HttpError,
  httpErrorToResponse,
  enforceSameOrigin,
  rateLimitByUser,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';
import { assertAdminOrThrow } from '@/lib/auth/admin';
import {
  TransformationCardSummarySchema,
  OUTCOME_LABELS,
} from '@/lib/transformation';
import { mintPublicSlug } from '@/lib/transformation/public';
import { logger } from '@/lib/logger';

const ApproveActionSchema = z.object({
  action:       z.literal('approve'),
  outcomeLabel: z.enum(OUTCOME_LABELS),
  cardSummary:  TransformationCardSummarySchema,
});

const SendBackActionSchema = z.object({
  action:      z.literal('send_back'),
  reviewNotes: z.string().min(1).max(2000),
});

const DeclineActionSchema = z.object({
  action:      z.literal('decline'),
  reviewNotes: z.string().min(1).max(2000),
});

const PatchBodySchema = z.discriminatedUnion('action', [
  ApproveActionSchema,
  SendBackActionSchema,
  DeclineActionSchema,
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    enforceSameOrigin(request);
    const admin = await assertAdminOrThrow();
    await rateLimitByUser(admin.userId, 'admin-transformation', RATE_LIMITS.API_AUTHENTICATED);

    const { reportId } = await params;
    const log = logger.child({ route: 'PATCH admin/transformation', reportId, adminUserId: admin.userId });

    let body: unknown;
    try { body = await request.json(); } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
    const parsed = PatchBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid action payload');
    }

    // Existence + state read. The action handlers each verify the
    // current state is valid for the requested transition, so a
    // stale tab can't double-approve or accidentally re-publish a
    // declined story.
    const report = await prisma.transformationReport.findUnique({
      where: { id: reportId },
      select: {
        id:           true,
        stage:        true,
        publishState: true,
        publicSlug:   true,
        venture:      { select: { id: true, name: true } },
      },
    });
    if (!report) throw new HttpError(404, 'Report not found');
    if (report.stage !== 'complete') {
      throw new HttpError(409, 'Report is not ready for moderation (stage is not complete).');
    }

    const now = new Date();

    if (parsed.data.action === 'approve') {
      if (report.publishState !== 'pending_review') {
        throw new HttpError(409, `Cannot approve a report whose publishState is '${report.publishState}'.`);
      }

      // Mint slug only when absent (idempotent for re-approvals
      // after an unpublish, which is theoretically possible if
      // we ever add an unpublish→pending_review path later).
      const slug = report.publicSlug ?? mintPublicSlug(report.venture.name);

      await prisma.transformationReport.update({
        where: { id: reportId },
        data: {
          publishState: 'public',
          outcomeLabel: parsed.data.outcomeLabel,
          cardSummary:  toJsonValue(parsed.data.cardSummary),
          publicSlug:   slug,
          publishedAt:  now,
          reviewedAt:   now,
          // Approval clears any prior send-back notes; they were
          // only relevant to the founder's revision pass.
          reviewNotes:  null,
        },
        select: { id: true },
      });

      log.info('Story approved + published', {
        ventureName: report.venture.name,
        slug,
        outcomeLabel: parsed.data.outcomeLabel,
      });
      return NextResponse.json({ ok: true, publicSlug: slug });
    }

    if (parsed.data.action === 'send_back') {
      if (report.publishState !== 'pending_review') {
        throw new HttpError(409, `Cannot send back a report whose publishState is '${report.publishState}'.`);
      }
      await prisma.transformationReport.update({
        where: { id: reportId },
        data: {
          publishState: 'private',
          reviewNotes:  parsed.data.reviewNotes,
          reviewedAt:   now,
        },
        select: { id: true },
      });
      log.info('Story sent back to founder', { ventureName: report.venture.name });
      return NextResponse.json({ ok: true });
    }

    // decline
    if (report.publishState !== 'pending_review') {
      throw new HttpError(409, `Cannot decline a report whose publishState is '${report.publishState}'.`);
    }
    await prisma.transformationReport.update({
      where: { id: reportId },
      data: {
        publishState: 'unpublished',
        reviewNotes:  parsed.data.reviewNotes,
        reviewedAt:   now,
      },
      select: { id: true },
    });
    log.info('Story declined silently', { ventureName: report.venture.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return httpErrorToResponse(err);
  }
}

