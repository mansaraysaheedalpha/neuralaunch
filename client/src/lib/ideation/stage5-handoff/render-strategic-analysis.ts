// src/lib/ideation/stage5-handoff/render-strategic-analysis.ts
//
// Pure helper: assemble the Stage 4 evidence about the chosen
// opportunity AND the alternatives into the `analysis` slot that
// runFinalSynthesis expects. Mirrors what eliminateAlternatives()
// does for the legacy Discovery flow — instead of a Sonnet call
// ranking 3 hypothetical directions, we render the actual Stage 4
// evaluations:
//   - the chosen opportunity gets a full Layer A + Layer B breakdown
//   - each reserve gets a compact entry with a mechanical
//     "why not chosen" template derived from agentVerdict, founderVerdict,
//     and Layer B validationStrength.
//
// Output shape (target 3500-4800 chars):
//   OPPORTUNITY UNDER EVALUATION — chosen pain + agent reasoning (800-1000)
//   LAYER A — 4-dimension findings (1500-2000)
//   LAYER B — community signal (800-1200)
//   ALTERNATIVES CONSIDERED — reserves with mechanical rejection prose (400-600)
//
// Per the brief's approved decisions:
//   Q1 — Citations: render count + distinct platforms (NOT full URLs)
//   Q2 — Per-reserve "why not chosen": mechanical template over
//        (agentVerdict, founderVerdict, validationStrength) — NOT LLM
//
// Security:
//   - Every founder-typed string AND every LLM-emitted reasoning string
//     (Layer A reasoning, key quotes, contradictions, agent reasoning)
//     is wrapped via renderUserContent. Anthropic's structured-output
//     emissions are NOT user-typed but they DID flow through the model
//     and could embed prompt-injection bait copied verbatim from a
//     founder's screenshot — wrap defensively.
//   - Enum values (verdict, validation strength, severity) stay
//     unwrapped — system-derived constants.

import 'server-only';
import { renderUserContent } from '@/lib/validation/server-helpers';
import { logger } from '@/lib/logger';
import type {
  OpportunityEvaluation,
  DimensionFinding,
  Citation,
} from '../stage4-opportunities/schema';
import type { ChosenOpportunitySnapshot, ReserveOpportunity } from './schema';

// ---------------------------------------------------------------------------
// Char budgets per section
// ---------------------------------------------------------------------------

const BUDGET_CHOSEN_SECTION_CHARS      = 1000;
const BUDGET_LAYER_A_SECTION_CHARS     = 2000;
const BUDGET_LAYER_B_SECTION_CHARS     = 1200;
const BUDGET_ALTERNATIVES_SECTION_CHARS = 600;

const SLICE_AGENT_REASONING            = 400;
const SLICE_PAIN_SUMMARY               = 400;
const SLICE_DIMENSION_REASONING        = 350;
const SLICE_KEY_QUOTE                  = 200;
const SLICE_CONTRADICTION              = 200;
const SLICE_RESERVE_PAIN_SUMMARY       = 180;

const log = logger.child({ module: 'stage5/synthesis-bridge' });

// ---------------------------------------------------------------------------
// Citation collapsing — per Q1, render count + distinct platforms
// (NOT full URLs). Saves ~800 chars per dimension and avoids leaking
// raw URLs into the prompt where they could be misinterpreted.
// ---------------------------------------------------------------------------

function summariseCitations(citations: ReadonlyArray<Citation>): string {
  if (citations.length === 0) return 'no citations';
  const platforms = Array.from(new Set(
    citations.map(c => c.sourcePlatform).filter(p => p.trim().length > 0),
  )).sort();
  if (platforms.length === 0) {
    return `${citations.length} citation${citations.length === 1 ? '' : 's'} (no platform metadata)`;
  }
  return `${citations.length} citation${citations.length === 1 ? '' : 's'} across ${platforms.join(', ')}`;
}

function renderDimension(label: string, finding: DimensionFinding): string {
  return `  ${label}:
    reasoning: ${renderUserContent(finding.reasoning, SLICE_DIMENSION_REASONING)}
    confidence: ${finding.confidence.toFixed(2)}
    citations: ${summariseCitations(finding.citations)}`;
}

// ---------------------------------------------------------------------------
// Section renderers — chosen opportunity
// ---------------------------------------------------------------------------

