// src/lib/continuation/tool-artifact-renderer.ts
//
// Render the ToolArtifactSummary into the prompt block the brief
// generator quotes back. Kept in its own file (rather than added to
// brief-renderers.ts or tool-artifact-aggregator.ts) so neither
// breaches the 300-line service cap.
//
// Pure string assembly — no I/O, no LLM calls. Returns an empty
// string when the summary has no signal so the brief prompt
// concatenation drops the block cleanly without trailing
// whitespace artefacts.

import 'server-only';
import {
  hasAnyToolActivity,
  type ToolArtifactSummary,
} from './tool-artifact-aggregator';

/**
 * renderToolArtifactsBlock
 *
 * Produces the EXECUTION TOOL ARTIFACTS block for the continuation
 * brief prompt. Each tool gets a one-line summary plus a small
 * indented block of representative items (recent goals, queries,
 * conversations, packaged offers) so the brief generator can quote
 * back specific evidence ("you sent 23 outreach messages, 12 on
 * WhatsApp, mostly to suppliers — 2 reply notes captured in
 * check-ins") instead of generalising.
 *
 * Returns '' when no tool activity exists. Trailing newline included
 * when the block has content so the next prompt section starts on
 * a fresh line.
 */
export function renderToolArtifactsBlock(s: ToolArtifactSummary): string {
  if (!hasAnyToolActivity(s)) return '';

  const lines: string[] = [
    'EXECUTION TOOL ARTIFACTS (what the founder actually did with the toolkit during this cycle):',
  ];

  // --- Outreach
  if (s.outreach.totalSessions > 0) {
    const o = s.outreach;
    lines.push(
      `- Outreach Composer: ${o.totalSessions} session(s), ${o.messagesDrafted} messages drafted, ${o.messagesSent} marked sent.`
    );
    const channelParts: string[] = [];
    if (o.channelMix.whatsapp > 0) channelParts.push(`WhatsApp ${o.channelMix.whatsapp}`);
    if (o.channelMix.email    > 0) channelParts.push(`email ${o.channelMix.email}`);
    if (o.channelMix.linkedin > 0) channelParts.push(`LinkedIn ${o.channelMix.linkedin}`);
    if (channelParts.length > 0) lines.push(`    Channels: ${channelParts.join(', ')}.`);
    const modeParts: string[] = [];
    if (o.modeMix.single   > 0) modeParts.push(`${o.modeMix.single} single`);
    if (o.modeMix.batch    > 0) modeParts.push(`${o.modeMix.batch} batch`);
    if (o.modeMix.sequence > 0) modeParts.push(`${o.modeMix.sequence} sequence`);
    if (modeParts.length > 0) lines.push(`    Modes: ${modeParts.join(', ')}.`);
    if (o.recentGoals.length > 0) {
      lines.push('    Outreach goals captured:');
      for (const g of o.recentGoals) lines.push(`      • ${g}`);
    }
  }

  // --- Research
  if (s.research.totalSessions > 0) {
    const r = s.research;
    lines.push(
      `- Research Tool: ${r.totalSessions} session(s), ${r.totalFindings} findings across ${r.totalSources} sources, ${r.followUpRounds} follow-up round(s).`
    );
    if (r.queries.length > 0) {
      lines.push('    What the founder researched (attention pattern):');
      for (const q of r.queries) lines.push(`      • ${q}`);
    }
  }

  // --- Coach
  if (s.coach.totalSessions > 0) {
    const c = s.coach;
    lines.push(
      `- Conversation Coach: ${c.totalSessions} session(s), ${c.withDebrief} with debrief, ${c.rolePlayTurns} role-play turn(s).`
    );
    const channelEntries = Object.entries(c.channelMix).filter(([, n]) => n > 0);
    if (channelEntries.length > 0) {
      lines.push(`    Channels: ${channelEntries.map(([k, n]) => `${k} ${n}`).join(', ')}.`);
    }
    if (c.conversations.length > 0) {
      lines.push('    Conversations rehearsed:');
      for (const conv of c.conversations) lines.push(`      • ${conv}`);
    }
  }

  // --- Packager
  if (s.packager.totalSessions > 0) {
    const p = s.packager;
    lines.push(
      `- Service Packager: ${p.totalSessions} session(s), ${p.packagesProduced} package(s) produced, ${p.adjustments} adjustment round(s).`
    );
    if (p.packages.length > 0) {
      lines.push('    Packages assembled:');
      for (const pkg of p.packages) lines.push(`      • ${pkg}`);
    }
  }

  lines.push(
    'INTERPRETATION GUIDANCE: when these counts contradict the founder\'s stated effort or align with a fork direction, name the pattern. Example: "you drafted 47 outreach messages and only marked 12 as sent — the gap suggests the messages didn\'t feel ready, which lines up with the pricing-clarity blocker on Phase 2 task 3." Do NOT invent reply rates or outcomes that the founder did not log; the artifacts are activity, not response data.'
  );

  return lines.join('\n') + '\n\n';
}
