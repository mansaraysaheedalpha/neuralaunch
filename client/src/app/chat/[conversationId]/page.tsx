// src/app/chat/[conversationId]/page.tsx
import { notFound, redirect } from 'next/navigation';
import Link                    from 'next/link';
import { auth }                from '@/auth';
import prisma                  from '@/lib/prisma';
import { safeParsePushbackHistory } from '@/lib/discovery/pushback-engine';

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
          recommendation: {
            select: {
              id:              true,
              path:            true,
              pushbackHistory: true,
              acceptedAt:      true,
            },
          },
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

  // Pull the pushback transcript out of the linked recommendation (if any)
  // so the founder can see the full Q&A in one place — interview turns AND
  // pushback turns. Pushback is per-recommendation, interview is
  // per-conversation, but the founder thinks of them as one conversation.
  const pushbackTurns = conversation.discoverySession?.recommendation
    ? safeParsePushbackHistory(conversation.discoverySession.recommendation.pushbackHistory)
    : [];

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
                  'rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap break-words',
                  msg.role === 'user'
                    ? 'self-end bg-primary text-primary-foreground'
                    : 'self-start bg-muted text-foreground',
                ].join(' ')}
              >
                {msg.content}
              </div>
            ))}

            {/* Pushback transcript footer — only when the linked
                recommendation has pushback turns. The interview and the
                pushback are stored separately (different parents) but
                the founder thinks of them as one conversation. */}
            {pushbackTurns.length > 0 && (
              <div className="mt-8 pt-6 border-t border-border flex flex-col gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                    Pushback discussion
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                    The back-and-forth that followed your recommendation, before you committed to a path.
                  </p>
                </div>

                {pushbackTurns.map((turn, i) => (
                  <div
                    key={`pushback-${i}-${turn.round}`}
                    className={[
                      'rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap break-words',
                      turn.role === 'user'
                        ? 'self-end bg-primary text-primary-foreground'
                        : 'self-start bg-muted text-foreground',
                    ].join(' ')}
                  >
                    {turn.content}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