function renderChosenSection(chosen: ChosenOpportunitySnapshot): string {
  let section = `OPPORTUNITY UNDER EVALUATION
- Pain point: ${renderUserContent(chosen.painPointSummary, SLICE_PAIN_SUMMARY)}
- Agent verdict: ${chosen.agentVerdict}
- Founder verdict: ${chosen.founderVerdict}
- Agent reasoning: ${renderUserContent(chosen.agentReasoning, SLICE_AGENT_REASONING)}`;

  if (section.length > BUDGET_CHOSEN_SECTION_CHARS) {
    log.warn('chosen section over budget', { length: section.length, budget: BUDGET_CHOSEN_SECTION_CHARS });
    section = section.slice(0, BUDGET_CHOSEN_SECTION_CHARS);
  }
  return section;
}

/**
 * Render the chosen Layer A section. We prefer the full Stage 4
 * `OpportunityEvaluation.layerAResearch` (which carries DimensionFinding
 * with citations) when present, because Q1 wants citation count +
 * distinct platforms in the analysis prompt. We fall back to the
 * stripped `ChosenOpportunitySnapshot.layerASummary` (no citations)
 * when the full row isn't available — that branch reports "citations
 * not available in snapshot."
 */
function renderLayerASection(
  chosen:    ChosenOpportunitySnapshot,
  chosenRow: OpportunityEvaluation | null,
): string {
  const full = chosenRow?.layerAResearch ?? null;
  if (full) {
    let section = `LAYER A — 4-DIMENSION RESEARCH
${renderDimension('Market Reality',  full.marketReality)}
${renderDimension('Customer Access', full.customerAccess)}
${renderDimension('Will People Pay', full.willPeoplePay)}
${renderDimension('Market Size',     full.marketSize)}`;
    if (section.length > BUDGET_LAYER_A_SECTION_CHARS) {
      log.warn('layer A section over budget', { length: section.length, budget: BUDGET_LAYER_A_SECTION_CHARS });
      section = section.slice(0, BUDGET_LAYER_A_SECTION_CHARS);
    }
    return section;
  }

  // Snapshot fallback — reasoning + confidence only, no citation metadata.
  const layerA = chosen.layerASummary;
  if (!layerA) {
    return `LAYER A — 4-DIMENSION RESEARCH
(Layer A research was not completed for this opportunity.)`;
  }
  const fromSummary = (label: string, f: { reasoning: string; confidence: number }) =>
    `  ${label}:
    reasoning: ${renderUserContent(f.reasoning, SLICE_DIMENSION_REASONING)}
    confidence: ${f.confidence.toFixed(2)}
    citations: not available in snapshot`;
  let section = `LAYER A — 4-DIMENSION RESEARCH
${fromSummary('Market Reality',  layerA.marketReality)}
${fromSummary('Customer Access', layerA.customerAccess)}
${fromSummary('Will People Pay', layerA.willPeoplePay)}
${fromSummary('Market Size',     layerA.marketSize)}`;
  if (section.length > BUDGET_LAYER_A_SECTION_CHARS) {
    log.warn('layer A section over budget', { length: section.length, budget: BUDGET_LAYER_A_SECTION_CHARS });
    section = section.slice(0, BUDGET_LAYER_A_SECTION_CHARS);
  }
  return section;
}

function renderLayerBSection(chosen: ChosenOpportunitySnapshot): string {
  const layerB = chosen.layerBSummary;
  if (!layerB) {
    return `LAYER B — COMMUNITY ENGAGEMENT
(No community responses were captured for this opportunity.)`;
  }
  const { validationStrength, sentimentBreakdown, keyQuotes, contradictionsRaised } = layerB;

  const quoteLines = keyQuotes.slice(0, 4).map(q =>
    `  - ${renderUserContent(q, SLICE_KEY_QUOTE)}`
  ).join('\n');
  const contradictionLines = contradictionsRaised.slice(0, 4).map(c =>
    `  - ${renderUserContent(c, SLICE_CONTRADICTION)}`
  ).join('\n');

  let section = `LAYER B — COMMUNITY ENGAGEMENT
- Validation strength: ${validationStrength}
- Sentiment: ${sentimentBreakdown.positive} positive, ${sentimentBreakdown.neutral} neutral, ${sentimentBreakdown.negative} negative
- Key quotes (${keyQuotes.length} total):
${quoteLines || '  (none)'}
- Contradictions raised (${contradictionsRaised.length} total):
${contradictionLines || '  (none)'}`;

  if (section.length > BUDGET_LAYER_B_SECTION_CHARS) {
    log.warn('layer B section over budget', { length: section.length, budget: BUDGET_LAYER_B_SECTION_CHARS });
    section = section.slice(0, BUDGET_LAYER_B_SECTION_CHARS);
  }
  return section;
}

