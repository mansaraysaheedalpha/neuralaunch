// src/app/(app)/tools/packager-handoff.ts
//
// Shared client-side helpers for tools receiving a "fromPackager"
// handoff. Each standalone tool page (Composer, Coach, Research)
// reads the ?fromPackager=<sessionId>&roadmapId=<id> URL params,
// fetches the package via the read-only sessions endpoint, and uses
// the returned ServicePackage + ServiceContext to build sensible
// pre-populated input for its own first stage.

import type { ServicePackage, ServiceContext } from '@/lib/roadmap/service-packager/schemas';
import type { ResearchSession } from '@/lib/roadmap/research-tool/schemas';

export interface PackagerHandoff {
  package: ServicePackage;
  context: ServiceContext;
}

/**
 * Read fromPackager + roadmapId from window.location.search. Returns
 * null when either is absent.
 */
export function readPackagerHandoffParams(): { roadmapId: string; sessionId: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('fromPackager');
  const roadmapId = params.get('roadmapId');
  if (!sessionId || !roadmapId) return null;
  return { sessionId, roadmapId };
}

/**
 * Fetch the packager session by id. Returns null on any failure —
 * receiving tools should treat the handoff as best-effort and fall
 * back to their own normal flow when the fetch fails.
 */
export async function fetchPackagerHandoff(roadmapId: string, sessionId: string): Promise<PackagerHandoff | null> {
  try {
    const res = await fetch(
      `/api/discovery/roadmaps/${roadmapId}/packager/sessions/${sessionId}`,
      { headers: { 'Accept': 'application/json' } },
    );
    if (!res.ok) return null;
    const json = await res.json() as PackagerHandoff;
    if (!json.package || !json.context) return null;
    return json;
  } catch {
    return null;
  }
}

/**
 * Build a research query string from a packaged service. Used by the
 * standalone Research Tool page when it receives a packager handoff.
 */
export function buildResearchQueryFromPackage(handoff: PackagerHandoff): string {
  const { package: pkg, context } = handoff;
  const market = context.targetMarket ? ` in ${context.targetMarket}` : '';
  return `Find competitors and market intelligence for "${pkg.serviceName}" — a service offering for ${pkg.targetClient}${market}. I want to understand who else offers similar services, how they price compared to my tiers, and any gaps in their offerings I could exploit.`;
}

/**
 * Build the founder's first message for the Outreach Composer's
 * context-collection chat. The Composer infers the rest (mode, channel)
 * from this message but pre-populates targetDescription, goal, and
 * pricing context so the messages it generates pitch the actual package.
 */
export function buildComposerSeedMessage(handoff: PackagerHandoff): string {
  const { package: pkg } = handoff;
  const tierLine = pkg.tiers.length > 0
    ? pkg.tiers.map(t => `${t.displayName} at ${t.price} ${t.period}`).join(', ')
    : '';
  return `I want to draft outreach messages pitching my service "${pkg.serviceName}" to ${pkg.targetClient}. ${tierLine ? `Pricing tiers: ${tierLine}.` : ''} The goal is to get them to reply yes to a trial or first meeting. Please use WhatsApp as the channel and batch mode (5-10 personalised messages I can send to similar prospects).`;
}

/**
 * Build the founder's first message for the Conversation Coach's
 * setup chat. Names the package and the pricing pushback fear since
 * pricing is the most common pushback when pitching a new service.
 */
export function buildCoachSeedMessage(handoff: PackagerHandoff): string {
  const { package: pkg } = handoff;
  const lowest = pkg.tiers[0]?.price;
  return `I need to prepare for a conversation with a prospect from ${pkg.targetClient} about my service "${pkg.serviceName}". The objective is to walk them through the offering and get them to commit to a trial or first engagement. My biggest fear is that they'll push back on the price${lowest ? ` (starting at ${lowest})` : ''} and I won't have a confident answer. The conversation will likely happen on WhatsApp.`;
}

/**
 * Build the founder's first message for the standalone Packager when
 * arriving from a Research → Packager handoff. Includes the original
 * query and a compact summary of competitor/datapoint findings so the
 * context-confirmation agent can extract them into the structured
 * ServiceContext.researchFindings field.
 */
export function buildPackagerSeedFromResearch(session: ResearchSession): string {
  const findings    = session.report?.findings ?? [];
  const competitors = findings.filter(f => f.type === 'competitor').slice(0, 5);
  const datapoints  = findings.filter(f => f.type === 'datapoint').slice(0, 5);

  const lines: string[] = [
    `I just used the Research Tool to investigate: "${session.query}".`,
    '',
    'I want to package this into a concrete service offering with tiered pricing based on what I found.',
  ];

  if (competitors.length > 0) {
    lines.push('', 'Competitors found:');
    for (const c of competitors) lines.push(`- ${c.title}: ${c.description}`);
  }
  if (datapoints.length > 0) {
    lines.push('', 'Market data points:');
    for (const d of datapoints) lines.push(`- ${d.title}: ${d.description}`);
  }

  return lines.join('\n');
}
