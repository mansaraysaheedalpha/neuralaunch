'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SkillKey, SkillTier } from '@neuralaunch/constants';

export type Stage2Message = {
  id:          string;
  role:        'user' | 'assistant';
  content:     string;
  inputMethod: 'voice' | null;
};

export type Stage2Status =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'composing'
  | 'error'
  | 'terminated';

export type Stage2TurnError = {
  kind:    'http' | 'cut_stream' | 'session_terminated';
  message: string;
};

interface UseStage2SessionArgs {
  sessionId:        string;
  stageRunId:       string;
  initialMessages:  Stage2Message[];
}

interface UseStage2SessionResult {
  messages:                Stage2Message[];
  status:                  Stage2Status;
  turnError:               Stage2TurnError | null;
  sendMessage:             (content: string) => Promise<void>;
  updateSkillTier:         (person: 'founder' | number, skill: SkillKey, tier: SkillTier) => Promise<void>;
  addTeammate:             (name: string) => Promise<void>;
  removeTeammate:          (index: number) => Promise<void>;
  deriveExpectedProfile:   () => Promise<void>;
}

/**
 * Stage 2 chat hook. Mirrors useStage1Session for the conversational
 * turn flow + adds canvas action dispatchers that hit the dedicated
 * narrow API routes (skill-tier, teammate, derive-expected-profile).
 *
 * The hook does NOT own the canvas state — that lives in the
 * IdeationStageRun.output and is mirrored to FounderProfile. After
 * each canvas action the hook calls router.refresh() so the page
 * server-component re-fetches the freshest authoring state.
 *
 * The turn route's terminal JSON shape:
 *   { status: 'output_ready', stageRunId, stageNumber: 2 }
 * triggers a router.refresh() so the page renders RequirementsDocumentView.
 */
export function useStage2Session({
  sessionId,
  stageRunId,
  initialMessages,
}: UseStage2SessionArgs): UseStage2SessionResult {
  const router = useRouter();
  const [messages, setMessages] = useState<Stage2Message[]>(initialMessages);
  const [status,   setStatus]   = useState<Stage2Status>('idle');
  const [turnError, setTurnError] = useState<Stage2TurnError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (status === 'sending' || status === 'streaming') return;
    const userMsg: Stage2Message = {
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
          status?:           'output_ready';
          error?:            string;
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

      // After the stream completes, refresh the page so the canvas
      // picks up any tier updates the agent applied.
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
  // Each hits its dedicated narrow route. The route does the strict
  // dual-write into FounderProfile. Hook refreshes the page on success
  // so the canvas re-renders with the new state.

  const callRoute = useCallback(async (
    path: string,
    body: unknown,
  ): Promise<void> => {
    const res = await fetch(path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    router.refresh();
  }, [router]);

  const updateSkillTier = useCallback(
    (person: 'founder' | number, skill: SkillKey, tier: SkillTier) =>
      callRoute(`/api/ideation/stage-runs/${stageRunId}/skill-tier`, { person, skill, tier }),
    [callRoute, stageRunId],
  );

  const addTeammate = useCallback(
    (name: string) =>
      callRoute(`/api/ideation/stage-runs/${stageRunId}/teammate`, { op: 'add', name }),
    [callRoute, stageRunId],
  );

  const removeTeammate = useCallback(
    (index: number) =>
      callRoute(`/api/ideation/stage-runs/${stageRunId}/teammate`, { op: 'remove', index }),
    [callRoute, stageRunId],
  );

  const deriveExpectedProfile = useCallback(async () => {
    setStatus('composing');
    try {
      await callRoute(`/api/ideation/stage-runs/${stageRunId}/derive-expected-profile`, {});
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setTurnError({ kind: 'http', message: err instanceof Error ? err.message : 'Derivation failed' });
    }
  }, [callRoute, stageRunId]);

  return {
    messages,
    status,
    turnError,
    sendMessage,
    updateSkillTier,
    addTeammate,
    removeTeammate,
    deriveExpectedProfile,
  };
}
