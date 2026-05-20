'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  OpportunityVerdict,
  OpportunityPushbackAction,
  OpportunityPushbackMode,
} from '@neuralaunch/constants';
import type { OpportunityEvaluation } from '@/lib/ideation/stage4-opportunities/schema';
import type { AllowedScreenshotContentType } from '@/lib/ideation/stage4-opportunities/constants';

export type Stage4Message = {
  id:          string;
  role:        'user' | 'assistant';
  content:     string;
  inputMethod: 'voice' | null;
};

export type Stage4Status =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'composing'
  | 'deriving'
  | 'generating'
  | 'submitting'
  | 'error'
  | 'terminated';

export type Stage4TurnError = {
  kind:    'http' | 'cut_stream' | 'session_terminated';
  message: string;
};

export type PushbackResponseShape = {
  action:      OpportunityPushbackAction;
  mode:        OpportunityPushbackMode;
  message:     string;
  opportunity: OpportunityEvaluation;
  version:     number;
};

interface UseStage4SessionArgs {
  sessionId:       string;
  stageRunId:      string;
  initialMessages: Stage4Message[];
}

interface UseStage4SessionResult {
  messages:    Stage4Message[];
  status:      Stage4Status;
  turnError:   Stage4TurnError | null;
  /** Per-opportunity id when an action is in flight on a specific row. */
  derivingFor:   string | null;
  generatingFor: string | null;
  sendMessage:   (content: string) => Promise<void>;
  deriveLayerA:  (opportunityId: string) => Promise<void>;
  generateScript:(opportunityId: string) => Promise<void>;
  submitText:    (args: { opportunityId: string; pastedText: string }) => Promise<void>;
  presign:       (input: { opportunityId: string; contentType: AllowedScreenshotContentType }) => Promise<{ uploadUrl: string; s3Key: string; s3Url: string }>;
  submitImage:   (args: { opportunityId: string; s3Key: string; s3Url: string }) => Promise<void>;
  removeResponse:(id: string) => Promise<void>;
  pickVerdict:   (opportunityId: string, verdict: OpportunityVerdict) => Promise<void>;
  pushback:      (input: { opportunityId: string; message: string; priorVersion: number }) => Promise<PushbackResponseShape>;
}

/**
 * Stage 4 chat hook. Mirrors useStage3Session for the conversational
 * turn flow + adds Stage 4 canvas action dispatchers (derive Layer A,
 * generate Layer B script, capture responses, set verdicts, push back).
 *
 * Per-row in-flight tracking via derivingFor / generatingFor so each
 * OpportunityCard knows whether ITS action is in flight (not just
 * "something is in flight across the canvas").
 */
