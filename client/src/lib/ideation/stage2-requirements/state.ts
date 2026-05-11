// src/lib/ideation/stage2-requirements/state.ts
import { SKILL_KEYS, type SkillKey, type SkillTier } from '@neuralaunch/constants';
import {
  Stage2AuthoringStateSchema,
  RequirementsDocumentSchema,
  SkillInventorySchema,
  type Stage2AuthoringState,
  type RequirementsDocument,
  type SkillInventory,
  type PersonSkills,
  type Constraint,
  type StructuralBlocker,
} from './schema';
import type { RecommendedAction } from '../stage1-outcome/schema';
import {
  MAX_RECOMMENDED_ACTIONS_STAGE2,
  MIN_SKILL_CALIBRATION_TURNS,
  STRUCTURAL_BLOCKER_THRESHOLD,
} from './constants';

// ---------------------------------------------------------------------------
// Empty-state factories
// ---------------------------------------------------------------------------

/**
 * Fresh PersonSkills with every skill at 'unknown'. The canvas + the
 * extractor mutate individual tiers; missing keys never happen at
 * runtime because we always seed the full 14-key record.
 */
export function createEmptyPersonSkills(name: string | null = null): PersonSkills {
  const tiers: Record<SkillKey, SkillTier> = {} as Record<SkillKey, SkillTier>;
  for (const k of SKILL_KEYS) {
    tiers[k] = 'unknown';
  }
  return { name, tiers };
}

export function createEmptySkillInventory(now: Date = new Date()): SkillInventory {
  return {
    founder:       createEmptyPersonSkills(null),
    team:          [],
    lastUpdatedAt: now.toISOString(),
  };
}

export function createEmptyStage2AuthoringState(now: Date = new Date()): Stage2AuthoringState {
  return {
    workingInventory:                createEmptySkillInventory(now),
    workingExpectedProfile:          null,
    recommendedActions:              [],
    teamQuestionAsked:               false,
    requiresRederivation:            false,
    cascadeSnapshot:                 null,
    calibrationTurnsSinceLastUpdate: 0,
    structuralBlocker: {
      triggered:     false,
      founderChoice: 'not_yet_chosen',
      notes:         null,
    },
    researchLog: [],
  };
}

// ---------------------------------------------------------------------------
// safeParse — corrupt rows degrade gracefully, never crash a route
// ---------------------------------------------------------------------------

export function safeParseStage2AuthoringState(value: unknown): Stage2AuthoringState {
  const parsed = Stage2AuthoringStateSchema.safeParse(value ?? createEmptyStage2AuthoringState());
  if (parsed.success) return clampAuthoringState(parsed.data);
  return createEmptyStage2AuthoringState();
}

export function safeParseRequirementsDocument(value: unknown): RequirementsDocument | null {
  const parsed = RequirementsDocumentSchema.safeParse(value);
  if (!parsed.success) return null;
  return clampDocument(parsed.data);
}

