// src/lib/ideation/stage5-handoff/render-founder-summary.ts
//
// Pure helper: assemble the Stage 1-4 evidence about the founder into
// the `summary` slot that runFinalSynthesis expects. Mirrors what
// summariseContext() does for the legacy Discovery flow — but instead
// of a Sonnet call distilling a free-form belief state, we read off
// the four committed Ideation documents and emit a deterministic,
// templated string.
//
// Output shape (target 1400-2000 chars):
//   THE FOUNDER           — outcome dimensions + their synthesis (600-800)
//   THEIR SKILLS + CONSTRAINTS — Stage 2 expected profile + gaps (400-600)
//   THE PAIN THEY CHOSE   — chosen opportunity + Stage 3 description (400-600)
//
// Security:
//   - Every founder-typed string (synthesis paragraph, rulesOut,
//     pain-point description, founder notes, constraint implication,
//     financial-goal target, etc.) MUST be wrapped via renderUserContent.
//   - Enum values (timeHorizon, riskTolerance, severity, tier, verdict)
//     are system-derived constants — they stay UNWRAPPED.

import 'server-only';
import { renderUserContent } from '@/lib/validation/server-helpers';
import { logger } from '@/lib/logger';
import type { OutcomeDocument } from '../stage1-outcome/schema';
import type { RequirementsDocument } from '../stage2-requirements/schema';
import type { PainInventoryDocument } from '../stage3-opportunities/schema';
import type { ChosenOpportunitySnapshot } from './schema';

// ---------------------------------------------------------------------------
// Char budgets per section. If a founder-typed string would push a
// section over budget, we slice it; enum-derived structure is never
// truncated. Truncation fires `logger.warn` so prod can spot
// pathological inputs.
// ---------------------------------------------------------------------------

const BUDGET_FOUNDER_SECTION_CHARS    = 800;
const BUDGET_SKILLS_SECTION_CHARS     = 600;
const BUDGET_PAIN_SECTION_CHARS       = 600;

const SLICE_SYNTHESIS_PARAGRAPH       = 700;
const SLICE_RULES_OUT                 = 350;
const SLICE_FINANCIAL_TARGET          = 80;
const SLICE_CONSTRAINT_IMPLICATION    = 180;
const SLICE_PAIN_POINT_DESCRIPTION    = 350;
const SLICE_FOUNDER_NOTES             = 200;
const SLICE_COMMUNITY_ORIGIN          = 120;

const log = logger.child({ module: 'stage5/synthesis-bridge' });

// ---------------------------------------------------------------------------
// Per-section renderers
// ---------------------------------------------------------------------------

function renderFounderSection(outcome: OutcomeDocument): string {
  const { dimensions, synthesisParagraph, rulesOut } = outcome;

  // Enum values from the OutcomeDimensions; null-safe because pre-
  // commit a row can be missing a dimension, but post-commit Stage 1
  // requires all four. We render 'unset' for safety so the bridge
  // doesn't crash on a malformed input — the caller (commit #3 route)
  // should be checking readiness before calling, but defence-in-depth.
  const timeHorizon         = dimensions.timeHorizon.value         ?? 'unset';
  const riskTolerance       = dimensions.riskTolerance.value       ?? 'unset';
  const lifestylePreference = dimensions.lifestylePreference.value ?? 'unset';
  const financialGoalShape  = dimensions.financialGoal.value?.shape  ?? 'unset';
  const financialGoalTarget = dimensions.financialGoal.value?.target ?? null;

  const targetLine = financialGoalTarget
    ? `Target: ${renderUserContent(financialGoalTarget, SLICE_FINANCIAL_TARGET)}`
    : 'Target: not yet quantified';

  let section = `THE FOUNDER
- Time horizon: ${timeHorizon}
- Financial goal shape: ${financialGoalShape}
- ${targetLine}
- Risk tolerance: ${riskTolerance}
- Lifestyle preference: ${lifestylePreference}
- Outcome synthesis: ${renderUserContent(synthesisParagraph, SLICE_SYNTHESIS_PARAGRAPH)}
- Rules out: ${renderUserContent(rulesOut, SLICE_RULES_OUT)}`;

  if (section.length > BUDGET_FOUNDER_SECTION_CHARS) {
    log.warn('founder section over budget', { length: section.length, budget: BUDGET_FOUNDER_SECTION_CHARS });
    section = section.slice(0, BUDGET_FOUNDER_SECTION_CHARS);
  }
  return section;
}

