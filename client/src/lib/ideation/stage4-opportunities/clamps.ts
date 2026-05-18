// src/lib/ideation/stage4-opportunities/clamps.ts
//
// Post-parse string and number clamps for Stage 4 shapes. Centralised
// here so state.ts stays under the 300-line cap; these are pure
// per-field bounders with no dependencies beyond schema types.
//
// CLAUDE.md rule context: the LLM-output Zod schemas in schema.ts
// deliberately omit .max() on strings and .int() / .min() / .max() on
// numbers (the Anthropic structured-output validator rejects those).
// These clamp helpers enforce the equivalent intent post-parse on
// every read/write path that touches user-supplied or LLM-supplied
// fields.

import 'server-only';
import type {
  OpportunityEvaluation,
  OpportunityEvaluationsDocument,
  Stage4AuthoringState,
  CommunityResponse,
  CommunityComment,
  ExtractedSignal,
  OpportunityPushbackHistoryEntry,
} from './schema';
import type { RecommendedAction } from '../stage1-outcome/schema';
import { COMMUNITY_COMMENT_EXCERPT_MAX_CHARS } from './constants';

// ---------------------------------------------------------------------------
// Per-field caps (Stage-4-local; not exposed)
// ---------------------------------------------------------------------------

const PAIN_SUMMARY_MAX_CHARS     = 600;
const REASONING_MAX_CHARS        = 1500;
const CITATION_EXCERPT_MAX_CHARS = 400;
const SCRIPT_POST_MAX_CHARS      = 1500;
const SCRIPT_QUESTION_MAX_CHARS  = 300;
const PUSHBACK_MESSAGE_MAX_CHARS = 1500;
const ACTION_MAX_CHARS           = 200;
const FOUNDER_RESPONSE_MAX_CHARS = 400;
const RATIONALE_MAX_CHARS        = 800;
const QUOTE_MAX_CHARS            = 400;
const CONTRADICTION_MAX_CHARS    = 400;
const PASTED_TEXT_MAX_CHARS      = COMMUNITY_COMMENT_EXCERPT_MAX_CHARS * 4;

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

export function clampVoteCount(n: number | null): number | null {
  if (n === null) return null;
  if (Number.isNaN(n)) return null;
  return Math.round(n);
}

// ---------------------------------------------------------------------------
// Per-shape clamps
// ---------------------------------------------------------------------------

export function clampComment(c: CommunityComment): CommunityComment {
  return {
    ...c,
    text:      clamp(c.text, COMMUNITY_COMMENT_EXCERPT_MAX_CHARS) ?? '',
    voteCount: clampVoteCount(c.voteCount),
  };
}

export function clampExtractedSignal(s: ExtractedSignal): ExtractedSignal {
  return {
    ...s,
    comments:             s.comments.map(clampComment),
    keyQuotes:            s.keyQuotes.map(q => clamp(q, QUOTE_MAX_CHARS) ?? '').filter(q => q.length > 0),
    contradictionsToPain: s.contradictionsToPain.map(c => clamp(c, CONTRADICTION_MAX_CHARS) ?? '').filter(c => c.length > 0),
    originalPost: {
      ...s.originalPost,
      voteCount:   clampVoteCount(s.originalPost.voteCount),
      bodyExcerpt: clamp(s.originalPost.bodyExcerpt, COMMUNITY_COMMENT_EXCERPT_MAX_CHARS) ?? '',
    },
    unparseableNotes: clamp(s.unparseableNotes, REASONING_MAX_CHARS),
  };
}

export function clampPushbackEntry(e: OpportunityPushbackHistoryEntry): OpportunityPushbackHistoryEntry {
  return {
    ...e,
    founderMessage: clamp(e.founderMessage, PUSHBACK_MESSAGE_MAX_CHARS) ?? '',
    agentMessage:   clamp(e.agentMessage,   PUSHBACK_MESSAGE_MAX_CHARS) ?? '',
  };
}

export function clampOpportunity(o: OpportunityEvaluation): OpportunityEvaluation {
  return {
    ...o,
    painPointSummary: clamp(o.painPointSummary, PAIN_SUMMARY_MAX_CHARS) ?? '',
    agentReasoning:   clamp(o.agentReasoning, REASONING_MAX_CHARS) ?? '',
    layerAResearch:   o.layerAResearch && {
      ...o.layerAResearch,
      marketReality:  clampDimension(o.layerAResearch.marketReality),
      customerAccess: clampDimension(o.layerAResearch.customerAccess),
      willPeoplePay:  clampDimension(o.layerAResearch.willPeoplePay),
      marketSize:     clampDimension(o.layerAResearch.marketSize),
    },
    layerBScript: o.layerBScript && {
      ...o.layerBScript,
      postWording:    clamp(o.layerBScript.postWording, SCRIPT_POST_MAX_CHARS) ?? '',
      questionsToAsk: o.layerBScript.questionsToAsk.map(q => clamp(q, SCRIPT_QUESTION_MAX_CHARS) ?? '').filter(q => q.length > 0),
    },
    pushbackHistory: o.pushbackHistory.map(clampPushbackEntry),
  };
}

function clampDimension(d: { reasoning: string; confidence: number; citations: { url: string; excerpt: string; sourcePlatform: string }[] }): typeof d {
  return {
    reasoning:  clamp(d.reasoning, REASONING_MAX_CHARS) ?? '',
    confidence: clampConfidence(d.confidence),
    citations:  d.citations.map(c => ({ ...c, excerpt: clamp(c.excerpt, CITATION_EXCERPT_MAX_CHARS) ?? '' })),
  };
}

export function clampResponse(r: CommunityResponse): CommunityResponse {
  return {
    ...r,
    pastedText:      clamp(r.pastedText, PASTED_TEXT_MAX_CHARS),
    extractedSignal: r.extractedSignal && clampExtractedSignal(r.extractedSignal),
  };
}

export function clampAction(a: RecommendedAction): RecommendedAction {
  return {
    ...a,
    action:          clamp(a.action, ACTION_MAX_CHARS) ?? '',
    founderResponse: clamp(a.founderResponse, FOUNDER_RESPONSE_MAX_CHARS),
  };
}

export function clampAuthoringState(s: Stage4AuthoringState): Stage4AuthoringState {
  return {
    ...s,
    opportunities:             s.opportunities.map(clampOpportunity),
    founderCommunityResponses: s.founderCommunityResponses.map(clampResponse),
    recommendedActions:        s.recommendedActions.map(clampAction),
    cascadeSnapshot:           s.cascadeSnapshot && { ...s.cascadeSnapshot, document: clampDocument(s.cascadeSnapshot.document) },
  };
}

export function clampDocument(d: OpportunityEvaluationsDocument): OpportunityEvaluationsDocument {
  return {
    ...d,
    evaluations:        d.evaluations.map(clampOpportunity),
    responsesSnapshot:  d.responsesSnapshot.map(clampResponse),
    chosenRationale:    clamp(d.chosenRationale, RATIONALE_MAX_CHARS) ?? '',
    rejectedRationale:  clamp(d.rejectedRationale, RATIONALE_MAX_CHARS) ?? '',
    recommendedActions: d.recommendedActions.map(clampAction),
  };
}
