// src/app/api/discovery/recommendations/[id]/roadmap/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { inngest } from '@/inngest/client';
import { ROADMAP_EVENT } from '@/lib/roadmap';
import { z } from 'zod';

const ParamsSchema = z.object({ id: z.string().min(1) });

/**
 * POST /api/discovery/recommendations/[id]/roadmap
 *
 * Triggers the roadmap generation Inngest function for the given recommendation.
 * Returns 202 immediately — the roadmap is generated asynchronously.
 * Returns 409 if a READY roadmap already exists.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid recommendation ID' }, { status: 400 });
  }

  const { id: recommendationId } = parsed.data;
  const userId = session.user.id;

  // Verify ownership
  const recommendation = await prisma.recommendation.findUnique({
    where:  { id: recommendationId },
    select: { userId: true, roadmap: { select: { status: true } } },
  });

  if (!recommendation) {
    return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 });
  }
  if (recommendation.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (recommendation.roadmap?.status === 'READY') {
    return NextResponse.json({ error: 'Roadmap already exists' }, { status: 409 });
  }

  await inngest.send({
    name: ROADMAP_EVENT,
    data: { recommendationId, userId },
  });

  return NextResponse.json({ status: 'generating' }, { status: 202 });
}

/**
 * GET /api/discovery/recommendations/[id]/roadmap
 *
 * Returns the current roadmap status and data for polling from the UI.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid recommendation ID' }, { status: 400 });
  }

  const roadmap = await prisma.roadmap.findUnique({
    where:  { recommendationId: parsed.data.id },
    select: {
      id:             true,
      status:         true,
      phases:         true,
      closingThought: true,
      weeklyHours:    true,
      totalWeeks:     true,
      createdAt:      true,
    },
  });

  if (!roadmap) {
    return NextResponse.json({ status: 'not_started' }, { status: 200 });
  }

  return NextResponse.json(roadmap, { status: 200 });
}
