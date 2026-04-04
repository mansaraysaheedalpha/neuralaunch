// src/lib/roadmap/roadmap-engine.ts
import 'server-only';
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { RoadmapSchema, Roadmap } from './roadmap-schema';
import { ROADMAP_MODELS, MAX_ROADMAP_PHASES, MAX_TASKS_PER_PHASE, WEEKLY_HOURS_MAP } from './constants';
import type { Recommendation } from '@/lib/discovery/recommendation-schema';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';
import type { AudienceType } from '@/lib/discovery/constants';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

function resolveWeeklyHours(context: DiscoveryContext): number {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const availableTimeValue = context.availableTime?.value as string | null | undefined;
  const raw = availableTimeValue ?? undefined;
  if (!raw) return 10; // default: 1-2 hours/day

  const lower = raw.toLowerCase();
  for (const [key, hours] of Object.entries(WEEKLY_HOURS_MAP)) {
    if (lower.includes(key)) return hours;
  }

  // Parse numeric fallback: "20 hours a week"
  const numericMatch = lower.match(/(\d+)\s*hours?/);
  if (numericMatch) return parseInt(numericMatch[1], 10);

  return 10;
}

const AUDIENCE_ROADMAP_RULES: Record<AudienceType, string> = {
  LOST_GRADUATE:
    'Sequence for momentum first. Early tasks must produce a visible output — something they can show another person — within the first two weeks. Do not plan for scale. Plan for the first concrete thing.',
  STUCK_FOUNDER:
    'Acknowledge what they have already done. Do not repeat the tasks that got them here. The first phase must break the pattern — do something structurally different from what stalled them before.',
  ESTABLISHED_OWNER:
    'Start from what already exists. The first tasks must move an existing asset — a customer, a product, a relationship — not build something from zero. No basics. Strategic leverage only.',
  ASPIRING_BUILDER:
    'The first phase must end with a real conversation with a real potential customer. Everything before that conversation is preparation for it. The roadmap gates on customer validation before any build work.',
  MID_JOURNEY_PROFESSIONAL:
    'Every single task must be achievable in the hours they have stated. No task requires a day off work, no phase requires full-time availability. If a task cannot fit their schedule, it is the wrong task.',
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * generateRoadmap
 *
 * Takes the validated Recommendation and the full DiscoveryContext from the
 * interview and produces a structured, phased execution plan via generateObject.
 * The plan is personal to the user's constraints — never generic.
 */
export async function generateRoadmap(
  recommendation: Recommendation,
  context:        DiscoveryContext,
  audienceType:   AudienceType | null,
  sessionId:      string,
): Promise<{ roadmap: Roadmap; weeklyHours: number; totalWeeks: number }> {
  const log = logger.child({ module: 'RoadmapEngine', sessionId });

  const weeklyHours  = resolveWeeklyHours(context);
  const audienceRule = audienceType ? AUDIENCE_ROADMAP_RULES[audienceType] : '';

  // Cross-module Zod inference: ESLint's TS service does not resolve
  // beliefField<T>.value through the @/ alias the same way tsc does.
  // tsc compiles clean; these suppressions cover only that tool gap.
  /* eslint-disable @typescript-eslint/no-unsafe-member-access */
  const availableTime    = context.availableTime?.value    as string | undefined;
  const financialRunway  = context.financialRunway?.value  as string | undefined;
  const technicalAbility = context.technicalAbility?.value as string | undefined;
  const teamSize         = context.teamSize?.value         as string | undefined;
  const market           = context.geographicMarket?.value as string | undefined;
  const devotionLevel    = context.devotionLevel?.value    as string | undefined;
  const financialGoal    = context.financialGoal?.value    as string | undefined;
  /* eslint-enable @typescript-eslint/no-unsafe-member-access */

  const contextSummary = [
    availableTime    && `Available time: ${availableTime}`,
    financialRunway  && `Financial runway: ${financialRunway}`,
    technicalAbility && `Technical ability: ${technicalAbility}`,
    teamSize         && `Team: ${teamSize}`,
    market           && `Market: ${market}`,
    devotionLevel    && `Commitment level: ${devotionLevel}`,
    financialGoal    && `Financial goal: ${financialGoal}`,
  ].filter(Boolean).join('\n');

  const firstStepsBlock = recommendation.firstThreeSteps
    .map((s: string, i: number) => `${i + 1}. ${s}`)
    .join('\n');

  log.debug('Generating roadmap', { weeklyHours, audienceType });

  const { object } = await generateObject({
    model:  anthropic(ROADMAP_MODELS.PLANNER),
    schema: RoadmapSchema,
    messages: [{
      role:    'user',
      content: `You are building a personalised execution roadmap for someone who just received a strategic recommendation.

RECOMMENDATION:
Path: ${recommendation.path}
Summary: ${recommendation.summary}
Reasoning: ${recommendation.reasoning}

FIRST THREE STEPS (already defined — use these to open Phase 1):
${firstStepsBlock}

THEIR CONSTRAINTS:
${contextSummary}
Available hours per week: ${weeklyHours}

${audienceRule ? `AUDIENCE RULE — follow this precisely:\n${audienceRule}\n` : ''}
WHAT MAKES THIS WRONG (keep this in mind — don't build a plan that walks into these):
${recommendation.whatWouldMakeThisWrong}

RULES:
1. Maximum ${MAX_ROADMAP_PHASES} phases. Maximum ${MAX_TASKS_PER_PHASE} tasks per phase.
2. Phase 1 opens with the three steps above — adapt them as tasks, do not copy them verbatim.
3. Every task must be achievable in the time they have. If they have ${weeklyHours} hours/week, no single task should exceed one week of that.
4. Do not include tasks that require resources they do not have (e.g. paid tools if runway is low, full-time focus if they are employed).
5. Tasks must be specific. Not "research your market" — "identify 5 competitors, note their pricing and one gap in their offering".
6. successCriteria must be observable and binary. "Have it or don't." Not "understand" or "feel confident".
7. durationWeeks must be realistic. At ${weeklyHours} hours/week, a phase with 5 tasks averaging 3 hours each takes at least 2 weeks.
8. closingThought is addressed directly to this person — use "you", reference their specific situation, and end with the one action they should take today.

Build the roadmap now.`,
    }],
  });

  const totalWeeks = object.phases.reduce((sum, p) => sum + p.durationWeeks, 0);

  log.debug('Roadmap generated', { phases: object.phases.length, totalWeeks });

  return { roadmap: object, weeklyHours, totalWeeks };
}
