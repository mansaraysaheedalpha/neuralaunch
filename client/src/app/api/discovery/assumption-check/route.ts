// src/app/api/discovery/assumption-check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { streamText } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import {
  checkRateLimit, RATE_LIMITS, getRequestIdentifier, getClientIp,
} from '@/lib/rate-limit';
import { MODELS } from '@/lib/discovery';

const RequestSchema = z.object({
  assumption: z.string().min(1).max(500),
  path:       z.string().max(500),
  reasoning:  z.string().max(2000),
});

/**
 * POST /api/discovery/assumption-check
 *
 * Streams a short, scoped response explaining how the recommendation
 * changes if a specific assumption turns out to be false.
 * Does not rebuild the recommendation — scoped to the flagged assumption only.
 */
export async function POST(req: NextRequest) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const userId = authSession.user.id;

  const clientIp = getClientIp(req.headers);
  const rateLimitResult = await checkRateLimit({
    ...RATE_LIMITS.DISCOVERY_TURN,
    identifier: getRequestIdentifier(userId, clientIp),
  });
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter ?? 60) } },
    );
  }

  const body: unknown = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { assumption, path, reasoning } = parsed.data;

  const result = streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system: `You give short, honest, specific answers about how startup recommendations change when their underlying assumptions are wrong. You never rebuild the whole recommendation — you scope your answer to the specific assumption only. 2-3 sentences maximum.`,
    messages: [{
      role:    'user',
      content: `Recommendation: "${path}"
Reasoning: "${reasoning}"
Assumption that does NOT apply to this person: "${assumption}"

In 2-3 plain sentences: explain specifically what changes about this recommendation if this assumption is false. Be concrete — reference the assumption and the recommendation directly. End with what they should consider instead.`,
    }],
  });

  const response = new NextResponse(result.textStream);
  response.headers.set('Content-Type', 'text/plain; charset=utf-8');
  return response;
}