// ---------------------------------------------------------------------------
// Mechanical "why not chosen" template — Q2 approved
//
// Enumerates the finite combinations of (agentVerdict, founderVerdict,
// validationStrength) and returns a deterministic, honest phrase. No
// LLM call. Enum-only inputs so the output never embeds founder text.
// ---------------------------------------------------------------------------

function whyNotChosenTemplate(reserve: ReserveOpportunity): string {
  const { agentVerdict, founderVerdict } = reserve;
  const layerBStrength = reserve.layerBSummary?.validationStrength ?? null;

  // Strongest signal first: explicit founder drop is the most
  // unambiguous reason a reserve wasn't picked.
  if (founderVerdict === 'drop') {
    return 'founder explicitly dropped this option';
  }

  // Agent flagged caveats → that's the headline reason.
  if (agentVerdict === 'pursue_with_caveats') {
    if (layerBStrength === 'contradictory') {
      return 'agent flagged caveats and community engagement was contradictory';
    }
    if (layerBStrength === 'weak') {
      return 'agent flagged caveats and community engagement was weak';
    }
    return 'agent flagged caveats around this opportunity';
  }

  // Agent said drop → that's the headline.
  if (agentVerdict === 'drop') {
    return 'agent recommended dropping this opportunity';
  }

  // Agent said pursue but Layer B was negative.
  if (agentVerdict === 'pursue' && layerBStrength === 'contradictory') {
    return 'agent recommended pursue but community engagement was contradictory';
  }
  if (agentVerdict === 'pursue' && layerBStrength === 'weak') {
    return 'agent recommended pursue but community engagement was weak';
  }

  // Founder hadn't yet weighed in — neutral framing.
  if (founderVerdict === null) {
    return 'founder did not commit a verdict before advancing the chosen opportunity';
  }

  // Founder picked pursue_with_caveats → softer rejection.
  if (founderVerdict === 'pursue_with_caveats') {
    return 'founder marked pursue-with-caveats; chosen opportunity ranked higher';
  }

  // Fallback — both verdicts are 'pursue' but the chosen one outranked.
  return 'positive signal but ranked below the chosen opportunity';
}

function renderAlternativesSection(reserves: ReadonlyArray<ReserveOpportunity>): string {
  if (reserves.length === 0) {
    return `ALTERNATIVES CONSIDERED
(No alternative opportunities were evaluated — only one shortlist entry survived.)`;
  }

  const lines = reserves.map(r => {
    const why = whyNotChosenTemplate(r);
    return `- rank ${r.rank}: ${renderUserContent(r.painPointSummary, SLICE_RESERVE_PAIN_SUMMARY)} — ${why}`;
  }).join('\n');

  let section = `ALTERNATIVES CONSIDERED
${lines}`;

  if (section.length > BUDGET_ALTERNATIVES_SECTION_CHARS) {
    log.warn('alternatives section over budget', { length: section.length, budget: BUDGET_ALTERNATIVES_SECTION_CHARS });
    section = section.slice(0, BUDGET_ALTERNATIVES_SECTION_CHARS);
  }
  return section;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface RenderStrategicAnalysisArgs {
  chosen:   ChosenOpportunitySnapshot;
  /**
   * Optional — the full Stage 4 OpportunityEvaluation row for the
   * chosen opportunity. When present we render Layer A with citation
   * count + distinct platforms (Q1); when absent we fall back to the
   * snapshot summary (reasoning + confidence only).
   */
  chosenRow: OpportunityEvaluation | null;
  reserves:  ReadonlyArray<ReserveOpportunity>;
}

/**
 * Render the strategic-analysis block consumed by runFinalSynthesis
 * as its `analysis` argument.
 *
 * Pure function — no LLM calls, no DB access. Deterministic given
 * the same inputs. Founder-typed AND LLM-emitted reasoning strings
 * are wrapped via renderUserContent; enum values stay unwrapped.
 *
 * The reserve "why not chosen" prose comes from a mechanical
 * enum-only template (whyNotChosenTemplate) — see Q2 in the
 * commit-2 brief.
 */
export function renderStrategicAnalysis(args: RenderStrategicAnalysisArgs): string {
  const chosenSection      = renderChosenSection(args.chosen);
  const layerASection      = renderLayerASection(args.chosen, args.chosenRow);
  const layerBSection      = renderLayerBSection(args.chosen);
  const alternativesSection = renderAlternativesSection(args.reserves);

  return `${chosenSection}\n\n${layerASection}\n\n${layerBSection}\n\n${alternativesSection}`;
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

export const __testInternals = {
  summariseCitations,
  whyNotChosenTemplate,
};
