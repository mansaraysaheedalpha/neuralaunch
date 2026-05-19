// src/lib/ideation/stage4-opportunities/community-response-pipeline.test.ts
//
// Community-response pipeline orchestration tests. Mocks the
// individual side-effecting helpers (vision-extractor, synthesizer,
// stage-run-store persists) at the module boundary; verifies the
// branching logic the pipeline owns:
//   - text_paste skips vision entirely
//   - screenshot happy path runs moderation → extraction → both persists
//   - screenshot moderation throw → fail-closed reason='moderation_call_failed'
//   - screenshot moderation unsafe → moderationReason=mod.reason; no extraction
//   - screenshot extraction throw → moderationReason='extraction_failed'
// In every case the aggregate recompute + verdict synthesis + agent
// verdict write fire — those happen unconditionally after the
// response is logged.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/validation/server-helpers', () => {
  class HttpError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = 'HttpError';
    }
  }
  return { HttpError };
});

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const visionMock = vi.hoisted(() => ({
  runModerationGate: vi.fn(),
  extractSignal:     vi.fn(),
}));
vi.mock('./vision-extractor', () => ({
  runModerationGate: visionMock.runModerationGate,
  extractSignal:     visionMock.extractSignal,
}));

const synthMock = vi.hoisted(() => ({ synthesizeVerdict: vi.fn() }));
vi.mock('./verdict-synthesizer', () => ({ synthesizeVerdict: synthMock.synthesizeVerdict }));

const storeMock = vi.hoisted(() => ({
  requireOwnedStageRun:                vi.fn(),
  persistCommunityResponse:            vi.fn(() => Promise.resolve()),
  updateCommunityResponseExtraction:   vi.fn(() => Promise.resolve()),
  recomputeOpportunityAggregateSignal: vi.fn(() => Promise.resolve()),
  persistAgentVerdict:                 vi.fn(() => Promise.resolve()),
}));
vi.mock('../stage-run-store', () => storeMock);

const stateMock = vi.hoisted(() => ({
  safeParseStage4AuthoringState: vi.fn(),
  buildCommunityResponse:        vi.fn(),
}));
vi.mock('./state', () => stateMock);

import { runCommunityResponsePipeline } from './community-response-pipeline';

function makeOpp(over: Partial<{ painPointSummary: string; layerBExtractedSignal: unknown }> = {}) {
  return {
    id:                   'opp-1',
    painPointSummary:     'pain summary',
    layerAResearch:       null,
    layerBExtractedSignal: null,
    ...over,
  };
}

beforeEach(() => {
  visionMock.runModerationGate.mockReset();
  visionMock.extractSignal.mockReset();
  synthMock.synthesizeVerdict.mockReset();
  storeMock.requireOwnedStageRun.mockReset();
  stateMock.safeParseStage4AuthoringState.mockReset();
  stateMock.buildCommunityResponse.mockReset();
  storeMock.persistCommunityResponse.mockClear();
  storeMock.updateCommunityResponseExtraction.mockClear();
  storeMock.recomputeOpportunityAggregateSignal.mockClear();
  storeMock.persistAgentVerdict.mockClear();

  // Default plumbing: reload returns a stage row with one opp.
  storeMock.requireOwnedStageRun.mockResolvedValue({ output: {}, sessionId: 's' });
  stateMock.safeParseStage4AuthoringState.mockReturnValue({ opportunities: [makeOpp()] });
  stateMock.buildCommunityResponse.mockImplementation((input: { source: string; opportunityId: string }) => ({
    id:           'resp-1',
    opportunityId: input.opportunityId,
    source:       input.source,
    s3Key:        input.source === 'screenshot' ? 'k1' : null,
  }));
  synthMock.synthesizeVerdict.mockResolvedValue({ verdict: 'pursue', reasoning: 'because' });
});

// ---------------------------------------------------------------------------
// text_paste — no vision
// ---------------------------------------------------------------------------

describe('runCommunityResponsePipeline — text_paste', () => {
  it('skips vision entirely; recompute + verdict fire', async () => {
    const result = await runCommunityResponsePipeline({
      stageRunId: 'sr', userId: 'u',
      input: { opportunityId: 'opp-1', source: 'text_paste', pastedText: 'a comment' },
    });

    expect(visionMock.runModerationGate).not.toHaveBeenCalled();
    expect(visionMock.extractSignal).not.toHaveBeenCalled();
    expect(storeMock.recomputeOpportunityAggregateSignal).toHaveBeenCalledWith('sr', 'u', 'opp-1');
    expect(synthMock.synthesizeVerdict).toHaveBeenCalledTimes(1);
    expect(storeMock.persistAgentVerdict).toHaveBeenCalledWith('sr', 'u', 'opp-1', 'pursue', 'because');
    expect(result.moderationPassed).toBe(true);
    expect(result.agentVerdict).toBe('pursue');
  });
});

