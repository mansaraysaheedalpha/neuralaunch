'use client';

import { useCallback, useEffect, useState } from 'react';
import { buildPackagerSeedFromResearch } from '@/app/(app)/tools/packager-handoff';
import type { ResearchSession } from '@/lib/roadmap/research-tool/schemas';
import type { ServiceContext, ServicePackage } from '@/lib/roadmap/service-packager/schemas';
import { useToolJob } from '@/lib/tool-jobs/use-tool-job';

export type PackagerStage = 'loading' | 'no_roadmap' | 'intro' | 'loading_context' | 'context' | 'loading_generation' | 'output';

interface SessionResponse {
  package: ServicePackage;
  context: ServiceContext;
  adjustments?: Array<{ round: number }>;
}

function updateSessionUrl(sessionId: string | null) {
  const url = new URL(window.location.href);
  if (sessionId) url.searchParams.set('sessionId', sessionId);
  else url.searchParams.delete('sessionId');
  url.searchParams.delete('fromResearch');
  url.searchParams.delete('roadmapId');
  window.history.replaceState({}, '', url.toString());
}

export function usePackagerController() {
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const [stage, setStage] = useState<PackagerStage>('loading');
  const [draft, setDraft] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [context, setContext] = useState<ServiceContext | null>(null);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [pkg, setPkg] = useState<ServicePackage | null>(null);
  const [adjustments, setAdjustments] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meterRefreshKey, setMeterRefreshKey] = useState(0);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
  const [adjustJobId, setAdjustJobId] = useState<string | null>(null);
  const generatePoll = useToolJob({ jobId: generateJobId, roadmapId });
  const adjustPoll = useToolJob({ jobId: adjustJobId, roadmapId });
  const generateJob = generatePoll.job;
  const adjustJob = adjustPoll.job;
  const generateStage = generateJob?.stage;
  const generateErrorMessage = generateJob?.errorMessage;

  const refreshUsageAndHistory = useCallback(() => {
    setMeterRefreshKey((key) => key + 1);
    setHistoryRefreshKey((key) => key + 1);
  }, []);

  const hydrateSession = useCallback(async (targetRoadmapId: string, targetSessionId: string) => {
    const response = await fetch(`/api/discovery/roadmaps/${targetRoadmapId}/packager/sessions/${targetSessionId}`);
    if (!response.ok) return false;
    const data = await response.json() as SessionResponse;
    setSessionId(targetSessionId);
    setContext(data.context);
    setPkg(data.package);
    setAdjustments(data.adjustments?.length ?? 0);
    setAgentMessage(null);
    setStage('output');
    return true;
  }, []);

  const selectSession = useCallback(async (targetSessionId: string) => {
    if (!roadmapId) return;
    try {
      if (!(await hydrateSession(roadmapId, targetSessionId))) {
        throw new Error('That saved package could not be loaded.');
      }
      updateSessionUrl(targetSessionId);
      setError(null);
    } catch {
      setError('That saved package could not be loaded. Select it again to retry.');
    }
  }, [hydrateSession, roadmapId]);

  const newSession = useCallback(() => {
    setDraft('');
    setSessionId(null);
    setContext(null);
    setAgentMessage(null);
    setPkg(null);
    setAdjustments(0);
    setError(null);
    setStage('intro');
    updateSessionUrl(null);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/discovery/roadmaps/has-any');
        if (!response.ok) throw new Error('Could not check your roadmap. Please reload the tool.');
        const data = await response.json() as { hasRoadmap: boolean; roadmapId?: string };
        if (!data.hasRoadmap || !data.roadmapId) { setStage('no_roadmap'); return; }
        setRoadmapId(data.roadmapId);

        const params = new URLSearchParams(window.location.search);
        const restoreSessionId = params.get('sessionId');
        if (restoreSessionId) {
          try {
            if (await hydrateSession(data.roadmapId, restoreSessionId)) return;
            throw new Error('Saved package unavailable');
          } catch {
            setError('The requested saved package could not be loaded. You can retry it from history.');
          }
        }

        const researchSessionId = params.get('fromResearch');
        if (researchSessionId) {
          const researchRoadmapId = params.get('roadmapId') ?? data.roadmapId;
          try {
            const researchResponse = await fetch(`/api/discovery/roadmaps/${researchRoadmapId}/research/sessions/${researchSessionId}`);
            if (researchResponse.ok) {
              const research = await researchResponse.json() as { session: ResearchSession };
              setDraft(buildPackagerSeedFromResearch(research.session));
            }
          } catch { /* A failed handoff degrades to an empty composer. */ }
        }
        setStage('intro');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load the tool.');
      }
    })();
  }, [hydrateSession]);

  const start = useCallback(async (description?: string) => {
    const message = (description ?? draft).trim();
    if (!roadmapId || !message) return;
    setStage('loading_context');
    setError(null);
    try {
      const response = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
      });
      if (!response.ok) throw new Error('Could not load context');
      const data = await response.json() as { message: string; context: ServiceContext; sessionId: string };
      setContext(data.context);
      setAgentMessage(data.message);
      setSessionId(data.sessionId);
      setStage('context');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Network error');
      setStage('intro');
    } finally { refreshUsageAndHistory(); }
  }, [draft, refreshUsageAndHistory, roadmapId]);

  const adjustContext = useCallback(async (message: string) => {
    if (!roadmapId || !sessionId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, sessionId }),
      });
      if (!response.ok) throw new Error('Could not adjust context');
      const data = await response.json() as { message: string; context: ServiceContext };
      setContext(data.context);
      setAgentMessage(data.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Network error');
    } finally {
      setPending(false);
      refreshUsageAndHistory();
    }
  }, [refreshUsageAndHistory, roadmapId, sessionId]);

  const generate = useCallback(async () => {
    if (!roadmapId || !sessionId || !context) return;
    setStage('loading_generation');
    setError(null);
    try {
      const response = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context, sessionId }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(failure.error ?? 'Could not queue generation');
      }
      const data = await response.json() as { jobId: string; sessionId: string };
      setGenerateJobId(data.jobId);
      updateSessionUrl(data.sessionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Network error');
      setStage('context');
      refreshUsageAndHistory();
    }
  }, [context, refreshUsageAndHistory, roadmapId, sessionId]);

  const adjustPackage = useCallback(async (request: string) => {
    if (!roadmapId || !sessionId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/discovery/roadmaps/${roadmapId}/packager/adjust`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, adjustmentRequest: request }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(failure.error ?? 'Could not apply adjustment');
      }
      const data = await response.json() as { jobId: string };
      setAdjustJobId(data.jobId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Network error');
      setPending(false);
      refreshUsageAndHistory();
    }
  }, [refreshUsageAndHistory, roadmapId, sessionId]);

  useEffect(() => {
    if (!generateStage || !roadmapId || !sessionId) return;
    if (generateStage === 'failed') {
      setError(generateErrorMessage ?? 'Package generation failed.');
      setGenerateJobId(null);
      setStage('context');
      refreshUsageAndHistory();
      return;
    }
    if (generateStage !== 'complete') return;
    void (async () => {
      try {
        if (!(await hydrateSession(roadmapId, sessionId))) {
          throw new Error('The package was saved but could not be loaded.');
        }
        setGenerateJobId(null);
        setError(null);
        refreshUsageAndHistory();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The saved package could not be loaded.');
      }
    })();
  }, [generateErrorMessage, generateStage, hydrateSession, refreshUsageAndHistory, roadmapId, sessionId]);

  useEffect(() => {
    if (!adjustJob || !roadmapId || !sessionId) return;
    if (adjustJob.stage === 'complete') {
      void hydrateSession(roadmapId, sessionId).finally(() => {
        setAdjustJobId(null);
        setPending(false);
        refreshUsageAndHistory();
      });
    } else if (adjustJob.stage === 'failed') {
      setError(adjustJob.errorMessage ?? 'Adjustment failed.');
      setAdjustJobId(null);
      setPending(false);
      refreshUsageAndHistory();
    }
  }, [adjustJob, hydrateSession, refreshUsageAndHistory, roadmapId, sessionId]);

  const retryGenerate = useCallback(() => {
    if (generateJob?.stage === 'complete' && roadmapId && sessionId) {
      void hydrateSession(roadmapId, sessionId).then((loaded) => {
        if (!loaded) return;
        setGenerateJobId(null);
        setError(null);
        refreshUsageAndHistory();
      });
      return;
    }
    setGenerateJobId(null);
    setError(null);
    void generate();
  }, [generate, generateJob?.stage, hydrateSession, refreshUsageAndHistory, roadmapId, sessionId]);

  const pollingUnknown = generatePoll.error || generatePoll.timedOut
    || adjustPoll.error || adjustPoll.timedOut;
  const operationStatus = pollingUnknown
    ? 'running_unknown' as const
    : generateJob?.stage === 'complete' && error
      ? 'completed_not_loaded' as const
      : 'stopped' as const;
  const displayError = error ?? (pollingUnknown
    ? 'The server status could not be confirmed. This operation may still be running.'
    : null);

  return {
    roadmapId, stage, draft, sessionId, context, agentMessage, pkg, adjustments,
    pending, error: displayError, operationStatus, meterRefreshKey, historyRefreshKey, generateJob, adjustJob,
    setDraft, selectSession, newSession, start, adjustContext, generate,
    adjustPackage, retryGenerate,
  };
}
