// src/lib/lifecycle/prompt-renderers.ts
//
// Pure functions that render lifecycle memory objects (Founder Profile,
// Cycle Summaries) into prompt-ready string blocks. Each agent calls
// the renderer it needs and drops the result into its prompt template.
//
// All founder-originating content is wrapped in renderUserContent() so
// the prompt injection defence stays consistent with the rest of the
// codebase. Rendering is deterministic and side-effect-free.

import { renderUserContent } from '@/lib/validation/server-helpers';
import type { FounderProfile, CycleSummary } from './schemas';
import type { CrossVentureCycleEntry } from './context-loaders';

// Per-string clip applied inside the cross-venture renderer to keep
// per-cycle render cost bounded regardless of how verbose the founder is.
// Documented in docs/cross-venture-memory-plan.md §3.
const CROSS_VENTURE_FIELD_CLIP = 200;

/**
 * Render a FounderProfile as a prompt block. Used by every agent that
 * loads L1 memory. The block is designed to be cacheable — it changes
 * only at cycle boundaries, so it sits inside the cached stable prefix.
 *
 * Returns the empty string when profile is null (first-cycle founders).
 */
export function renderFounderProfileBlock(profile: FounderProfile | null): string {
  if (!profile) return '';

  const sc = profile.stableContext;
  const cs = profile.currentSituation;
  const bc = profile.behaviouralCalibration;
  const jo = profile.journeyOverview;

  return `FOUNDER PROFILE (the system's understanding of who this person is — updated at every cycle boundary):
Name: ${renderUserContent(sc.name, 200)}
Location: ${renderUserContent(sc.location, 200)}, ${renderUserContent(sc.country, 100)}
Background: ${renderUserContent(sc.background, 400)}
Skills: ${renderUserContent(sc.skills.join(', '), 300)}
Technical ability: ${renderUserContent(sc.technicalAbility, 100)}
${sc.education ? `Education: ${renderUserContent(sc.education, 200)}\n` : ''}Current focus: ${renderUserContent(cs.primaryFocus, 400)}
Available hours/week: ${cs.availableHoursPerWeek}
Financial constraints: ${renderUserContent(cs.financialConstraints, 300)}
Team: ${renderUserContent(cs.teamComposition, 200)}
Active ventures: ${cs.activeVentureNames.length > 0 ? renderUserContent(cs.activeVentureNames.join(', '), 300) : 'none'}

Behavioural calibration (inferred from prior execution):
- Speed: delivers at ${Math.round(bc.realSpeedMultiplier * 100)}% of estimated pace
- Avoidance patterns: ${bc.taskAvoidancePatterns.length > 0 ? renderUserContent(bc.taskAvoidancePatterns.join(', '), 400) : 'none detected'}
- Strengths: ${bc.strengths.length > 0 ? renderUserContent(bc.strengths.join(', '), 400) : 'not yet calibrated'}
- Check-in style: ${bc.checkInDetailLevel}
- Pushback tendency: ${bc.pushbackTendency.replace('_', ' ')}
- Outreach comfort: ${bc.outreachComfortLevel}

Journey: ${jo.completedVentures} venture${jo.completedVentures === 1 ? '' : 's'} completed, ${jo.completedCycles} cycle${jo.completedCycles === 1 ? '' : 's'} total, ${jo.totalTasksCompleted} tasks completed lifetime${jo.mostRecentVentureName ? `. Most recent: ${renderUserContent(jo.mostRecentVentureName, 200)} (${jo.mostRecentVentureStatus ?? 'unknown'})` : ''}
`;
}

/**
 * Render an array of CycleSummaries as a prompt block. Used by agents
 * that load L2 memory (interview fork continuation, recommendation,
 * continuation brief). Summaries arrive newest-first from the loader;
 * this renderer reverses them so the prompt reads chronologically.
 *
 * Returns the empty string when the array is empty.
 */
export function renderCycleSummariesBlock(summaries: CycleSummary[]): string {
  if (summaries.length === 0) return '';

  const chronological = [...summaries].reverse();
  const blocks = chronological.map(s => {
    const exec = s.execution;
    return `CYCLE ${s.cycleNumber} (${s.duration.totalDays} days, ${s.recommendationType}):
Recommendation: ${renderUserContent(s.recommendationSummary, 600)}
Execution: ${exec.tasksCompleted}/${exec.totalTasks} tasks completed (${exec.completionPercentage}%)${exec.commonBlockReasons.length > 0 ? `. Blocks: ${renderUserContent(exec.commonBlockReasons.join('; '), 300)}` : ''}
Key learnings: ${s.keyLearnings.length > 0 ? renderUserContent(s.keyLearnings.join('. '), 600) : 'none recorded'}
${s.forkSelected ? `Fork selected: ${renderUserContent(s.forkSelected.forkSummary, 300)}` : 'No fork selected (venture ended or abandoned)'}`;
  });

  return `PRIOR CYCLES IN THIS VENTURE (${summaries.length} completed):
${blocks.join('\n\n')}
`;
}

