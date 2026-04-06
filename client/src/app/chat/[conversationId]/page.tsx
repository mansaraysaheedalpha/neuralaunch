// src/app/chat/[conversationId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';

/**
 * /chat/[conversationId] is a legacy URL kept alive as a redirect router.
 *
 * The old chat experience was removed during the Phase 3 cleanup, but
 * stable links to this URL still exist in the recommendation pages
 * ("View interview transcript →") and the sidebar conversation list.
 * Rather than rewriting every call site, this thin server component
 * resolves the conversation and forwards to the canonical destination.
 *
 * Routing rules:
 *   1. Conversation has a COMPLETE discovery session with a recommendation
 *      → /discovery/recommendations/[recommendationId]
 *   2. Conversation has an ACTIVE/INCOMPLETE discovery session
 *      → /discovery  (which will detect and resume the session)
 *   3. Conversation has no discovery session at all (orphan from the old
 *      pre-Phase-3 schema) → /discovery
 *   4. Conversation does not exist OR belongs to another user → 404
 */
export default async function ChatRedirectPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const { conversationId } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      id: true,
      discoverySession: {
        select: {
          id:     true,
          status: true,
          recommendation: { select: { id: true } },
        },
      },
    },
  });

  if (!conversation) notFound();

  const ds = conversation.discoverySession;
  if (ds?.recommendation?.id && ds.status === 'COMPLETE') {
    redirect(`/discovery/recommendations/${ds.recommendation.id}`);
  }

  // Active session, incomplete session, or orphan conversation — send to
  // the discovery landing page. Resume detection happens there.
  redirect('/discovery');
}
