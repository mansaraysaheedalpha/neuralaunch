'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export type Stage1Message = {
  id:          string;
  role:        'user' | 'assistant';
  content:     string;
  inputMethod: 'voice' | null;
};

export type Stage1Status = 'idle' | 'sending' | 'streaming' | 'composing' | 'error' | 'terminated';

export type Stage1TurnError = {
  kind:    'http' | 'cut_stream' | 'session_terminated';
  message: string;
};

interface UseStage1SessionArgs {
  sessionId:       string;
  initialMessages: Stage1Message[];
}

interface UseStage1SessionResult {
  messages:        Stage1Message[];
  status:          Stage1Status;
  turnError:       Stage1TurnError | null;
  sendMessage:     (content: string, inputMethod?: 'voice') => Promise<void>;
  requestOpening:  () => Promise<void>;
  clearError:      () => void;
}

/**
 * Stage 1 chat hook. Streams turn responses from
 * `/api/discovery/sessions/[sessionId]/turn` (which the route
 * delegates to `stage1-handler.ts`) AND the opening probe from
 * `/api/discovery/sessions/[sessionId]/stage1-opening`.
 *
 * Two terminal response shapes the turn route may return:
 *   - text/plain stream  → consume tokens into the latest assistant
 *                          message and append it on completion
 *   - application/json   → either { status: 'output_ready' } meaning
 *                          composer fired (router refreshes so the
 *                          server-component re-renders the review
 *                          surface), or { error, sessionTerminated }
 *                          on a safety-gate block
 *
 * The opening endpoint only returns text/plain streams or error JSON.
 */
export function useStage1Session({
  sessionId,
  initialMessages,
}: UseStage1SessionArgs): UseStage1SessionResult {
  const router = useRouter();
  const [messages, setMessages] = useState<Stage1Message[]>(initialMessages);
  const [status,   setStatus]   = useState<Stage1Status>('idle');
  const [turnError, setTurnError] = useState<Stage1TurnError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => setTurnError(null), []);

  /**
   * Shared text-stream consumer. Appends an empty assistant message
   * upfront, then fills it as chunks arrive. Sets terminal status on
   * its own. Returns true on clean close, false if the stream cut.
   */
  const consumeStream = useCallback(async (body: ReadableStream<Uint8Array>): Promise<boolean> => {
    setStatus('streaming');
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', inputMethod: null }]);

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let acc = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content: acc } : m)),
        );
      }
      acc += decoder.decode();
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, content: acc } : m)),
      );
      setStatus('idle');
      return true;
    } catch (streamErr) {
      setStatus('error');
      setTurnError({
        kind:    'cut_stream',
        message: streamErr instanceof Error ? streamErr.message : 'Stream interrupted',
      });
      return false;
    }
  }, []);

  const sendMessage = useCallback(async (content: string, inputMethod?: 'voice') => {
    if (status === 'sending' || status === 'streaming') return;

    const userMsg: Stage1Message = {
      id:          crypto.randomUUID(),
      role:        'user',
      content,
      inputMethod: inputMethod ?? null,
    };
    setMessages(prev => [...prev, userMsg]);
    setTurnError(null);
    setStatus('sending');

    // Build the rolling history string the server route consumes. Cap
    // total payload at 7500 chars to match Discovery's behaviour and
    // stay under the turn route's 8000-char history field cap.
    const history = [...messages, userMsg]
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 7500);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/discovery/sessions/${sessionId}/turn`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message: content,
          history,
          ...(inputMethod && { inputMethod }),
        }),
        signal: abortRef.current.signal,
      });

      const contentType = res.headers.get('content-type') ?? '';

      // ── JSON terminal responses ─────────────────────────────────────────
      if (contentType.includes('application/json')) {
        const data = await res.json() as {
          status?:           'output_ready';
          stageRunId?:       string;
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

      // ── Streaming text response ─────────────────────────────────────────
      if (!res.ok || !res.body) {
        setStatus('error');
        setTurnError({ kind: 'http', message: `Server returned ${res.status}` });
        return;
      }

      await consumeStream(res.body);
    } catch (err) {
      setStatus('error');
      setTurnError({
        kind:    'http',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      abortRef.current = null;
    }
  }, [messages, sessionId, status, router, consumeStream]);

  /**
   * Fire the dedicated opening probe for a fresh Stage 1 session. The
   * Stage 1 chat component calls this once on mount when the
   * conversation has no prior messages. Streams the agent's first
   * probe question; idempotent at the server side (409 on re-fire).
   */
  const requestOpening = useCallback(async () => {
    if (status === 'sending' || status === 'streaming') return;

    setTurnError(null);
    setStatus('sending');
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/discovery/sessions/${sessionId}/stage1-opening`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  abortRef.current.signal,
      });

      const contentType = res.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        const data = await res.json() as { error?: string; sessionTerminated?: boolean };
        if (res.status === 403 && data.sessionTerminated) {
          setStatus('terminated');
          setTurnError({ kind: 'session_terminated', message: data.error ?? 'Session terminated' });
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

      await consumeStream(res.body);
    } catch (err) {
      setStatus('error');
      setTurnError({
        kind:    'http',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      abortRef.current = null;
    }
  }, [sessionId, status, consumeStream]);

  return { messages, status, turnError, sendMessage, requestOpening, clearError };
}
