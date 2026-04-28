// src/lib/continuation/tool-artifact-aggregator.ts
//
// Pure aggregator over the four execution tools (Conversation Coach,
// Outreach Composer, Research Tool, Service Packager) that walks the
// already-loaded roadmap evidence and produces a structured per-tool
// summary the brief generator can quote back.
//
// Two storage locations are walked because tool sessions can be
// launched from either surface:
//
//   1. Task-bound — embedded inside `phases[].tasks[]` on optional
//      fields `coachSession` / `composerSession` / `researchSession` /
//      `packagerSession`. The shared StoredRoadmapTaskSchema declares
//      these as `z.object({}).passthrough().optional()` so they
//      round-trip without the schema rejecting unknown nested fields;
//      the per-tool strict schema validates each entry on access.
//
//   2. Standalone — top-level `Roadmap.toolSessions[]` JSONB array,
//      polymorphic by `tool` discriminator. The
//      ToolSessionsArraySchema validates the `id` + `tool` shape and
//      passes the rest through; the per-tool strict schema is applied
//      only when an entry of that tool type is encountered here.
//
// No I/O. No LLM calls. Pure walk + count + extract — safe to call
// inside an Inngest step.run block alongside the other render helpers.

import 'server-only';
import { COACH_TOOL_ID } from '@/lib/roadmap/coach/constants';
import { CoachSessionSchema, safeParseToolSessions } from '@/lib/roadmap/coach/schemas';
import { COMPOSER_TOOL_ID } from '@/lib/roadmap/composer/constants';
import { ComposerSessionSchema } from '@/lib/roadmap/composer/schemas';
import { RESEARCH_TOOL_ID } from '@/lib/roadmap/research-tool/constants';
import { ResearchSessionSchema } from '@/lib/roadmap/research-tool/schemas';
import { PACKAGER_TOOL_ID } from '@/lib/roadmap/service-packager/constants';
import { PackagerSessionSchema } from '@/lib/roadmap/service-packager/schemas';
import type { StoredRoadmapPhase, StoredRoadmapTask } from '@/lib/roadmap/checkin-types';
import type { ToolSessions } from '@/lib/roadmap/coach/schemas';

// safeParseToolSessions is exported from coach/schemas as the canonical
// parser for the Roadmap.toolSessions array (despite living in the coach
// module — that's where the polymorphic ToolSessionsArraySchema lives).
// Re-export so callers don't need a second import.
export { safeParseToolSessions };

// ---------------------------------------------------------------------------
// Per-tool summary shapes
// ---------------------------------------------------------------------------

export interface OutreachSummary {
  /** Total Composer sessions across all surfaces (task + standalone). */
  totalSessions:   number;
  /** Total messages drafted across all sessions. */
  messagesDrafted: number;
  /** Total messages the founder marked as sent. */
  messagesSent:    number;
  /** Channel distribution: how many sessions per channel. */
  channelMix:      { whatsapp: number; email: number; linkedin: number };
  /** Mode distribution: how many sessions per mode. */
  modeMix:         { single: number; batch: number; sequence: number };
  /** Up to 3 representative outreach goals — first-line snippet of each. */
  recentGoals:     string[];
}

export interface ResearchSummary {
  /** Total Research sessions across all surfaces. */
  totalSessions:    number;
  /** Total findings produced (initial report + follow-ups). */
  totalFindings:    number;
  /** Total sources cited across all reports. */
  totalSources:     number;
  /** Up to 5 query themes — the actual queries the founder asked. */
  queries:          string[];
  /** Total follow-up rounds across all sessions. */
  followUpRounds:   number;
}

export interface CoachSummary {
  /** Total Coach sessions across all surfaces. */
  totalSessions:    number;
  /** Sessions that produced a debrief (i.e. completed the role-play loop). */
  withDebrief:      number;
  /** Total role-play turns across all sessions. */
  rolePlayTurns:    number;
  /** Channel distribution. Free-form because COACH_CHANNELS includes more
   *  values than the three Composer channels. */
  channelMix:       Record<string, number>;
  /** Up to 3 conversation summaries — "{who} · {objective}". */
  conversations:    string[];
}

export interface PackagerSummary {
  /** Total Packager sessions across all surfaces. */
  totalSessions:    number;
  /** Sessions that produced a complete service package (`package` field
   *  populated and validated). */
  packagesProduced: number;
  /** Up to 3 (serviceName · tier-count · brief-format) lines. */
  packages:         string[];
  /** Total adjustment rounds across all sessions. */
  adjustments:      number;
}

