import { z } from 'zod';

/**
 * Roadmap shapes — the structured output of the Phase 2 roadmap
 * generator. Persisted to Roadmap.phases (JSONB) and rendered by both
 * the client roadmap view and the mobile roadmap viewer.
 *
 * Mobile imports these and runtime-validates API responses with
 * .parse() so backend schema drift surfaces as a clean error rather
 * than a silent crash on an unexpected shape.
 */

export const RoadmapTaskSchema = z.object({
  /**
   * Stable task identifier within the roadmap. Optional on the
   * emission schema because the model does NOT generate this — the
   * engine mints it deterministically post-parse (pattern:
   * `phase{N}-task{M}`). Consumed by features that need to reference
   * a specific task across time — notably the task-bound
   * ValidationPage (schema.prisma → ValidationPage.taskId) and any
   * future task-bound tooling.
   *
   * Legacy roadmaps generated before this field existed carry no id
   * until the one-shot backfillRoadmapTaskIds Inngest function mints
   * deterministic ids for their tasks; until backfill runs, readers
   * MUST tolerate id being absent on older rows.
   */
  id:              z.string().optional().describe('Stable task id — engine-minted after model emission, optional in payloads'),
  title:           z.string().describe('Short action-oriented task title (verb-first, e.g. "Identify 10 potential customers")'),
  description:     z.string().describe('2-3 sentences: what to do, how to do it, and what to produce'),
  rationale:       z.string().describe('One sentence explaining why this task at this point in the journey'),
  timeEstimate:    z.string().describe('Realistic time estimate tied to their available hours, e.g. "3 hours across 2 evenings"'),
  successCriteria: z.string().describe('One concrete, observable signal that this task is done — not "understand X" but "have X in hand"'),
  resources:       z.array(z.string()).optional().describe('Specific tools, platforms, or frameworks relevant to this task'),
  /**
   * Internal NeuraLaunch tools the roadmap generator suggests for
   * this task. The task card renders a tool-specific button when the
   * array contains a recognised tool identifier (e.g.
   * 'conversation_coach'). Optional — most tasks don't need internal
   * tooling. Only suggest when the tool is genuinely relevant.
   */
  suggestedTools:  z.array(z.string()).optional().describe(
    'Internal NeuraLaunch tools that would help the founder execute this task. Only suggest when the tool is genuinely relevant, not as a default. Current tools: conversation_coach (for tasks involving pitching, negotiating, asking for something, confronting someone, delivering difficult news, or requesting a meeting).'
  ),
  /**
   * Stable task ids this task waits on. Roadmap-level dependency edges
   * emitted by the generator (e.g. "phase2-task1 depends on
   * phase1-task3"). The mark-complete handler reads this on every task
   * status PATCH and auto-clears blockedReason for any task whose
   * dependsOn[] is now satisfied. Optional / defaults to [] so legacy
   * roadmaps stay valid. Added in PR 16-data.
   */
  dependsOn:       z.array(z.string()).optional().describe(
    'Stable task ids this task must wait on. Use the engine-minted `phaseN-taskM` ids. Reference only tasks that appear earlier in the same roadmap. Omit or emit [] when there is no real prerequisite — do NOT invent dependencies to look thorough.'
  ),
  /**
   * Human-readable reason this task is currently blocked, set by the
   * roadmap UI / engine when an upstream dependency or external
   * blocker exists. Persisted on read; the LLM never emits this on
   * generation. Optional / nullable so legacy roadmaps stay valid.
   * Added in PR 16-data.
   */
  blockedReason:   z.string().nullable().optional().describe(
    'Why this task is currently blocked, in plain language. Only set when the task is actually blocked; clear when work can resume. Engine-managed — generators should not emit this.'
  ),
  /**
   * Real elapsed hours the founder spent on this task, captured at
   * mark-complete from (completedAt - startedAt) when both are
   * present. Used to compute the venture's derived weekly hours and
   * to flag estimate drift. Engine-managed; the LLM never emits this.
   * Optional / nullable so legacy rows stay valid. Added in PR 16-data.
   */
  actualHours:     z.number().nullable().optional().describe(
    'Real elapsed hours spent on this task, captured on completion. Engine-managed; do not emit on generation.'
  ),
});

export const RoadmapPhaseSchema = z.object({
  phase:         z.number().describe('Phase number starting at 1 — must be a whole number'),
  title:         z.string().describe('Name of this phase, e.g. "Foundation" or "First Customer"'),
  objective:     z.string().describe('One sentence: what this phase achieves and why it comes before the next'),
  durationWeeks: z.number().describe('Realistic duration in weeks given their available time — must be a whole number, minimum 1'),
  tasks:         z.array(RoadmapTaskSchema).describe('Between 1 and 5 tasks for this phase'),
});

export const RoadmapSchema = z.object({
  phases:        z.array(RoadmapPhaseSchema).describe('Between 2 and 6 phases in order. A simple sales_motion recommendation might need only 3 phases. A complex build_software recommendation might need 5-6. Do NOT always produce exactly 5 — let the complexity of the recommendation determine the phase count.'),
  closingThought: z.string().describe('2-3 sentences addressed directly to this person: what completing this roadmap means for them specifically, and what the first action is right now'),
});

export type RoadmapTask  = z.infer<typeof RoadmapTaskSchema>;
export type RoadmapPhase = z.infer<typeof RoadmapPhaseSchema>;
export type Roadmap      = z.infer<typeof RoadmapSchema>;