// ---------------------------------------------------------------------------
// screenshot — happy path
// ---------------------------------------------------------------------------

describe('runCommunityResponsePipeline — screenshot happy path', () => {
  it('moderation safe → extraction → both persists fire; verdict synthesizes', async () => {
    visionMock.runModerationGate.mockResolvedValue({ safe: true, reason: 'ok' });
    visionMock.extractSignal.mockResolvedValue({
      platformIdentified: 'HN', originalPost: { visible: true, voteCount: 1, bodyExcerpt: 'b' },
      comments: [], keyQuotes: [], contradictionsToPain: [], unparseableNotes: null,
    });

    const result = await runCommunityResponsePipeline({
      stageRunId: 'sr', userId: 'u',
      input: { opportunityId: 'opp-1', source: 'screenshot', s3Url: 'https://u', s3Key: 'k1' },
    });

    expect(visionMock.runModerationGate).toHaveBeenCalledWith({ s3Key: 'k1' });
    expect(visionMock.extractSignal).toHaveBeenCalledTimes(1);

    expect(storeMock.updateCommunityResponseExtraction).toHaveBeenCalledWith('sr', 'u', 'resp-1', expect.objectContaining({
      moderationPassed: true,
      moderationReason: null,
    }));
    expect(result.agentVerdict).toBe('pursue');
  });
});

// ---------------------------------------------------------------------------
// screenshot — fail-closed paths
// ---------------------------------------------------------------------------

describe('runCommunityResponsePipeline — screenshot fail-closed', () => {
  it("moderation throw → moderationReason='moderation_call_failed'; no extraction; still synthesizes", async () => {
    visionMock.runModerationGate.mockRejectedValue(new Error('overloaded twice'));

    const result = await runCommunityResponsePipeline({
      stageRunId: 'sr', userId: 'u',
      input: { opportunityId: 'opp-1', source: 'screenshot', s3Url: 'https://u', s3Key: 'k1' },
    });

    expect(visionMock.extractSignal).not.toHaveBeenCalled();
    expect(storeMock.updateCommunityResponseExtraction).toHaveBeenCalledWith('sr', 'u', 'resp-1', {
      moderationPassed: false,
      moderationReason: 'moderation_call_failed',
      extractedSignal:  null,
    });
    expect(synthMock.synthesizeVerdict).toHaveBeenCalledTimes(1);
    expect(result.agentVerdict).toBe('pursue');
  });

  it('moderation unsafe → moderationReason=mod.reason; no extraction', async () => {
    visionMock.runModerationGate.mockResolvedValue({ safe: false, reason: 'explicit content' });

    await runCommunityResponsePipeline({
      stageRunId: 'sr', userId: 'u',
      input: { opportunityId: 'opp-1', source: 'screenshot', s3Url: 'https://u', s3Key: 'k1' },
    });

    expect(visionMock.extractSignal).not.toHaveBeenCalled();
    expect(storeMock.updateCommunityResponseExtraction).toHaveBeenCalledWith('sr', 'u', 'resp-1', {
      moderationPassed: false,
      moderationReason: 'explicit content',
      extractedSignal:  null,
    });
  });

  it("extraction throw after safe moderation → moderationReason='extraction_failed'; still synthesizes", async () => {
    visionMock.runModerationGate.mockResolvedValue({ safe: true, reason: 'ok' });
    visionMock.extractSignal.mockRejectedValue(new Error('vision sdk threw'));

    await runCommunityResponsePipeline({
      stageRunId: 'sr', userId: 'u',
      input: { opportunityId: 'opp-1', source: 'screenshot', s3Url: 'https://u', s3Key: 'k1' },
    });

    expect(storeMock.updateCommunityResponseExtraction).toHaveBeenCalledWith('sr', 'u', 'resp-1', {
      moderationPassed: false,
      moderationReason: 'extraction_failed',
      extractedSignal:  null,
    });
    expect(synthMock.synthesizeVerdict).toHaveBeenCalledTimes(1);
  });
});