export function useStage4Session({
  sessionId,
  stageRunId,
  initialMessages,
}: UseStage4SessionArgs): UseStage4SessionResult {
  const router = useRouter();
  const [messages, setMessages] = useState<Stage4Message[]>(initialMessages);
  const [status,   setStatus]   = useState<Stage4Status>('idle');
  const [turnError, setTurnError] = useState<Stage4TurnError | null>(null);
  const [derivingFor, setDerivingFor]     = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (status === 'sending' || status === 'streaming') return;
    const userMsg: Stage4Message = {
      id:          crypto.randomUUID(),
      role:        'user',
      content,
      inputMethod: null,
    };
    setMessages(prev => [...prev, userMsg]);
    setTurnError(null);
    setStatus('sending');

    const history = [...messages, userMsg].map(m => `${m.role}: ${m.content}`).join('\n').slice(0, 7500);
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`/api/discovery/sessions/${sessionId}/turn`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: content, history }),
        signal:  abortRef.current.signal,
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const data = await res.json() as { status?: 'output_ready'; error?: string; sessionTerminated?: boolean };
        if (res.status === 403 && data.sessionTerminated) {
          setStatus('terminated');
          setTurnError({ kind: 'session_terminated', message: data.error ?? 'Session terminated' });
          return;
        }
        if (res.ok && data.status === 'output_ready') {
          setStatus('composing');
          router.refresh();
          return;
        }
        setStatus('error');
        setTurnError({ kind: 'http', message: data.error ?? `Server returned ${res.status}` });
        return;
      }
      if (!res.ok || !res.body) {
        setStatus('error');
        setTurnError({ kind: 'http', message: `Server returned ${res.status}` });
        return;
      }
      setStatus('streaming');
      const assistantId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', inputMethod: null }]);
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: acc } : m));
        }
        acc += decoder.decode();
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: acc } : m));
      } catch (streamErr) {
        setStatus('error');
        setTurnError({ kind: 'cut_stream', message: streamErr instanceof Error ? streamErr.message : 'Stream interrupted' });
        return;
      }
      router.refresh();
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setTurnError({ kind: 'http', message: err instanceof Error ? err.message : String(err) });
    } finally {
      abortRef.current = null;
    }
  }, [messages, sessionId, status, router]);

  // ── Canvas action dispatchers ─────────────────────────────────────────

  const callRoute = useCallback(async <T,>(
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: unknown,
  ): Promise<T> => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return await res.json().catch(() => ({} as T)) as T;
  }, []);

  const deriveLayerA = useCallback(async (opportunityId: string) => {
    setDerivingFor(opportunityId);
    setTurnError(null);
    try {
      await callRoute(`/api/ideation/stage-runs/${stageRunId}/derive-opportunity-research`, 'POST', { opportunityId });
      router.refresh();
    } catch (err) {
      setTurnError({ kind: 'http', message: err instanceof Error ? err.message : 'Research failed' });
    } finally {
      setDerivingFor(null);
    }
  }, [callRoute, stageRunId, router]);

  const generateScript = useCallback(async (opportunityId: string) => {
    setGeneratingFor(opportunityId);
    setTurnError(null);
    try {
      await callRoute(`/api/ideation/stage-runs/${stageRunId}/generate-engagement-script`, 'POST', { opportunityId });
      router.refresh();
    } catch (err) {
      setTurnError({ kind: 'http', message: err instanceof Error ? err.message : 'Script generation failed' });
    } finally {
      setGeneratingFor(null);
    }
  }, [callRoute, stageRunId, router]);

  const submitText = useCallback(async (args: { opportunityId: string; pastedText: string }) => {
    await callRoute(`/api/ideation/stage-runs/${stageRunId}/community-response`, 'POST', {
      ...args, source: 'text_paste',
    });
    router.refresh();
  }, [callRoute, stageRunId, router]);

  const presign = useCallback(async (input: { opportunityId: string; contentType: AllowedScreenshotContentType }) => {
    return await callRoute<{ uploadUrl: string; s3Key: string; s3Url: string }>(
      `/api/ideation/stage-runs/${stageRunId}/presign-response-upload`,
      'POST',
      input,
    );
  }, [callRoute, stageRunId]);

  const submitImage = useCallback(async (args: { opportunityId: string; s3Key: string; s3Url: string }) => {
    await callRoute(`/api/ideation/stage-runs/${stageRunId}/community-response`, 'POST', {
      ...args, source: 'screenshot',
    });
    router.refresh();
  }, [callRoute, stageRunId, router]);

  const removeResponse = useCallback((_id: string): Promise<void> => {
    // The community-response delete route isn't part of commit #4's
    // scope (only POST is wired). Surface a clean error if called;
    // a future polish-backlog item can add the DELETE path.
    return Promise.reject(new Error('Removing responses isn\'t supported yet. Add a different response or paste corrected text.'));
  }, []);

  const pickVerdict = useCallback(async (opportunityId: string, verdict: OpportunityVerdict) => {
    await callRoute(`/api/ideation/stage-runs/${stageRunId}/opportunity-verdict`, 'POST', { opportunityId, verdict });
    router.refresh();
  }, [callRoute, stageRunId, router]);

  const pushback = useCallback(async (input: { opportunityId: string; message: string; priorVersion: number }) => {
    const data = await callRoute<PushbackResponseShape>(
      `/api/ideation/stage-runs/${stageRunId}/opportunity-pushback`,
      'POST',
      input,
    );
    router.refresh();
    return data;
  }, [callRoute, stageRunId, router]);

  return {
    messages, status, turnError,
    derivingFor, generatingFor,
    sendMessage, deriveLayerA, generateScript,
    submitText, presign, submitImage, removeResponse,
    pickVerdict, pushback,
  };
}
