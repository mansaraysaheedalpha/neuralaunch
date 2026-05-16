// src/lib/ideation/stage1-outcome/state.ts
import type {
  TimeHorizon,
  RiskTolerance,
  LifestylePreference,
  FinancialGoalShape,
} from '@neuralaunch/constants';
import {
  Stage1AuthoringStateSchema,
  OutcomeDocumentSchema,
  type Stage1AuthoringState,
  type OutcomeDocument,
  type OutcomeDimensions,
  type RecommendedAction,
} from './schema';
import {
  MIN_OUTCOME_FIELD_CONFIDENCE,
  OUTCOME_READINESS_RATIO,
  MAX_RECOMMENDED_ACTIONS,
  DIM_KEYS,
  type Stage1DimKey,
} from '../constants';

// ---------------------------------------------------------------------------
// Empty-state factories
// ---------------------------------------------------------------------------

/**
 * Produces a fresh OutcomeDimensions with every beliefField at zero
 * confidence and null value. Used at Stage 1 entry and as the safeParse
 * fallback so corrupt rows degrade to a usable empty state rather than
 * crashing the route.
 */
export function createEmptyDimensions(): OutcomeDimensions {
  return {
    timeHorizon:         { value: null, confidence: 0, extractedAt: null },
    financialGoal:       { value: null, confidence: 0, extractedAt: null },
    riskTolerance:       { value: null, confidence: 0, extractedAt: null },
    lifestylePreference: { value: null, confidence: 0, extractedAt: null },
  };
}

/**
 * Fresh authoring state for a new Stage 1 row. The session-create
 * route writes this as the initial value of IdeationStageRun.output
 * when creating the stage=1 row alongside the DiscoverySession.
 */
export function createEmptyStage1AuthoringState(): Stage1AuthoringState {
  return {
    dimensions:                       createEmptyDimensions(),
    recommendedActions:               [],
    questionsSinceLastConfidenceGain: 0,
    editTargetDimension:              null,
    priorCommittedSnapshot:           null,
    editStartedAt:                    null,
  };
}

// ---------------------------------------------------------------------------
// safeParse helpers — same pattern as safeParseDiscoveryContext.
// Reads always go through these; never raw-cast IdeationStageRun.output.
// ---------------------------------------------------------------------------

/**
 * Parse the authoring-status payload from IdeationStageRun.output.
 * Returns an empty authoring state on parse failure so a corrupt row
 * never crashes a route — the founder loses turn-by-turn state but
 * regains a usable surface to continue from.
 */
export function safeParseStage1AuthoringState(value: unknown): Stage1AuthoringState {
  const parsed = Stage1AuthoringStateSchema.safeParse(value ?? createEmptyStage1AuthoringState());
  if (parsed.success) return clampAuthoringState(parsed.data);
  return createEmptyStage1AuthoringState();
}

/**
 * Parse the output_ready / committed payload from IdeationStageRun.output.
 * Returns null on parse failure — the caller decides how to surface
 * "document corrupted" to the founder (typically: revert status to
 * authoring and tell them to recompose).
 */
export function safeParseOutcomeDocument(value: unknown): OutcomeDocument | null {
  const parsed = OutcomeDocumentSchema.safeParse(value);
  if (!parsed.success) return null;
  return clampOutcomeDocument(parsed.data);
}

// ---------------------------------------------------------------------------
// Post-parse clamps — bound the free-text fields that we deliberately
// did NOT constrain with .max() in the LLM-output schema (Anthropic's
// structured-output validator rejects those constraints; see CLAUDE.md).
// ---------------------------------------------------------------------------

const TARGET_MAX_CHARS              = 80;
const ACTION_MAX_CHARS               = 200;
const FOUNDER_RESPONSE_MAX_CHARS     = 400;
// Bumped 800 → 1200 (2026-05-12), then 1200 → 1800 (2026-05-16).
// A PM-voice founder produced a dense ~1200-char synthesis that
// still got chopped mid-word at 1200. We want the cap to be a
// runaway-output guard, not a truncator on natural output. The
// composer prompt itself still targets 3-5 sentences — the cap is
// just a ceiling. Pair this with clampSynthesis below so the rare
// breach lands on a sentence boundary rather than mid-word.
const SYNTHESIS_PARAGRAPH_MAX_CHARS = 1800;
const RULES_OUT_MAX_CHARS           = 500;

function clamp(str: string | null, max: number): string | null {
  if (str === null) return null;
  return str.length <= max ? str : str.slice(0, max).trimEnd();
}

