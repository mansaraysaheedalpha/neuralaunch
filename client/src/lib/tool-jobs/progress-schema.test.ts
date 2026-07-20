import { describe, expect, it } from 'vitest';
import { ToolJobProgressEventSchema } from './progress-schema';
import { ToolJobStatusSchema } from './schemas';

describe('tool job progress events', () => {
  it('accepts a server-authored research event', () => {
    const event = ToolJobProgressEventSchema.parse({
      id: 'event-1',
      kind: 'search',
      status: 'completed',
      label: 'Checking factual sources',
      source: 'Tavily',
      occurredAt: '2026-07-20T12:00:00.000Z',
    });
    expect(event.source).toBe('Tavily');
  });

  it('rejects representational event kinds', () => {
    expect(() => ToolJobProgressEventSchema.parse({
      id: 'event-2',
      kind: 'estimated',
      status: 'started',
      label: 'Approximate work',
      source: null,
      occurredAt: '2026-07-20T12:00:00.000Z',
    })).toThrow();
  });

  it('defaults old status payloads to an empty event list', () => {
    const status = ToolJobStatusSchema.parse({
      id: 'job-1', toolType: 'research_execute', stage: 'queued',
      sessionId: 'session-1', errorMessage: null,
      startedAt: '2026-07-20T12:00:00.000Z',
      updatedAt: '2026-07-20T12:00:00.000Z', completedAt: null,
    });
    expect(status.events).toEqual([]);
  });
});
