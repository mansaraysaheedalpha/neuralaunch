// src/app/chat/[conversationId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import Link                    from 'next/link';
import { auth }                from '@/auth';
import prisma                  from '@/lib/prisma';

/**
 * /chat/[conversationId] — read-only transcript view
 *
 * Renders the full back-and-forth of a discovery interview: the questions
 * the agent asked and the answers the founder gave, in chronological order.
 *
 * Linked from:
 *   - The sidebar conversation list (every past interview)
 *   - "View interview transcript →" on the recommendation pages
 *
 * Header surfaces a context-aware action:
 *   - If the session is COMPLETE and has a recommendation
 *       → "View recommendation →"
 *   - If the session is ACTIVE / INCOMPLETE
 *       → "Resume interview →"
 *   - If no discovery session is linked (orphan from old schema)
 *       → no action link, just the transcript
 *
 * Owner-only. Returns 404 for any conversation not owned by the caller.
 */
export default async function ChatTranscriptPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const { conversationId } = await params;

  const conversation = await prisma.conversation.findFirst({
    where:  { id: conversationId, userId },
    select: {
      id:        true,
      title:     true,
      createdAt: true,
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

  const messages = await prisma.message.findMany({
    where:   { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    select:  {
      id:        true,
      role:      true,
      content:   true,
      createdAt: true,
    },
  });

  // Build the contextual action link
  const ds = conversation.discoverySession;
  let actionHref:  string | null = null;
  let actionLabel: string | null = null;
  if (ds?.status === 'COMPLETE' && ds.recommendation?.id) {
    actionHref  = `/discovery/recommendations/${ds.recommendation.id}`;
    actionLabel = 'View recommendation →';
  } else if (ds && ds.status !== 'COMPLETE') {
    actionHref  = '/discovery';
    actionLabel = 'Resume interview →';
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-foreground truncate">{conversation.title}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Interview transcript · {conversation.createdAt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
        </div>
        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="shrink-0 text-xs text-primary hover:underline underline-offset-2"
          >
            {actionLabel}
          </Link>
        )}
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">No messages in this conversation yet.</p>
            {ds && ds.status !== 'COMPLETE' && (
              <Link
                href="/discovery"
                className="mt-3 text-xs text-primary hover:underline"
              >
                Continue the interview →
              </Link>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={[
                  'rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'self-end bg-primary text-primary-foreground'
                    : 'self-start bg-muted text-foreground',
                ].join(' ')}
              >
                {msg.content}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
