'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  FounderContextTag,
  PainScorePushbackAction,
  PainScorePushbackMode,
} from '@neuralaunch/constants';
import type { PainPoint } from '@/lib/ideation/stage3-opportunities/schema';

export type Stage3Message = {
  id:          string;
  role:        'user' | 'assistant';
  content:     string;
  inputMethod: 'voice' | null;
};

export type Stage3Status =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'composing'
  | 'scouting'
  | 'error'
  | 'terminated';

export type Stage3TurnError = {
  kind:    'http' | 'cut_stream' | 'session_terminated';
  message: string;
};

export type PushbackResponse = {
  action:    PainScorePushbackAction;
  mode:      PainScorePushbackMode;
  message:   string;
  painPoint: PainPoint;
  version:   number;
};

interface UseStage3SessionArgs {
  sessionId:        string;
  stageRunId:       string;
  initialMessages:  Stage3Message[];
}

interface UseStage3SessionResult {
  messages:                Stage3Message[];
  status:                  Stage3Status;
  turnError:               Stage3TurnError | null;
  sendMessage:             (content: string) => Promise<void>;
  runPainScout:            (founderQuery: string | null) => Promise<void>;
  addFounderPainPoint:     (input: {
    description:    string;
    founderContext: FounderContextTag | null;
    founderNotes:   string | null;
  }) => Promise<void>;
  editFounderPainPoint:    (input: {
    id:             string;
    description?:   string;
    founderContext?: FounderContextTag | null;
    founderNotes?:  string | null;
  }) => Promise<void>;
  scorePainPoint:          (input: {
    id:        string;
    intensity: number;
    frequency: number;
    nicheSpecificity: number;
  }) => Promise<void>;
  removePainPoint:         (id: string) => Promise<void>;
  runPushbackRound:        (input: {
    painPointId:  string;
    message:      string;
    priorVersion: number;
  }) => Promise<PushbackResponse>;
}

/**
 * Stage 3 chat hook. Same shape as useStage2Session for the
 * conversational turn flow + adds Stage 3 dispatchers (pain-scout-run,
 * founder-pain-point CRUD, pain-point-pushback). Every action ends
 * with router.refresh() so the page server component re-fetches.
 * Terminal JSON { status: 'output_ready', stageNumber: 3 } from /turn
 * also triggers refresh so PainInventoryDocumentView takes over.
 */
export function useStage3Session({
  sessionId,
  stageRunId,
  initialMessages,
}: UseStage3SessionArgs): UseStage3SessionResult {
  const router = useRouter();
  const [messages, setMessages] = useState<Stage3Message[]>(initialMessages);
  const [status,   setStatus]   = useState<Stage3Status>('idle');
  const [turnError, setTurnError] = useState<Stage3TurnError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (status === 'sending' || status === 'streaming') return;
    const userMsg: Stage3Message = {
      id:          crypto.randomUUID(),
      role:        'user',
      content,
      inputMethod: null,
    };
    setMessages(prev => [...prev, userMsg]);
    setTurnError(null);
    setStatus('sending');

    const history = [...messages, userMsg]
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 7500);

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
        const data = await res.json() as {
          status?:            'output_ready';
          error?:             string;
          sessionTerminated?: boolean;
        };
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

  const callRoute = useCallback(async (
    path:   string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body:   unknown,
  ): Promise<unknown> => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return res.json().catch(() => ({}));
  }, []);

  const runPainScout = useCallback(async (founderQuery: string | null) => {
    setTurnError(null);
    setStatus('scouting');
    try {
      await callRoute(
        `/api/ideation/stage-runs/${stageRunId}/pain-scout-run`,
        'POST',
        { founderQuery },
      );
      router.refresh();
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setTurnError({ kind: 'http', message: err instanceof Error ? err.message : 'Pain scout run failed' });
    }
  }, [callRoute, stageRunId, router]);

  const addFounderPainPoint = useCallback(async (input: {
    description: string; founderContext: FounderContextTag | null; founderNotes: string | null;
  }) => {
    await callRoute(`/api/ideation/stage-runs/${stageRunId}/founder-pain-point`, 'POST', input);
    router.refresh();
  }, [callRoute, stageRunId, router]);

  const editFounderPainPoint = useCallback(async (input: {
    id: string;
    description?: string;
    founderContext?: FounderContextTag | null;
    founderNotes?:  string | null;
  }) => {
    await callRoute(
      `/api/ideation/stage-runs/${stageRunId}/founder-pain-point`,
      'PATCH',
      { kind: 'edit', ...input },
    );
    router.refresh();
  }, [callRoute, stageRunId, router]);

  const scorePainPoint = useCallback(async (input: {
    id: string; intensity: number; frequency: number; nicheSpecificity: number;
  }) => {
    await callRoute(
      `/api/ideation/stage-runs/${stageRunId}/founder-pain-point`,
      'PATCH',
      {
        kind:   'score',
        id:     input.id,
        scores: {
          intensity:        input.intensity,
          frequency:        input.frequency,
          nicheSpecificity: input.nicheSpecificity,
        },
      },
    );
    router.refresh();
  }, [callRoute, stageRunId, router]);

  const removePainPoint = useCallback(async (id: string) => {
    await callRoute(
      `/api/ideation/stage-runs/${stageRunId}/founder-pain-point`,
      'DELETE',
      { id },
    );
    router.refresh();
  }, [callRoute, stageRunId, router]);

  const runPushbackRound = useCallback(async (input: {
    painPointId: string; message: string; priorVersion: number;
  }): Promise<PushbackResponse> => {
    const data = await callRoute(
      `/api/ideation/stage-runs/${stageRunId}/pain-point-pushback`,
      'POST',
      input,
    ) as PushbackResponse;
    router.refresh();
    return data;
  }, [callRoute, stageRunId, router]);

  return {
    messages,
    status,
    turnError,
    sendMessage,
    runPainScout,
    addFounderPainPoint,
    editFounderPainPoint,
    scorePainPoint,
    removePainPoint,
    runPushbackRound,
  };
}
