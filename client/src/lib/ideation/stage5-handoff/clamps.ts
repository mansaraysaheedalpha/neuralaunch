// src/lib/ideation/stage5-handoff/clamps.ts
//
// Post-parse string and number clamps for Stage 5 shapes. Centralised
// here so state.ts stays under the 200-line cap from the brief.
//
// CLAUDE.md rule context: the LLM-output Zod schemas in schema.ts
// deliberately omit .max() on strings and .int() / .min() / .max() on
// numbers (the Anthropic structured-output validator rejects those).
// These clamp helpers enforce the equivalent intent post-parse on
// every read/write path that touches founder-supplied or
// LLM-supplied fields.

import 'server-only';
import type {
  ChosenOpportunitySnapshot,
  ReserveOpportunity,
  Stage5AuthoringState,
  Stage5HandoffDocument,
} from './schema';
import type { RecommendedAction } from '../stage1-outcome/schema';

// ---------------------------------------------------------------------------
// Per-field caps (Stage-5-local; not exposed)
// ---------------------------------------------------------------------------

const PAIN_SUMMARY_MAX_CHARS     = 600;
const REASONING_MAX_CHARS        = 1500;
const QUOTE_MAX_CHARS            = 300;
const CONTRADICTION_MAX_CHARS    = 400;
const ACTION_MAX_CHARS           = 200;
const FOUNDER_RESPONSE_MAX_CHARS = 400;
const SYNTHESIS_ERROR_MAX_CHARS  = 800;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function clamp(str: string | null, max: number): string | null {
  if (str === null) return null;
  return str.length <= max ? str : str.slice(0, max).trimEnd();
}

export function clampConfidence(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ---------------------------------------------------------------------------
// Per-shape clamps
// ---------------------------------------------------------------------------

function clampLayerA(s: NonNullable<ChosenOpportunitySnapshot['layerASummary']>) {
  return {
    marketReality:  { reasoning: clamp(s.marketReality.reasoning,  REASONING_MAX_CHARS) ?? '', confidence: clampConfidence(s.marketReality.confidence) },
    customerAccess: { reasoning: clamp(s.customerAccess.reasoning, REASONING_MAX_CHARS) ?? '', confidence: clampConfidence(s.customerAccess.confidence) },
    willPeoplePay:  { reasoning: clamp(s.willPeoplePay.reasoning,  REASONING_MAX_CHARS) ?? '', confidence: clampConfidence(s.willPeoplePay.confidence) },
    marketSize:     { reasoning: clamp(s.marketSize.reasoning,     REASONING_MAX_CHARS) ?? '', confidence: clampConfidence(s.marketSize.confidence) },
  };
}

function clampLayerB(s: NonNullable<ChosenOpportunitySnapshot['layerBSummary']>) {
  return {
    ...s,
    keyQuotes:            s.keyQuotes.map(q => clamp(q, QUOTE_MAX_CHARS) ?? '').filter(q => q.length > 0),
    contradictionsRaised: s.contradictionsRaised.map(c => clamp(c, CONTRADICTION_MAX_CHARS) ?? '').filter(c => c.length > 0),
  };
}

export function clampChosenSnapshot(c: ChosenOpportunitySnapshot): ChosenOpportunitySnapshot {
  return {
    ...c,
    painPointSummary: clamp(c.painPointSummary, PAIN_SUMMARY_MAX_CHARS) ?? '',
    agentReasoning:   clamp(c.agentReasoning,   REASONING_MAX_CHARS)    ?? '',
    layerASummary:    c.layerASummary && clampLayerA(c.layerASummary),
    layerBSummary:    c.layerBSummary && clampLayerB(c.layerBSummary),
  };
}

export function clampReserve(r: ReserveOpportunity): ReserveOpportunity {
  return {
    ...r,
    painPointSummary: clamp(r.painPointSummary, PAIN_SUMMARY_MAX_CHARS) ?? '',
    agentReasoning:   clamp(r.agentReasoning,   REASONING_MAX_CHARS)    ?? '',
    layerASummary:    r.layerASummary && clampLayerA(r.layerASummary),
    layerBSummary:    r.layerBSummary && clampLayerB(r.layerBSummary),
  };
}

export function clampAction(a: RecommendedAction): RecommendedAction {
  return {
    ...a,
    action:          clamp(a.action, ACTION_MAX_CHARS) ?? '',
    founderResponse: clamp(a.founderResponse, FOUNDER_RESPONSE_MAX_CHARS),
  };
}

export function clampAuthoringState(s: Stage5AuthoringState): Stage5AuthoringState {
  return {
    ...s,
    chosenOpportunity:    s.chosenOpportunity && clampChosenSnapshot(s.chosenOpportunity),
    reserveOpportunities: s.reserveOpportunities.map(clampReserve),
    recommendedActions:   s.recommendedActions.map(clampAction),
    synthesisError:       clamp(s.synthesisError, SYNTHESIS_ERROR_MAX_CHARS),
    cascadeSnapshot:      s.cascadeSnapshot && { ...s.cascadeSnapshot, document: clampDocument(s.cascadeSnapshot.document) },
  };
}

export function clampDocument(d: Stage5HandoffDocument): Stage5HandoffDocument {
  return {
    ...d,
    chosenOpportunity:    clampChosenSnapshot(d.chosenOpportunity),
    reserveOpportunities: d.reserveOpportunities.map(clampReserve),
    recommendedActions:   d.recommendedActions.map(clampAction),
  };
}
