// src/lib/roadmap/checkin-tool-awareness.ts
//
// Pure helpers that render the "THE FOUNDER USED TOOL X ON THIS TASK"
// prompt blocks the check-in agent appends when a task carries one of
// the four internal-tool sessions (coach, composer, research, packager).
//
// Each block is rendered defensively: if the passthrough JSON object
// is malformed or the required nested fields are missing, the block
// returns an empty string and the agent prompt simply omits that
// section. No throws — a malformed session must never crash the
// check-in turn.
//
// Extracted from checkin-agent.ts so the engine file stays under
// the 350-line agent cap.

import 'server-only';
import type { StoredRoadmapTask } from './checkin-types';
import { renderUserContent } from '@/lib/validation/server-helpers';

/**
 * Render every applicable tool-awareness block for the given task,
 * concatenated with blank lines. Returns the empty string when no
 * tool sessions exist on the task.
 */
export function renderToolAwarenessBlocks(task: StoredRoadmapTask): string {
  const blocks = [
    renderCoachBlock(task.coachSession),
    renderComposerBlock(task.composerSession),
    renderResearchBlock(task.researchSession),
    renderPackagerBlock(task.packagerSession),
  ].filter(b => b.length > 0);
  return blocks.join('\n');
}

// ---------------------------------------------------------------------------
// Conversation Coach
// ---------------------------------------------------------------------------

/**
 * Surface the founder's prior Coach session. Transforms a generic
 * "how did it go?" into "you prepared for a pricing objection at X —
 * did that come up?". Safe field reads + String() coercion so a
 * malformed session does not crash the agent prompt.
 */
function renderCoachBlock(session: unknown): string {
  if (!session || typeof session !== 'object') return '';
  const s = session as Record<string, unknown>;
  const setup = s.setup as Record<string, unknown> | undefined;
  if (!setup) return '';
  const who = String(setup.who ?? '');
  if (!who) return '';
  const objective = String(setup.objective ?? '');
  const fear      = String(setup.fear ?? '');
  const channel   = String(setup.channel ?? 'unknown');
  const rpHistory = Array.isArray(s.rolePlayHistory) ? s.rolePlayHistory : [];
  return `THE FOUNDER USED THE CONVERSATION COACH ON THIS TASK:
They prepared for a conversation with: ${renderUserContent(who, 200)}
Their objective was: ${renderUserContent(objective, 300)}
Their fear was: ${renderUserContent(fear, 200)}
Channel: ${channel}
They rehearsed: ${rpHistory.length > 0 ? 'yes, ' + rpHistory.length + ' turns' : 'no'}

When the founder checks in on this task, reference their preparation. If the conversation happened, ask how it compared to what they prepared for. If specific objections from the preparation came up, ask about them by name. If they haven't had the conversation yet, acknowledge the preparation and encourage them — they've done the hard work of preparing, now they need to execute.
`;
}

// ---------------------------------------------------------------------------
// Outreach Composer
// ---------------------------------------------------------------------------

/**
 * Surface the founder's prior Composer session so the check-in agent
 * can ask about responses and follow-up. Reads counts of generated
 * vs sent messages from the persisted session shape.
 */
function renderComposerBlock(session: unknown): string {
  if (!session || typeof session !== 'object') return '';
  const c   = session as Record<string, unknown>;
  const ctx = c.context as Record<string, unknown> | undefined;
  if (!ctx) return '';
  const target  = String(ctx.targetDescription ?? ctx.goal ?? '');
  const mode    = String(c.mode ?? 'unknown');
  const channel = String(c.channel ?? 'unknown');
  const output  = c.output as Record<string, unknown> | undefined;
  const msgs    = Array.isArray(output?.messages) ? output.messages : [];
  const sent    = Array.isArray(c.sentMessages) ? c.sentMessages : [];
  if (msgs.length === 0) return '';
  return `THE FOUNDER USED THE OUTREACH COMPOSER ON THIS TASK:
Mode: ${mode}
Channel: ${channel}
Target: ${renderUserContent(target, 300)}
Goal: ${renderUserContent(String(ctx.goal ?? ''), 300)}
Messages generated: ${msgs.length}
Messages marked as sent: ${sent.length}

When the founder checks in, reference their outreach. If they sent messages, ask about responses — did anyone reply? What did they say? If they generated messages but haven't sent them, ask what's holding them back. If they're in batch mode and sent some but not all, ask whether the remaining targets are still worth pursuing or whether the responses they got changed their approach.
`;
}

