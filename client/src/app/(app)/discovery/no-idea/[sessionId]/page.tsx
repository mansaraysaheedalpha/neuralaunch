// src/app/(app)/discovery/no-idea/[sessionId]/page.tsx
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { isNoIdeaEnabled } from '@/lib/env';
import {
  safeParseStage1AuthoringState,
  safeParseOutcomeDocument,
  safeParseStage2AuthoringState,
  safeParseRequirementsDocument,
  safeParseStage3AuthoringState,
  safeParsePainInventoryDocument,
  safeParseStage4AuthoringState,
  safeParseOpportunityEvaluationsDocument,
  safeParseSkillInventory,
  createEmptySkillInventory,
} from '@/lib/ideation';
import { Stage1ChatClient } from './Stage1ChatClient';
import { OutcomeDocumentView } from './OutcomeDocumentView';
import { Stage2ChatClient } from './Stage2ChatClient';
import { Stage3ChatClient } from './Stage3ChatClient';
import { Stage4ChatClient } from './Stage4ChatClient';
import { StageBeyondPlaceholder } from './StageBeyondPlaceholder';
import { RequirementsDocumentView } from '@/components/ideation/RequirementsDocumentView';
import { PainInventoryDocumentView } from '@/components/ideation/stage3/PainInventoryDocumentView';
import { OpportunityEvaluationsDocumentView } from '@/components/ideation/stage4/OpportunityEvaluationsDocumentView';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * Stage router for the No Idea archetype.
 *
 * Loads the DiscoverySession + its IdeationStageRun rows once
 * (server-side, ownership-scoped) and decides which surface to render:
 *
 *   - Stage 1 authoring     → Stage1ChatClient
 *   - Stage 1 output_ready  → OutcomeDocumentView (pre-commit review)
 *   - Stage 1 committed     → OutcomeDocumentView (committed)
 *   - Stage 2 authoring     → Stage2ChatClient (canvas + chat)
 *   - Stage 2 output_ready  → RequirementsDocumentView (pre-commit review)
 *   - Stage 2 committed     → RequirementsDocumentView (committed)
 *   - Stage 3 authoring     → Stage3ChatClient (pain inventory + chat)
 *   - Stage 3 output_ready  → PainInventoryDocumentView (pre-commit)
 *   - Stage 3 committed     → PainInventoryDocumentView (committed)
 *   - Stage 4+              → StageBeyondPlaceholder ("coming soon")
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

  // Stage 5 is not implemented yet — the placeholder gets it. Stage 4
  // is handled in the dispatch block below.
  if (active.stageNumber >= 5) {
    return <StageBeyondPlaceholder stageNumber={active.stageNumber} />;
  }

  // Stage 0 should never be the "active" stage — it always commits
  // straight from the mindset page. If we land here on stage 0, the
  // founder bounced back somehow; route them to mindset.
  if (active.stageNumber === 0) {
    redirect('/discovery/no-idea/mindset');
  }

  const messages = (discoverySession.conversation?.messages ?? [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      id:          m.id,
      role:        m.role as 'user' | 'assistant',
      content:     m.content,
      inputMethod: m.inputMethod === 'voice' ? ('voice' as const) : null,
    }));

  // ─── Stage 4 ──────────────────────────────────────────────────────────
  if (active.stageNumber === 4) {
    if (active.status === 'authoring') {
      const state = safeParseStage4AuthoringState(active.output);
      return (
        <Stage4ChatClient
          sessionId={sessionId}
          stageRunId={active.id}
          firstName={firstName}
          initialMessages={messages}
          state={state}
        />
      );
    }
    const doc = safeParseOpportunityEvaluationsDocument(active.output);
    if (!doc) {
      // Output column failed to parse — fall back to the chat with an
      // empty authoring state so the founder can rebuild.
      return (
        <Stage4ChatClient
          sessionId={sessionId}
          stageRunId={active.id}
          firstName={firstName}
          initialMessages={messages}
          state={safeParseStage4AuthoringState(null)}
        />
      );
    }
    return (
      <OpportunityEvaluationsDocumentView
        stageRunId={active.id}
        sessionId={sessionId}
        status={active.status as 'output_ready' | 'committed'}
        document={doc}
      />
    );
  }

  // ─── Stage 3 ──────────────────────────────────────────────────────────
  if (active.stageNumber === 3) {
    if (active.status === 'authoring') {
      const state = safeParseStage3AuthoringState(active.output);
      return (
        <Stage3ChatClient
          sessionId={sessionId}
          stageRunId={active.id}
          firstName={firstName}
          initialMessages={messages}
          state={state}
        />
      );
    }
    // output_ready or committed — render the review surface.
    const doc = safeParsePainInventoryDocument(active.output);
    if (!doc) {
      // Output column failed to parse — fall back to the chat surface
      // with an empty authoring state so the founder can rebuild.
      return (
        <Stage3ChatClient
          sessionId={sessionId}
          stageRunId={active.id}
          firstName={firstName}
          initialMessages={messages}
          state={safeParseStage3AuthoringState(null)}
        />
      );
    }
    return (
      <PainInventoryDocumentView
        stageRunId={active.id}
        sessionId={sessionId}
        status={active.status as 'output_ready' | 'committed'}
        document={doc}
      />
    );
  }

  // ─── Stage 2 ──────────────────────────────────────────────────────────
  if (active.stageNumber === 2) {
    if (active.status === 'authoring') {
      const authoring = safeParseStage2AuthoringState(active.output);
      // Show the mode picker only on truly fresh sessions — no prior
      // messages AND every founder tier still 'unknown' AND no
      // teammates. Computed server-side so the client doesn't
      // replicate the logic.
      const showEntryPicker =
        messages.length === 0
        && authoring.workingInventory.team.length === 0
        && Object.values(authoring.workingInventory.founder.tiers).every(t => t === 'unknown');
      return (
        <Stage2ChatClient
          sessionId={sessionId}
          stageRunId={active.id}
          firstName={firstName}
          initialMessages={messages}
          inventory={authoring.workingInventory}
          hasExpectedProfile={
            authoring.workingExpectedProfile !== null
            && authoring.workingExpectedProfile.length > 0
          }
          requiresRederivation={authoring.requiresRederivation}
          showEntryPicker={showEntryPicker}
        />
      );
    }
    // output_ready or committed — render the review surface.
    const doc = safeParseRequirementsDocument(active.output);
    if (!doc) {
      // Output column failed to parse. Surface the chat with the
      // FounderProfile's current inventory as fallback so the founder
      // can recompose if needed.
      const profile = await prisma.founderProfile.findUnique({
        where:  { userId },
        select: { skillInventory: true },
      });
      const inv = safeParseSkillInventory(profile?.skillInventory ?? null)
        ?? createEmptySkillInventory();
      return (
        <Stage2ChatClient
          sessionId={sessionId}
          stageRunId={active.id}
          firstName={firstName}
          initialMessages={messages}
          inventory={inv}
          hasExpectedProfile={false}
          requiresRederivation={false}
          showEntryPicker={false}
        />
      );
    }
    return (
      <RequirementsDocumentView
        stageRunId={active.id}
        sessionId={sessionId}
        status={active.status as 'output_ready' | 'committed'}
        document={doc}
      />
    );
  }

  // ─── Stage 1 ──────────────────────────────────────────────────────────
  if (active.status === 'authoring') {
    const initialAuthoring = safeParseStage1AuthoringState(active.output);
    return (
      <Stage1ChatClient
        sessionId={sessionId}
        stageRunId={active.id}
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
        stageRunId={active.id}
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
