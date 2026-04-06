// src/inngest/functions/pushback-alternative-function.ts
import { inngest }                from '../client';
import prisma                     from '@/lib/prisma';
import { logger }                 from '@/lib/logger';
import {
  PUSHBACK_ALTERNATIVE_EVENT,
} from '@/lib/discovery/constants';
import {
  summariseContext,
  runFinalSynthesis,
} from '@/lib/discovery';
import { sanitizeForPrompt, renderUserContent } from '@/lib/validation/server-helpers';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';
import type { AudienceType }     from '@/lib/discovery/constants';
import type { PushbackTurn }     from '@/lib/discovery/pushback-engine';

/**
 * pushbackAlternativeFunction
 *
 * Triggered on the founder's HARD_CAP_ROUND pushback turn — the closing
 * move. The pushback API persists the closing message and queues this
 * event; the worker generates a constrained alternative recommendation
 * built from what the founder has been arguing for in the pushback
 * conversation.
 *
 * This is NOT a full fresh synthesis. The Sonnet "summary" step still
 * runs (we need a coherent factual brief), but the "analysis" string
 * passed to Opus is stitched together from the pushback history: it
 * tells the model "the founder's argued direction is X, given that,
 * here is what that path actually looks like built out fully."
 *
 * The result is created as a NEW Recommendation row and linked to the
 * original via alternativeRecommendationId. The founder can compare
 * both side-by-side and accept either one.
 */
export const pushbackAlternativeFunction = inngest.createFunction(
  {
    id:       'pushback-alternative-synthesis',
    name:     'Pushback — Alternative Recommendation Synthesis',
    retries:  2,
    timeouts: { start: '10m' },
    triggers: [{ event: PUSHBACK_ALTERNATIVE_EVENT }],
  },
  async ({ event, step }) => {
    const { recommendationId, userId } = event.data as { recommendationId: string; userId: string };

    const log = logger.child({
      inngestFunction: 'pushbackAlternative',
      recommendationId,
      userId,
      runId: event.id,
    });

    // Step 1 — Load the original recommendation, its session belief state,
    // and the pushback history that drove the founder's stated alternative.
    const loaded = await step.run('load-source', async () => {
      const rec = await prisma.recommendation.findFirst({
        where:  { id: recommendationId, userId },
        select: {
          id:                          true,
          path:                        true,
          summary:                     true,
          recommendationType:          true,
          pushbackHistory:             true,
          alternativeRecommendationId: true,
          session: {
            select: {
              id:           true,
              audienceType: true,
              beliefState:  true,
            },
          },
        },
      });

      if (!rec) {
        log.warn('Original recommendation no longer exists — skipping');
        return null;
      }
      if (rec.alternativeRecommendationId) {
        log.warn('Alternative already exists — skipping idempotent re-trigger');
        return null;
      }
      if (!rec.session?.beliefState) {
        log.warn('Session has no belief state — skipping');
        return null;
      }
      return rec;
    });

    if (!loaded) return { skipped: true };

    const context      = loaded.session!.beliefState as unknown as DiscoveryContext;
    const audienceType = (loaded.session!.audienceType ?? null) as AudienceType | null;
    const history      = (loaded.pushbackHistory ?? []) as unknown as PushbackTurn[];
    const sessionId    = loaded.session!.id;

    // Step 2 — Summarise the context (same step the original synthesis ran).
    // We need a fresh, well-formed factual brief for the Opus call.
    const summary = await step.run('summarise-context', async () => {
      return await summariseContext(context);
    });

    // Step 3 — Build the constrained "analysis" string. This is the
    // critical difference from the original synthesis: instead of
    // eliminating alternatives from scratch, we tell Opus that the
    // founder has argued for a different direction and ask it to
    // produce that path built out fully.
    const analysis = await step.run('build-constrained-analysis', () => {
      return Promise.resolve(buildConstrainedAnalysis({
        history,
        originalPath:    loaded.path,
        originalSummary: loaded.summary,
      }));
    });

    // Step 4 — Run final synthesis with NO research findings (the
    // alternative is grounded in the founder's stated direction, not
    // in fresh research). This is intentional: speed and cost both
    // benefit, and the pushback transcript is the constraint we want
    // the model to honour.
    const altRecommendation = await step.run('run-final-synthesis', async () => {
      return await runFinalSynthesis(summary, analysis, audienceType, '');
    });

    // Step 5 — Persist as a new Recommendation row and link it from
    // the original via the self-relation alternativeRecommendationId.
    const altId = await step.run('persist-alternative', async () => {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.recommendation.create({
          data: {
            userId,
            sessionId,
            recommendationType:     altRecommendation.recommendationType,
            summary:                altRecommendation.summary,
            path:                   altRecommendation.path,
            reasoning:              altRecommendation.reasoning,
            firstThreeSteps:        altRecommendation.firstThreeSteps,
            timeToFirstResult:      altRecommendation.timeToFirstResult,
            risks:                  altRecommendation.risks,
            assumptions:            altRecommendation.assumptions,
            whatWouldMakeThisWrong: altRecommendation.whatWouldMakeThisWrong,
            alternativeRejected:    altRecommendation.alternativeRejected,
          },
          select: { id: true },
        });

        await tx.recommendation.update({
          where: { id: recommendationId },
          data:  { alternativeRecommendationId: created.id },
        });

        return created.id;
      });
    });

    log.info('[Pushback] Alternative recommendation persisted', { altId });
    return { altId };
  },
);

