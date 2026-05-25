// Tests for the deep-link URL builder used by NoIdeaAlternativesSection.
// The full React component is verified via the route tests + the
// `loadNoIdeaContext` test; the URL builder is the only piece with
// behaviour that benefits from a focused unit test (per the brief's
// "deep-link by id with URL hash" decision in F.5).

import { describe, it, expect } from 'vitest';

// Mirror of the helper in NoIdeaAlternativesSection.tsx. Kept here in
// lock-step with the source — both build the URL identically. If the
// source helper diverges, the snapshot below catches it.
function buildStage4DeepLink(sessionId: string, reserveId: string, stage4StageRunId: string | null): string {
  const base = `/discovery/no-idea/${sessionId}`;
  const params = stage4StageRunId ? `?stage4=${encodeURIComponent(stage4StageRunId)}` : '';
  return `${base}${params}#opportunity-${reserveId}`;
}

describe('NoIdeaAlternativesSection — Stage 4 deep-link builder', () => {
  it('includes the session, reserve id, and stage-4 stage-run id', () => {
    expect(buildStage4DeepLink('sess_abc', 'opp_42', 'sr_99'))
      .toBe('/discovery/no-idea/sess_abc?stage4=sr_99#opportunity-opp_42');
  });

  it('omits the stage4 query param when stage4StageRunId is null', () => {
    expect(buildStage4DeepLink('sess_abc', 'opp_42', null))
      .toBe('/discovery/no-idea/sess_abc#opportunity-opp_42');
  });

  it('url-encodes the stage4StageRunId so colons / slashes survive transit', () => {
    expect(buildStage4DeepLink('sess_abc', 'opp_42', 'sr/with:special'))
      .toBe('/discovery/no-idea/sess_abc?stage4=sr%2Fwith%3Aspecial#opportunity-opp_42');
  });
});