// ---------------------------------------------------------------------------
// Founder Research Tool
// ---------------------------------------------------------------------------

/**
 * Surface the founder's prior Research session. Summarises finding
 * type counts (e.g. "3 competitor, 2 datapoint") so the agent can
 * connect findings to execution.
 */
function renderResearchBlock(session: unknown): string {
  if (!session || typeof session !== 'object') return '';
  const r = session as Record<string, unknown>;
  const query  = String(r.query ?? '');
  if (!query) return '';
  const report    = r.report as Record<string, unknown> | undefined;
  const findings  = Array.isArray(report?.findings) ? report.findings : [];
  const followUps = Array.isArray(r.followUps) ? r.followUps : [];
  const typeCounts: Record<string, number> = {};
  for (const f of findings) {
    const t = String((f as Record<string, unknown>).type ?? 'unknown');
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }
  const typesSummary = Object.entries(typeCounts).map(([t, c]) => `${c} ${t}`).join(', ');
  return `THE FOUNDER USED THE RESEARCH TOOL ON THIS TASK:
Original query: ${renderUserContent(query, 300)}
Findings count: ${findings.length} (${typesSummary || 'none'})
Follow-up rounds: ${followUps.length}

When the founder checks in, reference their research. If they found potential customers or businesses, ask whether they've reached out yet. If they researched competitors, ask how their own offering compares based on what they learned. If they investigated regulations, ask whether they've taken any compliance steps. The research was done to inform action — the check-in should connect findings to execution.
`;
}

// ---------------------------------------------------------------------------
// Service Packager
// ---------------------------------------------------------------------------

/**
 * Surface the founder's prior Packager session — service name, target
 * client, tier count, pricing range, and adjustment count — so the
 * check-in agent can ask grounded questions about pitching outcomes
 * and pricing pushback.
 */
function renderPackagerBlock(session: unknown): string {
  if (!session || typeof session !== 'object') return '';
  const p   = session as Record<string, unknown>;
  const pkg = p.package as Record<string, unknown> | undefined;
  if (!pkg) return '';
  const serviceName  = String(pkg.serviceName ?? '');
  if (!serviceName) return '';
  const targetClient = String(pkg.targetClient ?? '');
  const tiers        = Array.isArray(pkg.tiers) ? pkg.tiers : [];
  const adjustments  = Array.isArray(p.adjustments) ? p.adjustments : [];
  const lowestPrice  = String((tiers[0] as Record<string, unknown> | undefined)?.price ?? '');
  const highestPrice = String((tiers[tiers.length - 1] as Record<string, unknown> | undefined)?.price ?? '');
  const priceRange   = lowestPrice && highestPrice && lowestPrice !== highestPrice
    ? `${lowestPrice} – ${highestPrice}`
    : (lowestPrice || '—');
  return `THE FOUNDER USED THE SERVICE PACKAGER ON THIS TASK:
Service name: ${renderUserContent(serviceName, 200)}
Target client: ${renderUserContent(targetClient, 400)}
Number of tiers: ${tiers.length}
Pricing range: ${renderUserContent(priceRange, 100)}
Adjustments made: ${adjustments.length}

When the founder checks in, reference their service package. If they've started pitching, ask which tier prospects are gravitating toward. If they're getting pushback on pricing, reference the justification from the package and ask whether the market data still holds. If the package exists but they haven't started using it yet, ask what's holding them back — is the pricing not feeling right, or is the scope unclear, or is it the outreach itself they're avoiding?
`;
}