function renderSkillsSection(req: RequirementsDocument): string {
  const criticalExpected = req.expectedProfile.filter(e => e.critical);
  // Every GAP_SEVERITIES value ('mild' | 'structural' | 'blind_spot') represents
  // a real gap — there is no "on_track" sentinel. We surface all critical
  // constraints; the brief consumer (Opus phase 1A) decides what to weigh.
  const criticalGaps     = req.constraints.filter(c => c.critical);
  const blocker          = req.structuralBlocker;

  // Render up to 4 most-critical expected entries (deterministic, by
  // their natural order in the Stage 2 document). Per the brief,
  // skills section is supposed to communicate "what they NEED to be
  // good at + where they ARE not."
  const expectedLines = criticalExpected.slice(0, 4).map(e => {
    return `  - ${e.skill}: needs ${e.requiredTier}`;
  }).join('\n');

  const gapLines = criticalGaps.slice(0, 4).map(c => {
    const impl = renderUserContent(c.implication, SLICE_CONSTRAINT_IMPLICATION);
    return `  - ${c.skill}: ${c.gap} (have ${c.actualTier}, need ${c.requiredTier}) — ${impl}`;
  }).join('\n');

  const blockerLine = blocker.triggered
    ? `- Structural blocker: TRIGGERED; founder chose '${blocker.founderChoice}'`
    : `- Structural blocker: not triggered`;

  let section = `THEIR SKILLS + CONSTRAINTS
- Critical expected skills (${criticalExpected.length} total):
${expectedLines || '  (none flagged critical)'}
- Critical gaps (${criticalGaps.length} total):
${gapLines || '  (no critical gaps)'}
${blockerLine}`;

  if (section.length > BUDGET_SKILLS_SECTION_CHARS) {
    log.warn('skills section over budget', { length: section.length, budget: BUDGET_SKILLS_SECTION_CHARS });
    section = section.slice(0, BUDGET_SKILLS_SECTION_CHARS);
  }
  return section;
}

function renderPainSection(
  painDoc: PainInventoryDocument,
  chosen:  ChosenOpportunitySnapshot,
): string {
  // Find the originating pain point from Stage 3 by id. The
  // OpportunityEvaluation.painPointId field is what we'd match — but
  // the ChosenOpportunitySnapshot doesn't carry it; we fall back to
  // the denormalised painPointSummary on the snapshot. We still
  // surface the Stage 3 description verbatim when we can find it,
  // because that's the founder's own framing.
  const matchedPain = painDoc.painPointsSnapshot.find(p =>
    p.description.trim() === chosen.painPointSummary.trim()
  );

  const painDescription = matchedPain
    ? renderUserContent(matchedPain.description, SLICE_PAIN_POINT_DESCRIPTION)
    : renderUserContent(chosen.painPointSummary, SLICE_PAIN_POINT_DESCRIPTION);

  // matchedPain.source is the 'agent' | 'founder' enum (safe unwrapped).
  // communityOrigin is LLM-emitted (pain-scout agent reading a webpage)
  // and could embed prompt-injection bait copied verbatim from the
  // source post — wrap defensively, same posture as the analysis renderer.
  const communityOriginSuffix = matchedPain?.communityOrigin
    ? ` (${renderUserContent(matchedPain.communityOrigin, SLICE_COMMUNITY_ORIGIN)})`
    : '';
  const sourceLine = matchedPain
    ? `- Source: ${matchedPain.source}${communityOriginSuffix}`
    : '- Source: chosen-opportunity snapshot';

  const founderNotes = matchedPain?.founderNotes
    ? `- Founder notes: ${renderUserContent(matchedPain.founderNotes, SLICE_FOUNDER_NOTES)}`
    : '';

  const scores = matchedPain?.founderFinalScores;
  const scoreLine = scores
    ? `- Founder scores: intensity=${scores.intensity}, frequency=${scores.frequency}, niche=${scores.nicheSpecificity}, combined=${matchedPain?.combinedScore ?? 'null'}`
    : '- Founder scores: not set';

  let section = `THE PAIN THEY CHOSE
- Description: ${painDescription}
${sourceLine}
${scoreLine}${founderNotes ? `\n${founderNotes}` : ''}`;

  if (section.length > BUDGET_PAIN_SECTION_CHARS) {
    log.warn('pain section over budget', { length: section.length, budget: BUDGET_PAIN_SECTION_CHARS });
    section = section.slice(0, BUDGET_PAIN_SECTION_CHARS);
  }
  return section;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface RenderFounderSummaryArgs {
  outcomeDocument:     OutcomeDocument;
  requirementsDocument: RequirementsDocument;
  painInventoryDoc:    PainInventoryDocument;
  chosen:              ChosenOpportunitySnapshot;
}

/**
 * Render the founder-side summary block consumed by
 * runFinalSynthesis as its `summary` argument.
 *
 * Pure function — no LLM calls, no DB access. Deterministic given
 * the same inputs. Founder-typed strings are wrapped via
 * renderUserContent (triple-bracket delimiters); enum values from
 * Stage 1-4 documents stay unwrapped because they are system-derived
 * constants.
 *
 * Truncation: per-section char budgets are enforced via `.slice()`
 * with a `logger.warn` so pathological inputs surface in prod logs.
 */
export function renderFounderSummary(args: RenderFounderSummaryArgs): string {
  const founder = renderFounderSection(args.outcomeDocument);
  const skills  = renderSkillsSection(args.requirementsDocument);
  const pain    = renderPainSection(args.painInventoryDoc, args.chosen);
  return `${founder}\n\n${skills}\n\n${pain}`;
}