export interface ToolArtifactSummary {
  outreach: OutreachSummary;
  research: ResearchSummary;
  coach:    CoachSummary;
  packager: PackagerSummary;
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/**
 * Walk every task across every phase plus the standalone toolSessions
 * array, and produce a single ToolArtifactSummary covering all four
 * execution tools.
 *
 * Defensive against malformed entries: each candidate session is
 * validated through its own strict Zod schema; a parse failure is
 * silently dropped so a single corrupt session never breaks the brief.
 */
export function aggregateToolArtifacts(
  phases:       StoredRoadmapPhase[],
  toolSessions: ToolSessions,
): ToolArtifactSummary {
  const summary: ToolArtifactSummary = {
    outreach: {
      totalSessions:   0,
      messagesDrafted: 0,
      messagesSent:    0,
      channelMix:      { whatsapp: 0, email: 0, linkedin: 0 },
      modeMix:         { single: 0, batch: 0, sequence: 0 },
      recentGoals:     [],
    },
    research: {
      totalSessions:  0,
      totalFindings:  0,
      totalSources:   0,
      queries:        [],
      followUpRounds: 0,
    },
    coach: {
      totalSessions: 0,
      withDebrief:   0,
      rolePlayTurns: 0,
      channelMix:    {},
      conversations: [],
    },
    packager: {
      totalSessions:    0,
      packagesProduced: 0,
      packages:         [],
      adjustments:      0,
    },
  };

  // Walk task-bound sessions inside the phases tree.
  for (const phase of phases) {
    for (const task of phase.tasks) {
      ingestTaskSessions(task, summary);
    }
  }

  // Walk standalone sessions in the polymorphic toolSessions array.
  for (const entry of toolSessions) {
    ingestStandaloneSession(entry, summary);
  }

  return summary;
}

function ingestTaskSessions(task: StoredRoadmapTask, summary: ToolArtifactSummary): void {
  if (task.coachSession)    ingestCoach(task.coachSession,       summary);
  if (task.composerSession) ingestComposer(task.composerSession, summary);
  if (task.researchSession) ingestResearch(task.researchSession, summary);
  if (task.packagerSession) ingestPackager(task.packagerSession, summary);
}

function ingestStandaloneSession(entry: { tool: string }, summary: ToolArtifactSummary): void {
  switch (entry.tool) {
    case COACH_TOOL_ID:     ingestCoach(entry,    summary); break;
    case COMPOSER_TOOL_ID:  ingestComposer(entry, summary); break;
    case RESEARCH_TOOL_ID:  ingestResearch(entry, summary); break;
    case PACKAGER_TOOL_ID:  ingestPackager(entry, summary); break;
    // Unknown tool — silently skip. Future tools can register here.
  }
}

// ---------------------------------------------------------------------------
// Per-tool ingest — strict-validates the entry, increments counters,
// captures up to N representative items
// ---------------------------------------------------------------------------

const MAX_REPRESENTATIVE_ITEMS = 3;
const MAX_RESEARCH_QUERIES     = 5;

function ingestComposer(entry: unknown, s: ToolArtifactSummary): void {
  const parsed = ComposerSessionSchema.safeParse(entry);
  if (!parsed.success) return;
  const session = parsed.data;
  const out = s.outreach;
  out.totalSessions += 1;
  out.messagesDrafted += session.output?.messages.length ?? 0;
  out.messagesSent    += session.sentMessages?.length    ?? 0;
  out.channelMix[session.channel] = (out.channelMix[session.channel] ?? 0) + 1;
  out.modeMix[session.mode]       = (out.modeMix[session.mode]       ?? 0) + 1;
  if (out.recentGoals.length < MAX_REPRESENTATIVE_ITEMS && session.context.goal) {
    out.recentGoals.push(truncate(session.context.goal, 140));
  }
}

function ingestResearch(entry: unknown, s: ToolArtifactSummary): void {
  const parsed = ResearchSessionSchema.safeParse(entry);
  if (!parsed.success) return;
  const session = parsed.data;
  const r = s.research;
  r.totalSessions   += 1;
  r.totalFindings   += session.report?.findings.length ?? 0;
  r.totalSources    += session.report?.sources.length  ?? 0;
  r.followUpRounds  += session.followUps?.length       ?? 0;
  if (r.queries.length < MAX_RESEARCH_QUERIES && session.query) {
    r.queries.push(truncate(session.query, 160));
  }
  // Follow-up queries also count toward the attention pattern.
  for (const fu of session.followUps ?? []) {
    if (r.queries.length < MAX_RESEARCH_QUERIES) {
      r.queries.push(truncate(fu.query, 160));
    } else break;
  }
}

function ingestCoach(entry: unknown, s: ToolArtifactSummary): void {
  const parsed = CoachSessionSchema.safeParse(entry);
  if (!parsed.success) return;
  const session = parsed.data;
  const c = s.coach;
  c.totalSessions += 1;
  if (session.debrief) c.withDebrief += 1;
  c.rolePlayTurns += session.rolePlayHistory?.length ?? 0;
  c.channelMix[session.channel] = (c.channelMix[session.channel] ?? 0) + 1;
  if (c.conversations.length < MAX_REPRESENTATIVE_ITEMS) {
    const who       = truncate(session.setup.who,       80);
    const objective = truncate(session.setup.objective, 120);
    c.conversations.push(`${who} · ${objective}`);
  }
}

function ingestPackager(entry: unknown, s: ToolArtifactSummary): void {
  const parsed = PackagerSessionSchema.safeParse(entry);
  if (!parsed.success) return;
  const session = parsed.data;
  const p = s.packager;
  p.totalSessions += 1;
  // PackagerSessionSchema requires `package` to be present, so a parsed
  // session is by definition a produced package.
  p.packagesProduced += 1;
  p.adjustments += session.adjustments?.length ?? 0;
  if (p.packages.length < MAX_REPRESENTATIVE_ITEMS) {
    const name      = truncate(session.package.serviceName, 80);
    const tierCount = session.package.tiers.length;
    p.packages.push(`${name} · ${tierCount} tier${tierCount === 1 ? '' : 's'} · ${session.package.briefFormat}`);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

/**
 * True when the summary has any signal worth rendering. The brief
 * generator skips the entire tool-artifacts block when this returns
 * false to avoid spending Opus tokens on an empty section.
 */
export function hasAnyToolActivity(s: ToolArtifactSummary): boolean {
  return (
    s.outreach.totalSessions > 0 ||
    s.research.totalSessions > 0 ||
    s.coach.totalSessions    > 0 ||
    s.packager.totalSessions > 0
  );
}
