// src/inngest/functions/discovery-session-function.ts
import { inngest } from '../client';
import prisma, { toJsonValue } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildPhaseContext, PHASES } from '@/lib/phase-context';
import {
  getSession,
  deleteSession,
  summariseContext,
  eliminateAlternatives,
  runFinalSynthesis,
} from '@/lib/discovery';
import type { ResearchLogEntry } from '@/lib/research';
import { loadRecommendationContext } from '@/lib/lifecycle';
import { renderFounderProfileBlock, renderCycleSummariesBlock, renderCrossVentureBlock } from '@/lib/lifecycle/prompt-renderers';

/**
 * discoverySessionFunction
 *
 * Triggered by the turn route when the belief state is ready for synthesis.
 * Runs the 3-step prompt chain (summarise → eliminate → generateObject) and
 * persists the validated Recommendation to the database.
 *
 * Event: discovery/synthesis.requested
 * Data:  { sessionId: string, userId: string }
 */
export const discoverySessionFunction = inngest.createFunction(
  {
    id:       'discovery-synthesis',
    name:     'Discovery — Run Synthesis Chain',
    retries:  2,
    timeouts: { start: '10m' },
    triggers: [{ event: 'discovery/synthesis.requested' }],
  },
  async ({ event, step }) => {
    const { sessionId, userId } = event.data as { sessionId: string; userId: string };

    const log = logger.child({
      inngestFunction: 'discoverySynthesis',
      sessionId,
      userId,
      runId: event.id,
    });

    // Step 1: Load the belief state from Redis
    const interviewState = await step.run('load-belief-state', async () => {
      try { await prisma.discoverySession.update({ where: { id: sessionId }, data: { synthesisStep: 'loading' }, select: { id: true } }); } catch { /* non-fatal */ }
      const state = await getSession(sessionId);
      if (!state) throw new Error(`Session ${sessionId} not found in Redis`);
      if (state.userId !== userId) throw new Error(`Session ownership mismatch`);
      return state;
    });

    // Step 2: Summarise context into a coherent factual brief
    const summary = await step.run('summarise-context', async () => {
      try { await prisma.discoverySession.update({ where: { id: sessionId }, data: { synthesisStep: 'summarising' }, select: { id: true } }); } catch { /* non-fatal */ }
      return await summariseContext(interviewState.context);
    });

    // Step 3: Eliminate alternatives and identify the chosen direction.
    // Research runs after this — it targets the specific path chosen, not generic goals.
    const analysis = await step.run('eliminate-alternatives', async () => {
      try { await prisma.discoverySession.update({ where: { id: sessionId }, data: { synthesisStep: 'evaluating' }, select: { id: true } }); } catch { /* non-fatal */ }
      return await eliminateAlternatives(summary);
    });

    // Step 4: Final synthesis with inline research via AI SDK tools.
    //
    // The B1 architecture flipped research from a separate pre-step
    // (synthesis-engine#runResearch) into an in-loop tool the agent
    // chooses to call. The Opus call now exposes exa_search and
    // tavily_search as two independent tools and decides per query
    // which to use; the per-call accumulator captures every tool
    // invocation for the audit log.
    //
    // The accumulator is captured as the step's return value (next
    // to the recommendation) so an Inngest replay reads it from the
    // serialised step state rather than re-running the research.
    // Load lifecycle context (FounderProfile + Cycle Summaries) for
    // the venture this interview belongs to. When no ventureId exists
    // (first-ever interview, pre-lifecycle data), the block is empty
    // and the synthesis runs identically to the pre-lifecycle flow.
    const lifecycleBlock = await step.run('load-lifecycle-context', async () => {
      const ventureId = interviewState.ventureId;
      if (!ventureId) return '';
      const ctx = await loadRecommendationContext(userId, ventureId);
      return [
        renderFounderProfileBlock(ctx.profile),
        renderCycleSummariesBlock(ctx.cycleSummaries),
        renderCrossVentureBlock(ctx.crossVentureSummaries),
      ].filter(b => b.length > 0).join('\n');
    });

    const synthesisResult = await step.run('run-final-synthesis', async () => {
      try { await prisma.discoverySession.update({ where: { id: sessionId }, data: { synthesisStep: 'synthesising' }, select: { id: true } }); } catch { /* non-fatal */ }
      const accumulator: ResearchLogEntry[] = [];
      const recommendation = await runFinalSynthesis({
        summary,
        analysis,
        audienceType: interviewState.audienceType ?? null,
        contextId:    sessionId,
        researchAccumulator: accumulator,
        lifecycleBlock: lifecycleBlock || undefined,
      });
      return { recommendation, researchLog: accumulator };
    });
    const recommendation = synthesisResult.recommendation;

    // Step 6: Persist the recommendation to the database. Use upsert
    // keyed on sessionId (which is @unique on the Recommendation
    // model) so the step is idempotent — Inngest retries this step
    // on transient failure, and a plain create() would produce a
    // duplicate Recommendation row on retry. The upsert update
    // branch overwrites with the same shape we would have created,
    // which is the correct semantic for an idempotent retry.
    // Stage 7.2 idempotency fix.
    // recommendationId is returned for observability / future use
    // (e.g. re-introducing a warm-up behind a flag). It is no longer
    // consumed inside this function now that the warm-up trigger has
    // been removed — acceptance fires the roadmap job instead.
    const { recommendationId: _recommendationId } = await step.run('persist-recommendation', async () => {
      const data = {
        userId,
        sessionId,
        recommendationType:     recommendation.recommendationType,
        summary:                recommendation.summary,
        path:                   recommendation.path,
        reasoning:              recommendation.reasoning,
        firstThreeSteps:        recommendation.firstThreeSteps,
        timeToFirstResult:      recommendation.timeToFirstResult,
        risks:                  recommendation.risks,
        assumptions:            recommendation.assumptions,
        whatWouldMakeThisWrong: recommendation.whatWouldMakeThisWrong,
        alternativeRejected:    recommendation.alternativeRejected,
        // Research audit log — every tool call the agent fired during
        // synthesis (exa_search or tavily_search), with the agent's
        // chosen tool, the query string, and the rendered result
        // summary. Powers QA + training data extraction.
        researchLog:            toJsonValue(synthesisResult.researchLog),
        // Concern 3 — preparatory metadata. No behaviour today.
        phaseContext: toJsonValue(buildPhaseContext(PHASES.RECOMMENDATION, {
          discoverySessionId: sessionId,
        })),
      };
      const rec = await prisma.recommendation.upsert({
        where:  { sessionId },
        create: data,
        update: data,
        select: { id: true },
      });
      log.debug('Recommendation persisted', { sessionId, recommendationId: rec.id });
      return { recommendationId: rec.id };
    });

    // Roadmap warm-up removed. Previously we fired the roadmap
    // generation event here as a speculative pre-build so "This is my
    // path — build my roadmap" felt instant. That optimisation saved
    // 30-60s only for users who accepted on first read; any pushback
    // commit (refine/replace) invalidated the warmed artefact and the
    // regeneration wait still happened on accept. The warm-up also
    // created a class of UX leaks — a built-but-stale roadmap could
    // resurface in the past-recommendations list or via direct URL
    // navigation, and a pre-warmed roadmap built from the pre-pushback
    // recommendation could briefly show through before the STALE→
    // GENERATING flip settled. Roadmap generation is now triggered
    // exclusively by POST /api/discovery/recommendations/[id]/roadmap,
    // which the accept flow fires on the explicit "build my roadmap"
    // click. The roadmap is always built from the recommendation as
    // committed at acceptance time.

    // Clean up Redis — session state is now in DB
    await step.run('cleanup-redis-session', async () => {
      await deleteSession(sessionId);
    });

    log.debug('Synthesis complete', { sessionId });
    return { sessionId, status: 'complete' };
  },
);
