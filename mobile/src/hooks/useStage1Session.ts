// src/hooks/useStage1Session.ts
//
// Mobile counterpart to client/src/app/(app)/discovery/no-idea/[sessionId]/useStage1Session.ts.
// Drives the Stage 1 chat surface: posts a turn to
// /api/discovery/sessions/[sessionId]/turn, then either streams an
// assistant message into the conversation OR transitions the status
// to a terminal state on a JSON response. The contract mirrors the
// web hook exactly so behaviour stays in lock-step.
//
// Two response shapes the turn route returns:
//   - text/plain stream   → accumulate tokens into the latest
//                            assistant message, transition to 'idle'
//                            on completion
//   - application/json    → terminal:
//                            * 200 + { status: 'output_ready' }
//                              → status='composing'; the caller is
//                                expected to refetch session state and
//                                re-render the OutcomeDocument surface
//                            * 403 + { sessionTerminated, error }
//                              → status='terminated'; safety-gate block
//                            * anything else → status='error'
//
// Streaming uses `res.body.getReader()` + TextDecoder, the same
// pattern useDiscovery.ts has been shipping in production since the
// initial mobile launch — RN's fetch surfaces a readable body in this
// codebase's runtime.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getToken, API_BASE_URL } from '@/services/api-client';

export type Stage1Message = {
  id:          string;
  role:        'user' | 'assistant';
  content:     string;
  inputMethod: 'voice' | null;
};

export type Stage1Status =
  | 'idle'
  | 'sending'
  | 'streaming'
  | 'composing'
  | 'error'
  | 'terminated';

export type Stage1TurnError = {
  kind:    'http' | 'cut_stream' | 'session_terminated';
  message: string;
};

interface UseStage1SessionArgs {
  sessionId:       string;
  initialMessages: Stage1Message[];
}

interface UseStage1SessionResult {
  messages:    Stage1Message[];
  status:      Stage1Status;
  turnError:   Stage1TurnError | null;
  sendMessage: (content: string, inputMethod?: 'voice') => Promise<void>;
  clearError:  () => void;
}

function newId(prefix: string): string {
  // CLAUDE.md bans Math.random() for IDs; Hermes (RN 0.74+) supports
  // crypto.randomUUID() natively via the Web Crypto API.
  return `${prefix}-${crypto.randomUUID()}`;
}

export function useStage1Session({
  sessionId,
  initialMessages,
}: UseStage1SessionArgs): UseStage1SessionResult {
  const [messages,   setMessages]   = useState<Stage1Message[]>(initialMessages);
  const [status,     setStatus]     = useState<Stage1Status>('idle');
  const [turnError,  setTurnError]  = useState<Stage1TurnError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight stream when the hook unmounts so a navigation
  // away mid-stream doesn't leak a fetch + setState into a torn-down
  // component (React warns; worse, the assistant message would never
  // complete and the next mount would resurrect a stale state).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const clearError = useCallback(() => setTurnError(null), []);

  const sendMessage = useCallback(async (content: string, inputMethod?: 'voice') => {
    if (status === 'sending' || status === 'streaming') return;

    const userMsg: Stage1Message = {
      id:          newId('u'),
      role:        'user',
      content,
      inputMethod: inputMethod ?? null,
    };
    setMessages(prev => [...prev, userMsg]);
    setTurnError(null);
    setStatus('sending');

    // Build the rolling history string the turn route consumes —
    // identical cap to the web hook (7500 chars to stay under the
    // route's 8000-char limit).
    const history = [...messages, userMsg]
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 7500);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept':       'text/plain, application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE_URL}/api/discovery/sessions/${sessionId}/turn`,
        {
          method:  'POST',
          headers,
          body:    JSON.stringify({
            message: content,
            history,
            ...(inputMethod && { inputMethod }),
          }),
          signal:  controller.signal,
        },
      );

      const contentType = res.headers.get('content-type') ?? '';

      // ── JSON terminal responses ────────────────────────────────────
      if (contentType.includes('application/json')) {
        const data = await res.json() as {
          status?:            'output_ready';
          stageRunId?:        string;
          error?:             string;
          sessionTerminated?: boolean;
        };

        if (res.status === 403 && data.sessionTerminated) {
          setStatus('terminated');
          setTurnError({
            kind:    'session_terminated',
            message: data.error ?? 'Session terminated',
          });
          return;
        }

        if (res.ok && data.status === 'output_ready') {
          // Mobile equivalent of the web's router.refresh(): the parent
          // screen observes status === 'composing' and refetches the
          // session, which re-renders into review mode.
          setStatus('composing');
          return;
        }

        setStatus('error');
        setTurnError({
          kind:    'http',
          message: data.error ?? `Server returned ${res.status}`,
        });
        return;
      }

      // ── Streaming text response ────────────────────────────────────
      if (!res.ok || !res.body) {
        setStatus('error');
        setTurnError({
          kind:    'http',
          message: `Server returned ${res.status}`,
        });
        return;
      }

      setStatus('streaming');
      const assistantId = newId('a');
      setMessages(prev => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', inputMethod: null },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: acc } : m)),
          );
        }
        // Flush any pending bytes inside the decoder.
        acc += decoder.decode();
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content: acc } : m)),
        );
      } catch (streamErr) {
        // Aborted streams (navigation away) are not user-facing errors.
        if (controller.signal.aborted) return;
        setStatus('error');
        setTurnError({
          kind:    'cut_stream',
          message: streamErr instanceof Error ? streamErr.message : 'Stream interrupted',
        });
        return;
      }

      setStatus('idle');
    } catch (err) {
      // Same swallow as the stream branch — caller-initiated abort
      // (unmount or navigation) doesn't surface a banner.
      if (controller.signal.aborted) return;
      setStatus('error');
      setTurnError({
        kind:    'http',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [messages, sessionId, status]);

  return { messages, status, turnError, sendMessage, clearError };
}
