'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  messages:         Stage1Message[];
  status:           Stage1Status;
  turnError:        Stage1TurnError | null;
  sendMessage:      (content: string, inputMethod?: 'voice') => Promise<void>;
  requestOpening:   () => Promise<void>;
  requestEditProbe: () => Promise<void>;
  clearError:       () => void;
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
   * Defensive turnError invalidation: any transition into 'idle' or
   * 'sending' means a new request is starting OR a turn completed
   * cleanly. In either case any prior turnError is stale and should
   * not linger on screen. Callers (sendMessage, fireProbe) also
   * call setTurnError(null) explicitly at their own entry points —
   * this is the belt-and-suspenders cleanup against any future
   * regression where the explicit clear is skipped (bug 11).
   */
  useEffect(() => {
    if (status === 'idle' || status === 'sending') {
      setTurnError(null);
    }
  }, [status]);

  /**
   * Shared text-stream consumer. Appends an empty assistant message
   * upfront, then fills it as chunks arrive. Sets terminal status on
   * its own. Returns true on clean close, false if the stream cut.
   */
  const consumeStream = useCallback(async (body: ReadableStream<Uint8Array>): Promise<boolean> => {
    // Belt-and-suspenders error invalidation — by the time we have
    // body chunks ready to render, any prior turnError is provably
    // stale (the network round-trip succeeded). Mirrors the earlier
    // setTurnError(null) at sendMessage/fireProbe entry; defends
    // against the bug-11 class where stale errors render alongside
    // fresh content.
    setTurnError(null);
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

    // Clear any prior turnError FIRST — before any other state write —
    // so React's batch never renders a frame with both the new pending
    // status and the stale error. Bug 11: a tight retry after a failed
    // turn briefly flashed "Server returned 200" alongside the new
    // sending state because the prior setTurnError(null) was sequenced
    // after setMessages and the batch let the error survive one frame.
    setTurnError(null);

    const userMsg: Stage1Message = {
      id:          crypto.randomUUID(),
      role:        'user',
      content,
      inputMethod: inputMethod ?? null,
    };
    setMessages(prev => [...prev, userMsg]);
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
   * Shared probe runner — both /stage1-opening (fresh session) and
   * /stage1-edit-probe (founder reopened a single dimension to
   * revise) share the same body-less POST + streaming-or-JSON
   * response contract. Differs only by URL. Both routes are
   * idempotent server-side; this helper trusts that and just streams.
   */
  const fireProbe = useCallback(async (path: string) => {
    if (status === 'sending' || status === 'streaming') return;

    // setTurnError BEFORE setStatus, same reasoning as sendMessage —
    // never render a frame where stale error and new pending state
    // coexist. Bug 11.
    setTurnError(null);
    setStatus('sending');
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/discovery/sessions/${sessionId}/${path}`, {
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

  const requestOpening   = useCallback(() => fireProbe('stage1-opening'),   [fireProbe]);
  const requestEditProbe = useCallback(() => fireProbe('stage1-edit-probe'), [fireProbe]);

  return { messages, status, turnError, sendMessage, requestOpening, requestEditProbe, clearError };
}
