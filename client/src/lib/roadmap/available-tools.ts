// src/lib/roadmap/available-tools.ts
//
// Single source of truth for which roadmap-integrated tools are
// available to a given tier. Consumed by:
//   - roadmap-engine.ts — composes the `Available tools:` prompt
//     section from this list at generation time.
//   - Task UI and /tools hub — when a UI-side tool-availability
//     check is needed.
//
// Per the feat/validation-tool-integration plan, validation
// repositions to Execute tier (alongside Coach, Composer, Research,
// Packager). Execute and Compound therefore receive the identical
// 5-tool roster; Free receives none — Free users hit the upgrade
// prompt on task cards and on the /tools hub.

import { COACH_TOOL_ID }     from './coach/constants';
import { COMPOSER_TOOL_ID }  from './composer/constants';
import { RESEARCH_TOOL_ID }  from './research-tool/constants';
import { PACKAGER_TOOL_ID }  from './service-packager/constants';
import { VALIDATION_TOOL_ID } from './validation/constants';
import type { Tier } from '@/lib/paddle/tiers';

export interface ToolMeta {
  id:          string;
  displayName: string;
  /**
   * One-sentence description used by the roadmap generator prompt to
   * explain when to suggest this tool. Keep it tight — the model
   * reads this verbatim and decides per-task whether to bind.
   */
  prompt:      string;
}

const COACH: ToolMeta = {
  id:          COACH_TOOL_ID,
  displayName: 'Conversation Coach',
  prompt:      'Helps founders prepare for and rehearse high-stakes one-on-one conversations. Generates scripts, objection handling, fallback positions, and offers role-play rehearsal. Suggest this for any task involving pitching, negotiating, asking for something, confronting someone, or having a difficult conversation.',
};

const COMPOSER: ToolMeta = {
  id:          COMPOSER_TOOL_ID,
  displayName: 'Outreach Composer',
  prompt:      'Generates ready-to-send outreach messages for WhatsApp, email, and LinkedIn. Three modes: single message, batch messages, and follow-up sequences. Suggest this for any task involving sending messages, following up, or reaching out to multiple people.',
};

const RESEARCH: ToolMeta = {
  id:          RESEARCH_TOOL_ID,
  displayName: 'Research Tool',
  prompt:      "Helps founders research their market, find potential customers or businesses, investigate competitors, check regulations, find pricing benchmarks, and answer any factual question about their business context. Suggest this for any task that requires the founder to find information they don't currently have.",
};

const PACKAGER: ToolMeta = {
  id:          PACKAGER_TOOL_ID,
  displayName: 'Service Packager',
  prompt:      'Helps founders define, scope, and price their service offering. Produces a named service package with tiered pricing, revenue scenarios, and a shareable one-page brief. Suggest this for any task that involves defining what the founder is selling, setting prices, creating service tiers, or producing a document that describes the offering to prospects. Especially relevant for build_service recommendations.',
};

const VALIDATION: ToolMeta = {
  id:          VALIDATION_TOOL_ID,
  displayName: 'Validation Page',
  prompt:      'Generates a live landing page for a specific offering — product, service tier, or specific value proposition — with a CTA, feature-interest tracking, and a short interest survey. Visitor behaviour feeds back into the continuation brief as a real market signal. Suggest this ONLY when the founder is about to spend meaningful time or money on an unbuilt offering and needs concrete demand evidence before committing — e.g. "publish a landing page for the premium tier and share it with 20 prospects" or "put up a one-pager for the idea and collect email signups before you code." Do NOT suggest this as a universal first step — it should come after the founder has enough context to describe what they are validating.',
};

const ALL_FIVE: readonly ToolMeta[] = [RESEARCH, COACH, COMPOSER, PACKAGER, VALIDATION];

/**
 * Return the tools available to a given tier. Paid tiers get the full
 * roster (validation is repositioned to Execute+ per the integration
 * plan); Free returns an empty array so the roadmap generator simply
 * doesn't offer tools to Free-tier roadmaps (Free doesn't reach the
 * roadmap generator today anyway — the venture cap blocks them — but
 * the guard is defensive).
 */
export function tierAvailableTools(tier: Tier): readonly ToolMeta[] {
  if (tier === 'execute' || tier === 'compound') return ALL_FIVE;
  return [];
}