/**
 * Render the cross-venture context block — the most-recent completed
 * cycles across all OTHER ventures the founder has run. Compound-only;
 * the loader returns `[]` for non-Compound users so this renderer
 * returns the empty string transparently.
 *
 * The leading directive is the guardrail: without an explicit "do not
 * over-import" instruction the model tends to pull tactics from prior
 * ventures into the current one even when the domains are unrelated
 * (hotel SaaS lessons → wedding photography). The label appears in
 * every render — non-negotiable.
 *
 * Per-string clip lives here, not in the loader, so the loader keeps
 * the canonical CycleSummary shape and only the prompt-rendering path
 * pays the truncation cost.
 */
export function renderCrossVentureBlock(entries: CrossVentureCycleEntry[]): string {
  if (entries.length === 0) return '';

  const blocks = entries.map(e => {
    const s    = e.summary;
    const date = e.completedAt ? e.completedAt.slice(0, 10) : 'unknown date';
    const validated   = s.validatedAssumptions.length > 0
      ? s.validatedAssumptions
          .map(v => renderUserContent(v, CROSS_VENTURE_FIELD_CLIP))
          .join(' · ')
      : 'none recorded';
    const invalidated = s.invalidatedAssumptions.length > 0
      ? s.invalidatedAssumptions
          .map(v => renderUserContent(v, CROSS_VENTURE_FIELD_CLIP))
          .join(' · ')
      : 'none recorded';
    const learnings   = s.keyLearnings.length > 0
      ? s.keyLearnings
          .map(v => renderUserContent(v, CROSS_VENTURE_FIELD_CLIP))
          .join(' · ')
      : 'none recorded';

    return `[Venture: ${renderUserContent(e.ventureName, 200)}] Cycle ${s.cycleNumber} (${renderUserContent(s.recommendationType, 100)}) — completed ${date}
Recommendation: ${renderUserContent(s.recommendationSummary, 400)}
Validated: ${validated}
Invalidated: ${invalidated}
Key learnings: ${learnings}`;
  });

  return `## CROSS-VENTURE CONTEXT (other ventures the founder has run, NOT the current one)
Reference these only when relevant — patterns that recur across ventures, lessons that compound, conviction that's been earned. Do not pull tactics from these into the current venture without a real bridge.

${blocks.join('\n\n')}
`;
}

/**
 * Render a short interview opening block based on the scenario. The
 * question generator prepends this to set the conversational tone.
 *
 * - fresh_start with prior ventures: "Welcome back. Last time you..."
 * - fork_continuation: "You completed your roadmap for..."
 * - first_interview: empty string (run as today)
 */
export function renderInterviewOpeningBlock(
  scenario: 'fresh_start' | 'fork_continuation' | 'first_interview',
  profile: FounderProfile | null,
  forkContext: string | null,
): string {
  if (scenario === 'first_interview' || !profile) return '';

  if (scenario === 'fresh_start') {
    const jo = profile.journeyOverview;
    if (jo.completedVentures === 0 && jo.completedCycles === 0) return '';
    const recent = jo.mostRecentVentureName
      ? `Last time you worked on ${renderUserContent(jo.mostRecentVentureName, 200)}.`
      : `You have ${jo.completedVentures} prior venture${jo.completedVentures === 1 ? '' : 's'}.`;
    return `OPENING CONTEXT: Welcome the founder back. ${recent} They are starting something new. Skip all stable-context questions (location, skills, education, technical ability) — the Founder Profile already has them. Focus on: the new idea, why now, what resources they bring, and available time (which may have changed). Target: 5-8 questions, not 15-20.
`;
  }

  if (scenario === 'fork_continuation') {
    const forkLine = forkContext
      ? `They chose this direction: ${renderUserContent(forkContext, 400)}.`
      : 'They are continuing with the next cycle.';
    return `OPENING CONTEXT: The founder completed a cycle in this venture. ${forkLine} Open with recognition of the prior cycle. Skip stable-context questions. Ask only: what has changed since the last cycle, what specific aspect of this fork they are most focused on, and whether there is anything from the last cycle they want to carry forward or leave behind. Target: 3-5 questions, not 15-20.
`;
  }

  return '';
}