/**
 * Same shape as clamp() but, when the cap is breached, finds the
 * last sentence-ending punctuation (`.`, `!`, `?` followed by a
 * space) inside the LAST_SENTENCE_SEARCH_WINDOW chars before the
 * cap and cuts there. Falls back to word-boundary trim if no
 * sentence end is reachable. Used for the synthesisParagraph so a
 * breach never produces "...a low-margin, high-volume business
 * almost always" ending mid-sentence.
 *
 * Other clamps (rulesOut, action, founderResponse, target) keep
 * using plain clamp() — they're short enough that a breach is rare
 * and acceptable.
 */
const LAST_SENTENCE_SEARCH_WINDOW = 200;

function clampSynthesis(str: string | null, max: number): string | null {
  if (str === null) return null;
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const searchFrom = Math.max(0, cut.length - LAST_SENTENCE_SEARCH_WINDOW);
  const search = cut.slice(searchFrom);
  const lastEnd = Math.max(
    search.lastIndexOf('. '),
    search.lastIndexOf('! '),
    search.lastIndexOf('? '),
  );
  if (lastEnd >= 0) {
    return cut.slice(0, searchFrom + lastEnd + 1).trimEnd();
  }
  return cut.trimEnd();
}

function clampConfidence(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clampAction(a: RecommendedAction): RecommendedAction {
  return {
    ...a,
    action:          clamp(a.action, ACTION_MAX_CHARS) ?? '',
    founderResponse: clamp(a.founderResponse, FOUNDER_RESPONSE_MAX_CHARS),
  };
}

function clampDimensions(d: OutcomeDimensions): OutcomeDimensions {
  return {
    timeHorizon:         { ...d.timeHorizon,         confidence: clampConfidence(d.timeHorizon.confidence) },
    riskTolerance:       { ...d.riskTolerance,       confidence: clampConfidence(d.riskTolerance.confidence) },
    lifestylePreference: { ...d.lifestylePreference, confidence: clampConfidence(d.lifestylePreference.confidence) },
    financialGoal: {
      ...d.financialGoal,
      confidence: clampConfidence(d.financialGoal.confidence),
      value: d.financialGoal.value
        ? { ...d.financialGoal.value, target: clamp(d.financialGoal.value.target, TARGET_MAX_CHARS) }
        : null,
    },
  };
}

function clampAuthoringState(s: Stage1AuthoringState): Stage1AuthoringState {
  return {
    ...s,
    dimensions:         clampDimensions(s.dimensions),
    recommendedActions: s.recommendedActions.map(clampAction),
  };
}

function clampOutcomeDocument(d: OutcomeDocument): OutcomeDocument {
  return {
    dimensions:         clampDimensions(d.dimensions),
    // synthesisParagraph uses clampSynthesis so a cap breach lands on
    // a sentence boundary instead of mid-word. Other fields stay with
    // plain clamp — they're short enough that a breach is rare and a
    // mid-word cut is acceptable when it happens.
    synthesisParagraph: clampSynthesis(d.synthesisParagraph, SYNTHESIS_PARAGRAPH_MAX_CHARS) ?? '',
    rulesOut:           clamp(d.rulesOut, RULES_OUT_MAX_CHARS) ?? '',
    recommendedActions: d.recommendedActions.map(clampAction),
  };
}

// ---------------------------------------------------------------------------
// Applying extractions from the extract-and-plan call
// ---------------------------------------------------------------------------

export type Stage1Extraction =
  | { field: 'timeHorizon';         value: TimeHorizon;                                       confidence: number }
  | { field: 'financialGoal';       value: { shape: FinancialGoalShape; target: string | null }; confidence: number }
  | { field: 'riskTolerance';       value: RiskTolerance;                                     confidence: number }
  | { field: 'lifestylePreference'; value: LifestylePreference;                               confidence: number };

/**
 * Merge new extractions into the authoring state.
 *
 * Confidence policy mirrors Discovery's extractor: the new extraction
 * REPLACES the prior value when its confidence is higher OR when the
 * prior confidence was zero. Lower-confidence overwrites are rejected
 * so an offhand mention later in the conversation can't downgrade a
 * direct earlier answer.
 *
 * Drift counter: increments on every call by default, then resets to
 * 0 if any dimension crossed MIN_OUTCOME_FIELD_CONFIDENCE for the first
 * time on this turn. The reset captures "the conversation made
 * meaningful progress", not just "an extraction happened".
 */
export function applyExtractions(
  state: Stage1AuthoringState,
  extractions: ReadonlyArray<Stage1Extraction>,
  now: Date = new Date(),
): Stage1AuthoringState {
  const dims = { ...state.dimensions };
  const nowIso = now.toISOString();
  let crossedThreshold = false;

  for (const ex of extractions) {
    const prior = dims[ex.field];
    if (ex.confidence < prior.confidence) continue;

    const wasUnknown = prior.confidence < MIN_OUTCOME_FIELD_CONFIDENCE;
    const isNowKnown = ex.confidence >= MIN_OUTCOME_FIELD_CONFIDENCE;
    if (wasUnknown && isNowKnown) crossedThreshold = true;

    // Narrow per-field so the indexed-access target type stays a single
    // dimension shape (not the intersection TS would otherwise infer
    // from a union key). Each branch can assign cleanly.
    const conf = clampConfidence(ex.confidence);
    switch (ex.field) {
      case 'timeHorizon':
        dims.timeHorizon = { value: ex.value, confidence: conf, extractedAt: nowIso };
        break;
      case 'financialGoal':
        dims.financialGoal = {
          value:       ex.value,
          confidence:  conf,
          extractedAt: nowIso,
        };
        break;
      case 'riskTolerance':
        dims.riskTolerance = { value: ex.value, confidence: conf, extractedAt: nowIso };
        break;
      case 'lifestylePreference':
        dims.lifestylePreference = { value: ex.value, confidence: conf, extractedAt: nowIso };
        break;
    }
  }

  return {
    ...state,
    dimensions: clampDimensions(dims),
    questionsSinceLastConfidenceGain: crossedThreshold
      ? 0
      : state.questionsSinceLastConfidenceGain + 1,
  };
}

// ---------------------------------------------------------------------------
// Recommended-action append with FIFO bound
// ---------------------------------------------------------------------------

/**
 * Append a new recommended action with FIFO eviction once the array
 * hits MAX_RECOMMENDED_ACTIONS. Completed entries are sticky — they
 * are skipped during eviction so the "what the founder actually did"
 * audit trail survives. Dedup is naive: identical `action` strings
 * (case-insensitive, trimmed) collapse onto the existing entry.
 */
export function appendRecommendedAction(
  state: Stage1AuthoringState,
  next: RecommendedAction,
): Stage1AuthoringState {
  const cleanedNext = clampAction(next);
  const key = cleanedNext.action.trim().toLowerCase();

  const existingIdx = state.recommendedActions.findIndex(
    a => a.action.trim().toLowerCase() === key,
  );
  if (existingIdx >= 0) {
    // Existing action — keep the older raisedAt but adopt the newer
    // severity if it escalated and adopt the newer status / response.
    const existing = state.recommendedActions[existingIdx];
    const mergedSeverity =
      cleanedNext.severity === 'strongly_advised' || existing.severity === 'strongly_advised'
        ? 'strongly_advised'
        : 'suggested';
    const merged: RecommendedAction = {
      ...existing,
      severity:        mergedSeverity,
      status:          cleanedNext.status   !== 'pending' ? cleanedNext.status   : existing.status,
      founderResponse: cleanedNext.founderResponse        ?? existing.founderResponse,
    };
    const list = state.recommendedActions.slice();
    list[existingIdx] = merged;
    return { ...state, recommendedActions: list };
  }

  const appended = [...state.recommendedActions, cleanedNext];
  if (appended.length <= MAX_RECOMMENDED_ACTIONS) {
    return { ...state, recommendedActions: appended };
  }

  // FIFO eviction — drop the oldest non-completed entry; completed
  // entries are sticky. If every entry is completed (unlikely but
  // possible) we drop the oldest regardless to keep the cap.
  const evictionIdx = appended.findIndex(a => a.status !== 'completed');
  const trimmed = appended.slice();
  trimmed.splice(evictionIdx >= 0 ? evictionIdx : 0, 1);
  return { ...state, recommendedActions: trimmed };
}

// ---------------------------------------------------------------------------
// Composition gate
// ---------------------------------------------------------------------------

/**
 * Returns true when the composer is allowed to fire. Both conditions
 * must hold:
 *
 *   - Floor: every one of the 4 dimensions has confidence ≥
 *     MIN_OUTCOME_FIELD_CONFIDENCE.
 *   - Ratio: mean confidence across the 4 dimensions ≥
 *     OUTCOME_READINESS_RATIO.
 *
 * The agent's `readyToCompose` self-assessment is the *signal*; this
 * function is the *gate*. Composition fires only when both agree.
 */
export function computeOutcomeReadiness(state: Stage1AuthoringState): boolean {
  const confidences = DIM_KEYS.map((k: Stage1DimKey) => state.dimensions[k].confidence);
  const allAboveFloor = confidences.every(c => c >= MIN_OUTCOME_FIELD_CONFIDENCE);
  const mean = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  return allAboveFloor && mean >= OUTCOME_READINESS_RATIO;
}
