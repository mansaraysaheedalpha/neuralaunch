// src/app/(app)/discovery/no-idea/[sessionId]/page.tsx
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { isNoIdeaEnabled } from '@/lib/env';
import { safeParseStage1AuthoringState, safeParseOutcomeDocument } from '@/lib/ideation';
import { Stage1ChatClient } from './Stage1ChatClient';
import { OutcomeDocumentView } from './OutcomeDocumentView';
import { Stage2Placeholder } from './Stage2Placeholder';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * Stage router for the No Idea archetype.
 *
 * Loads the DiscoverySession + its IdeationStageRun rows once (server-
 * side, ownership-scoped) and decides which surface to render:
 *
 *   - Stage 1 authoring     → Stage1ChatClient (chat surface)
 *   - Stage 1 output_ready  → OutcomeDocumentView in pre-commit review
 *   - Stage 1 committed     → OutcomeDocumentView in committed mode
 *                             (read-only with edit / Stage 2 affordance)
 *   - Stage 2+              → Stage2Placeholder ("coming soon")
 *
 * Guards: auth + flag + ownership (findFirst with userId scope).
 */
export default async function NoIdeaStagePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  if (!isNoIdeaEnabled())  redirect('/discovery');

  const userId = session.user.id;
  const firstName = session.user.name?.split(' ')[0] ?? '';
  const { sessionId } = await params;

  const discoverySession = await prisma.discoverySession.findFirst({
    where:  { id: sessionId, userId },
    select: {
      id:             true,
      status:         true,
      ideationRuns: {
        select: {
          id:          true,
          stageNumber: true,
          status:      true,
          output:      true,
        },
        orderBy: { stageNumber: 'desc' },
      },
      conversation: {
        select: {
          messages: {
            select: { id: true, role: true, content: true, inputMethod: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
            take:    400,
          },
        },
      },
    },
  });

  if (!discoverySession) notFound();

  // Locate the active stage row — first non-committed, else highest-
  // numbered (when all committed, we surface the next stage).
  const active =
    discoverySession.ideationRuns.find(r => r.status !== 'committed')
    ?? discoverySession.ideationRuns[0];

  if (!active) notFound();

  // Stages 2..5 are not implemented yet.
  if (active.stageNumber >= 2) {
    return <Stage2Placeholder stageNumber={active.stageNumber} />;
  }

  // Stage 0 should never be the "active" stage — it always commits
  // straight from the mindset page. If we land here on stage 0, the
  // founder bounced back somehow; route them to mindset.
  if (active.stageNumber === 0) {
    redirect('/discovery/no-idea/mindset');
  }

  // ─── Stage 1 ──────────────────────────────────────────────────────────
  if (active.status === 'authoring') {
    const initialAuthoring = safeParseStage1AuthoringState(active.output);
    const messages = (discoverySession.conversation?.messages ?? [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        id:          m.id,
        role:        m.role as 'user' | 'assistant',
        content:     m.content,
        inputMethod: m.inputMethod === 'voice' ? ('voice' as const) : null,
      }));

    return (
      <Stage1ChatClient
        sessionId={sessionId}
        firstName={firstName}
        initialMessages={messages}
        editingDimension={initialAuthoring.editTargetDimension}
        hasPriorSnapshot={initialAuthoring.priorCommittedSnapshot !== null}
      />
    );
  }

  // status is 'output_ready' or 'committed' — render the document.
  const document = safeParseOutcomeDocument(active.output);
  if (!document) {
    // Output column failed to parse — the founder lost the composed
    // document. Surface a "we couldn't load this" by routing back to
    // the chat in a degraded state (the chat handler will recompose
    // if readiness still holds, or continue authoring otherwise).
    return (
      <Stage1ChatClient
        sessionId={sessionId}
        firstName={firstName}
        initialMessages={[]}
        editingDimension={null}
        hasPriorSnapshot={false}
        documentLoadError
      />
    );
  }

  return (
    <OutcomeDocumentView
      stageRunId={active.id}
      sessionId={sessionId}
      status={active.status as 'output_ready' | 'committed'}
      document={document}
    />
  );
}
