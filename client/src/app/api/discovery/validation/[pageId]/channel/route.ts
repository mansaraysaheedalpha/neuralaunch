// src/app/api/discovery/validation/[pageId]/channel/route.ts
import { NextResponse } from 'next/server';
import { z }           from 'zod';
import { auth }        from '@/auth';
import prisma          from '@/lib/prisma';

/**
 * POST /api/discovery/validation/[pageId]/channel
 *
 * Toggles the completion state of a distribution channel for the given page.
 * Body: { channel: string; completed: boolean }
 * Returns: { channelsCompleted: string[] }
 *
 * Used by the distribution tracker UI so the founder can check off channels
 * as they share their page across the 3 recommended venues.
 */

const BodySchema = z.object({
  channel:   z.string().min(1).max(200),
  completed: z.boolean(),
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

  const page = await prisma.validationPage.findUnique({
    where:  { id: pageId, userId },
    select: { id: true, channelsCompleted: true },
  });

  if (!page) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const current = new Set(page.channelsCompleted);
  if (parsed.data.completed) {
    current.add(parsed.data.channel);
  } else {
    current.delete(parsed.data.channel);
  }

  const updated = await prisma.validationPage.update({
    where: { id: pageId },
    data:  { channelsCompleted: Array.from(current) },
    select: { channelsCompleted: true },
  });

  return NextResponse.json({ channelsCompleted: updated.channelsCompleted });
}