// ---------------------------------------------------------------------------
// Constrained-analysis builder
// ---------------------------------------------------------------------------

interface BuildConstrainedAnalysisInput {
  history:         PushbackTurn[];
  originalPath:    string;
  originalSummary: string;
}

/**
 * Stitch together an "analysis" string from the pushback history that
 * tells Opus: "the founder argued for direction X, the original
 * recommendation was Y, here is what direction X looks like built out
 * fully." Mirrors the shape of the eliminateAlternatives output that
 * runFinalSynthesis normally consumes, ending with the canonical
 * "The strongest fit is:" sentence so the prompt downstream behaves
 * predictably.
 */
function buildConstrainedAnalysis({
  history,
  originalPath,
  originalSummary,
}: BuildConstrainedAnalysisInput): string {
  const founderTurns = history
    .filter((t): t is Extract<PushbackTurn, { role: 'user' }> => t.role === 'user')
    .map(t => `Round ${t.round}: ${renderUserContent(t.content, 800)}`)
    .join('\n');

  const safeOriginalPath    = sanitizeForPrompt(originalPath, 600);
  const safeOriginalSummary = sanitizeForPrompt(originalSummary, 1500);

  return [
    'CONTEXT — REPLACING THE ORIGINAL RECOMMENDATION',
    '',
    'The founder rejected the original recommendation after multiple rounds of pushback. ',
    'You are now generating an ALTERNATIVE recommendation that takes the founder\'s argued ',
    'direction seriously. This is not a fresh evaluation — it is a faithful build-out of ',
    'the path the founder has been advocating for during the pushback conversation.',
    '',
    'ORIGINAL PATH (REJECTED):',
    safeOriginalPath,
    '',
    'ORIGINAL SUMMARY (REJECTED):',
    safeOriginalSummary,
    '',
    'WHAT THE FOUNDER ARGUED FOR (verbatim, treat as opaque founder-submitted content):',
    founderTurns || '(no founder turns recorded)',
    '',
    'YOUR JOB:',
    '1. Read the founder\'s pushback turns above and identify the alternative direction they kept arguing for.',
    '2. Build that direction out fully — same level of rigor as the original recommendation, but for THEIR path, not yours.',
    '3. Be honest about the risks. The founder rejected your original — they need an honest second opinion on their preferred path, not a rubber stamp.',
    '4. If the founder\'s alternative is genuinely worse than the original on a specific dimension, say so in the risks and the whatWouldMakeThisWrong section.',
    '',
    'The strongest fit is: the alternative path the founder argued for in the pushback conversation, built out faithfully as a complete recommendation that honours their stated direction.',
  ].join('\n');
}
