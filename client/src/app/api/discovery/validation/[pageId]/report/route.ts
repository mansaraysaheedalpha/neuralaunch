// src/app/api/discovery/validation/[pageId]/report/route.ts
import { NextResponse } from 'next/server';
import { z }           from 'zod';
import { auth }        from '@/auth';
import prisma          from '@/lib/prisma';

/**
 * POST /api/discovery/validation/[pageId]/report
 *
 * Updates the ValidationReport attached to the page. Currently the only
 * supported mutation is toggling usedForMvp — the handoff flag that marks
 * this build brief as the founder's committed MVP specification.
 *
 * Body: { usedForMvp: boolean }
 */

const BodySchema = z.object({
  usedForMvp: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = session.user.id;

  const { pageId } = await params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Verify ownership via the page
  const page = await prisma.validationPage.findUnique({
    where:  { id: pageId, userId },
    select: { report: { select: { id: true } } },
  });

  if (!page?.report) {
    return NextResponse.json({ error: 'No report on this page yet' }, { status: 404 });
  }

  const updated = await prisma.validationReport.update({
    where: { id: page.report.id },
    data:  { usedForMvp: parsed.data.usedForMvp },
    select: { usedForMvp: true },
  });

  return NextResponse.json({ usedForMvp: updated.usedForMvp });
}