export function safeParseSkillInventory(value: unknown): SkillInventory | null {
  const parsed = SkillInventorySchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Post-parse clamps — same pattern as Stage 1; bound free-text fields
// that we deliberately did NOT constrain in the LLM-output schemas.
// ---------------------------------------------------------------------------

const REASONING_MAX_CHARS    = 400;
const IMPLICATION_MAX_CHARS  = 200;
const ACTION_MAX_CHARS       = 200;
const FOUNDER_RESPONSE_MAX_CHARS = 400;
const SOURCE_MAX_CHARS       = 80;
const NOTES_MAX_CHARS        = 400;

function clamp(str: string | null, max: number): string | null {
  if (str === null) return null;
  return str.length <= max ? str : str.slice(0, max).trimEnd();
}

function clampAction(a: RecommendedAction): RecommendedAction {
  return {
    ...a,
    action:          clamp(a.action, ACTION_MAX_CHARS) ?? '',
    founderResponse: clamp(a.founderResponse, FOUNDER_RESPONSE_MAX_CHARS),
  };
}

function clampAuthoringState(s: Stage2AuthoringState): Stage2AuthoringState {
  return {
    ...s,
    recommendedActions:   s.recommendedActions.map(clampAction),
    structuralBlocker: {
      ...s.structuralBlocker,
      notes: clamp(s.structuralBlocker.notes, NOTES_MAX_CHARS),
    },
  };
}

function clampDocument(d: RequirementsDocument): RequirementsDocument {
  return {
    ...d,
    expectedProfile: d.expectedProfile.map(e => ({
      ...e,
      reasoning: clamp(e.reasoning, REASONING_MAX_CHARS) ?? '',
      sources:   e.sources.map(s => clamp(s, SOURCE_MAX_CHARS) ?? ''),
    })),
    constraints:        d.constraints.map(c => ({ ...c, implication: clamp(c.implication, IMPLICATION_MAX_CHARS) ?? '' })),
    recommendedActions: d.recommendedActions.map(clampAction),
    structuralBlocker:  { ...d.structuralBlocker, notes: clamp(d.structuralBlocker.notes, NOTES_MAX_CHARS) },
  };
}

// ---------------------------------------------------------------------------
// Inventory updates — used by the canvas writes AND the extractor
// ---------------------------------------------------------------------------

export type SkillUpdate = {
  /** 'founder' = the founder themselves; integer = teammate index */
  person: 'founder' | number;
  skill:  SkillKey;
  tier:   SkillTier;
};

export type TeammateOp =
  | { op: 'add';    name: string }
  | { op: 'remove'; index: number }
  | { op: 'rename'; index: number; name: string };

/**
 * Apply a single skill-tier update to an inventory. Pure; returns a
 * new inventory. Out-of-range teammate indices are silently ignored —
 * the route layer rejects them with 409 before reaching this helper.
 */
export function applySkillUpdate(
  inv:    SkillInventory,
  update: SkillUpdate,
  now:    Date = new Date(),
): SkillInventory {
  if (update.person === 'founder') {
    return {
      ...inv,
      founder: { ...inv.founder, tiers: { ...inv.founder.tiers, [update.skill]: update.tier } },
      lastUpdatedAt: now.toISOString(),
    };
  }
  if (update.person < 0 || update.person >= inv.team.length) return inv;
  const team = inv.team.slice();
  const t = team[update.person];
  team[update.person] = { ...t, tiers: { ...t.tiers, [update.skill]: update.tier } };
  return { ...inv, team, lastUpdatedAt: now.toISOString() };
}

/**
 * Apply a teammate operation (add / remove / rename). Pure.
 */
export function applyTeammateOp(
  inv: SkillInventory,
  op:  TeammateOp,
  now: Date = new Date(),
): SkillInventory {
  if (op.op === 'add') {
    return {
      ...inv,
      team: [...inv.team, createEmptyPersonSkills(op.name)],
      lastUpdatedAt: now.toISOString(),
    };
  }
  if (op.op === 'remove') {
    if (op.index < 0 || op.index >= inv.team.length) return inv;
    return { ...inv, team: inv.team.filter((_, i) => i !== op.index), lastUpdatedAt: now.toISOString() };
  }
  if (op.op === 'rename') {
    if (op.index < 0 || op.index >= inv.team.length) return inv;
    const team = inv.team.slice();
    team[op.index] = { ...team[op.index], name: op.name };
    return { ...inv, team, lastUpdatedAt: now.toISOString() };
  }
  return inv;
}

/**
 * Bulk-apply extractions produced by the Stage 2 extractor. The
 * extractor returns deltas (skill updates + team mentions), this
 * folds them all in. Updates the drift counter:
 *
 *   - Resets to 0 when any tier change actually applies
 *   - Increments by 1 when no tier change applies (e.g. founder
 *     said something offtopic, or all extracted skills already
 *     match the current tier)
 */
export function applyStage2Extractions(
  state:   Stage2AuthoringState,
  updates: ReadonlyArray<SkillUpdate>,
  newTeammates: ReadonlyArray<string>,
  now:     Date = new Date(),
): Stage2AuthoringState {
  let inv = state.workingInventory;
  let anyChange = false;

  for (const name of newTeammates) {
    inv = applyTeammateOp(inv, { op: 'add', name }, now);
    anyChange = true;
  }

  for (const u of updates) {
    const prior =
      u.person === 'founder'
        ? state.workingInventory.founder.tiers[u.skill]
        : state.workingInventory.team[u.person]?.tiers[u.skill];
    if (prior === u.tier) continue;
    inv = applySkillUpdate(inv, u, now);
    anyChange = true;
  }

  return {
    ...state,
    workingInventory: inv,
    calibrationTurnsSinceLastUpdate: anyChange
      ? 0
      : state.calibrationTurnsSinceLastUpdate + 1,
  };
}

// ---------------------------------------------------------------------------
// Recommended-action append — same pattern as Stage 1 (dedup + FIFO).
// Extracted as its own helper because Stage 2 has its own cap constant
// (MAX_RECOMMENDED_ACTIONS_STAGE2) and the rest is identical.
// ---------------------------------------------------------------------------

export function appendStage2RecommendedAction(
  state: Stage2AuthoringState,
  next:  RecommendedAction,
): Stage2AuthoringState {
  const cleanedNext = clampAction(next);
  const key = cleanedNext.action.trim().toLowerCase();

  const existingIdx = state.recommendedActions.findIndex(
    a => a.action.trim().toLowerCase() === key,
  );
  if (existingIdx >= 0) {
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
  if (appended.length <= MAX_RECOMMENDED_ACTIONS_STAGE2) {
    return { ...state, recommendedActions: appended };
  }
  // FIFO eviction with sticky completed entries — same as Stage 1.
  const evictionIdx = appended.findIndex(a => a.status !== 'completed');
  const trimmed = appended.slice();
  trimmed.splice(evictionIdx >= 0 ? evictionIdx : 0, 1);
  return { ...state, recommendedActions: trimmed };
}

// ---------------------------------------------------------------------------
// Structural blocker — derived from constraints
// ---------------------------------------------------------------------------

/**
 * Count structural-or-blind-spot constraints on critical Expected
 * Profile entries; return whether the soft-warning threshold trips.
 * Recomputed whenever inventory or Expected Profile changes.
 */
export function computeStructuralBlocker(
  prior:       StructuralBlocker,
  constraints: ReadonlyArray<Constraint>,
): StructuralBlocker {
  const criticalGaps = constraints.filter(
    c => c.critical && (c.gap === 'structural' || c.gap === 'blind_spot'),
  ).length;
  const triggered = criticalGaps >= STRUCTURAL_BLOCKER_THRESHOLD;

  // If the threshold drops back below (e.g. founder added a teammate
  // who fills a gap), clear any prior 'not_yet_chosen' state so the
  // founder isn't pinned to an old recording. Preserve real choices.
  if (!triggered && prior.founderChoice === 'not_yet_chosen') {
    return { triggered: false, founderChoice: 'not_yet_chosen', notes: null };
  }
  return { ...prior, triggered };
}

// ---------------------------------------------------------------------------
// Composition gate
// ---------------------------------------------------------------------------

/**
 * Returns true when the composer is allowed to fire. Both must hold:
 *
 *   - At least MIN_SKILL_CALIBRATION_TURNS turns have happened so the
 *     extractor isn't collapsing the inventory after one exchange.
 *   - workingExpectedProfile has been derived (non-null, non-empty).
 *
 * Note: the structural-blocker triggering state does NOT block
 * composition — the blocker is a SOFT warning surfaced inside the
 * composed document; the founder chooses how to proceed.
 */
export function computeStage2Readiness(
  state:       Stage2AuthoringState,
  turnCount:   number,
): boolean {
  if (turnCount < MIN_SKILL_CALIBRATION_TURNS) return false;
  if (!state.workingExpectedProfile || state.workingExpectedProfile.length === 0) return false;
  return true;
}
