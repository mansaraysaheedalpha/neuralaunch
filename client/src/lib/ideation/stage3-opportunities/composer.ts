// src/lib/ideation/stage3-opportunities/composer.ts
//
// Composes the PainInventoryDocument from the authoring state:
//   1. Pick the top-N rated viable pain points by combinedScore
//      (N capped at SHORTLIST_CAP = 5)
//   2. LLM call to generate rulesOut prose — "why these N and not
//      others"
//   3. Snapshot the full inventory, freeze with composedAt
//
// The shortlist selection is DETERMINISTIC; the LLM only writes
// the rulesOut prose.

import 'server-only';
import { generateText, Output } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { renderUserContent } from '@/lib/validation/server-helpers';
import { withModelFallback } from '@/lib/ai/with-model-fallback';
import { cachedUserMessages } from '@/lib/ai/prompt-cache';
import {
  withAgentSpan,
  ATTR_AGENT_TIER,
  ATTR_AGENT_MODEL,
  ATTR_TOKENS_INPUT,
  ATTR_TOKENS_OUTPUT,
  ATTR_LATENCY_TOTAL_MS,
} from '@/lib/observability';
import {
  MODELS,
  SHORTLIST_CAP,
  PAIN_INVENTORY_COMPOSITION_MAX_TOKENS,
  MIN_PAIN_POINTS_FOR_COMMIT,
} from './constants';
import { STAGE3_SYSTEM_PROMPT } from './calibration-prompts';
import { allPainPoints, viableForShortlist, safeParsePainInventoryDocument } from './state';
import type { OutcomeDocument } from '../stage1-outcome/schema';
import type { RequirementsDocument } from '../stage2-requirements/schema';
import type { PainInventoryDocument, PainPoint, Stage3AuthoringState } from './schema';

// ---------------------------------------------------------------------------
// rulesOut LLM call
// ---------------------------------------------------------------------------

const RulesOutSchema = z.object({
  rulesOut: z.string().describe(
    `2-4 sentences explaining why the shortlist contains these specific pain points and not the others. Reference combinedScore, niche specificity, or fit with the founder's outcome — be concrete. Aim for 300-600 chars; the post-parse clamp truncates anything longer.`,
  ),
});

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function composePainInventoryDocument(args: {
  state:                Stage3AuthoringState;
  outcomeDocument:      OutcomeDocument;
  requirementsDocument: RequirementsDocument;
}): Promise<PainInventoryDocument> {
  const { state, outcomeDocument, requirementsDocument } = args;

  // ── Pre-check: enough rated viable pain points? ──────────────────────
  const viable = viableForShortlist(state);
  if (viable.length < MIN_PAIN_POINTS_FOR_COMMIT) {
    throw new Error(
      `Cannot compose: only ${viable.length} rated viable pain points (need ${MIN_PAIN_POINTS_FOR_COMMIT}).`,
    );
  }

  // ── Deterministic shortlist selection ────────────────────────────────
  // Sort by combinedScore desc. Stable sort preserves first-seen
  // order when scores tie (founder rated them in order).
  const ranked = [...viable].sort((a, b) => (b.combinedScore ?? 0) - (a.combinedScore ?? 0));
  const shortlistedIds = ranked.slice(0, SHORTLIST_CAP).map(p => p.id);

  // ── LLM pass for rulesOut prose ──────────────────────────────────────
  const shortlistedSet  = new Set(shortlistedIds);
  const shortlistedPPs  = ranked.filter(p => shortlistedSet.has(p.id));
  const rejectedPPs     = ranked.filter(p => !shortlistedSet.has(p.id));

  const composed = await runRulesOutPhase({
    shortlist:           shortlistedPPs,
    rejected:            rejectedPPs,
    outcomeDocument,
    requirementsDocument,
  });

  // ── Assemble + safeParse round-trip (applies clamps) ────────────────
  const candidate: PainInventoryDocument = {
    painPointsSnapshot: allPainPoints(state),
    shortlist:          shortlistedIds,
    shortlistFloor:     3,
    shortlistTarget:    5,
    shortlistCap:       5,
    rulesOut:           composed.rulesOut,
    recommendedActions: state.recommendedActions,
    researchLog:        state.researchLog,
    composedAt:         new Date().toISOString(),
  };

  const parsed = safeParsePainInventoryDocument(candidate);
  if (!parsed) {
    throw new Error('Composer produced a document that failed PainInventoryDocument validation');
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// rulesOut prompt + call
// ---------------------------------------------------------------------------

async function runRulesOutPhase(args: {
  shortlist:            PainPoint[];
  rejected:             PainPoint[];
  outcomeDocument:      OutcomeDocument;
  requirementsDocument: RequirementsDocument;
}): Promise<{ rulesOut: string }> {
  const { shortlist, rejected, outcomeDocument } = args;

  const renderPP = (p: PainPoint): string =>
    `- "${renderUserContent(p.description, 200)}" (combined=${p.combinedScore})`;

  const stable = [
    STAGE3_SYSTEM_PROMPT,
    `Founder's outcome synthesis: ${renderUserContent(outcomeDocument.synthesisParagraph, 600)}`,
    `Outcome rules-out: ${renderUserContent(outcomeDocument.rulesOut, 400)}`,
  ].join('\n\n');

  const volatile = [
    `Shortlist (${shortlist.length} pain points):\n${shortlist.map(renderPP).join('\n')}`,
    rejected.length > 0
      ? `Rejected (${rejected.length} pain points):\n${rejected.map(renderPP).join('\n')}`
      : 'No pain points were rejected from the shortlist — the inventory fit within the cap.',
    'Write the rulesOut paragraph now. Be specific — name what the shortlist has in common, name what the rejected pain points were missing. 2-4 sentences. No bullet lists.',
  ].join('\n\n');

  return await withAgentSpan(
    {
      name: 'ideation.stage3.compose',
      attributes: {
        [ATTR_AGENT_TIER]: 3,
        [ATTR_AGENT_MODEL]: MODELS.INTERVIEW,
      },
    },
    (setAttr) => withModelFallback<z.infer<typeof RulesOutSchema>>(
      'stage3.compose',
      { primary: MODELS.INTERVIEW, fallback: MODELS.INTERVIEW_FALLBACK_1 },
      async (modelId) => {
        const start = Date.now();
        const result = await generateText({
          model:           aiSdkAnthropic(modelId),
          output:          Output.object({ schema: RulesOutSchema }),
          messages:        cachedUserMessages(stable, volatile),
          maxOutputTokens: PAIN_INVENTORY_COMPOSITION_MAX_TOKENS,
        });
        setAttr(ATTR_LATENCY_TOTAL_MS, Date.now() - start);
        const usage = result.usage as { inputTokens?: number; outputTokens?: number } | undefined;
        if (usage?.inputTokens  != null) setAttr(ATTR_TOKENS_INPUT,  usage.inputTokens);
        if (usage?.outputTokens != null) setAttr(ATTR_TOKENS_OUTPUT, usage.outputTokens);
        return result.output;
      },
    ),
  );
}
