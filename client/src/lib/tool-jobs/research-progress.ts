import 'server-only';
import type { ResearchExecutionProgressEvent } from '@/lib/roadmap/research-tool/execution-engine';
import { appendToolJobProgressEvent, updateToolJobStage } from './helpers';
import type { NewToolJobProgressEvent } from './progress-schema';

export function recordResearchPhase(
  jobId: string,
  label: string,
  status: NewToolJobProgressEvent['status'],
): Promise<void> {
  return appendToolJobProgressEvent(jobId, {
    kind: 'phase', status, label, source: null,
  });
}

export function createResearchProgressReporter(jobId: string) {
  return async (event: ResearchExecutionProgressEvent): Promise<void> => {
    if ('phase' in event) {
      if (event.status === 'started') await updateToolJobStage(jobId, 'emitting');
      await recordResearchPhase(jobId, 'Structuring the research report', event.status);
      return;
    }

    const isExa = event.tool === 'exa_search';
    await appendToolJobProgressEvent(jobId, {
      kind: 'search',
      status: event.status,
      label: isExa ? 'Searching for relevant entities' : 'Checking factual sources',
      source: isExa ? 'Exa' : 'Tavily',
    });
  };
}
