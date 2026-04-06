// src/components/discovery/useDiscoverySession.ts
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { logger } from '@/lib/logger';
import type { Recommendation } from '@/lib/discovery/client';
import type { ChatMessage } from './MessageList';

type ChatStatus  = 'idle' | 'loading' | 'streaming' | 'error';
type RecResponse = { recommendation: Recommendation } | { status: 'pending'; synthesisStep: string | null };

const recFetcher = (url: string): Promise<RecResponse> =>
  fetch(url).then(r => r.json() as Promise<RecResponse>);

async function readTextStream(
  stream:  ReadableStream<Uint8Array>,
  onChunk: (accumulated: string) => void,
): Promise<void> {
  const reader  = stream.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
    onChunk(acc);
  }
}

/**
 * Minimum content length for a streamed response to be considered
 * complete. Question-generation outputs always exceed this — anything
 * shorter is almost certainly a cut stream from the provider chain.
 * The floor is part of the resilience layer's incomplete-stream
 * detection.
 */
const MIN_COMPLETE_STREAM_CHARS = 30;

/**
 * The shape of a failed turn surfaced to the UI. The retry icon and
 * any partial-content rendering reads from this object.
 */
export interface TurnError {
  /**
   * 'pre_stream' — the API call returned non-OK or threw before any
   *               chunks arrived. The user's last bubble is the only
   *               visible artefact.
   * 'cut_stream' — the API call returned OK and chunks started flowing,
   *               but the stream errored mid-content OR completed
   *               with fewer than MIN_COMPLETE_STREAM_CHARS characters.
   *               Partial content is preserved and rendered with a
   *               cut indicator.
   */
  kind:      'pre_stream' | 'cut_stream';
  partial?:  string;
  /**
   * Where the failed content was being rendered when the failure
   * happened. Drives where the retry icon appears.
   */
  surface:   'stepper' | 'reflection' | 'message';
}

export interface DiscoverySessionState {
  messages:               ChatMessage[];
  status:                 ChatStatus;
  sessionReady:           boolean;
  isSynthesizing:         boolean;
  synthesisError:         boolean;
  synthesisStep:          string | null;
  stepperVisible:         boolean;
  currentQuestion:        string;
  questionIndex:          number;
  turnError:              TurnError | null;
  sendMessage:            (content: string) => Promise<void>;
  retryLastTurn:          () => Promise<void>;
  setStepperVisible:      (v: boolean) => void;
  retryRecommendation:    () => void;
}

interface ResumeState {
  sessionId:      string;
  conversationId: string | null;
  messages:       ChatMessage[];
}

interface Options {
  onComplete?: (recommendation: Recommendation, conversationId: string) => void;
  resume?:     ResumeState;
}

/**
 * useDiscoverySession
 *
 * Manages all server interaction for the discovery interview:
 * session init, per-turn streaming, and recommendation polling.
 */
export function useDiscoverySession({ onComplete, resume }: Options): DiscoverySessionState {
  const [messages,        setMessages]        = useState<ChatMessage[]>(resume?.messages ?? []);
  const [status,          setStatus]          = useState<ChatStatus>('idle');
  const [sessionId,       setSessionId]       = useState<string | null>(resume?.sessionId ?? null);
  const [isSynthesizing,  setIsSynthesizing]  = useState(false);
  const [synthesisError,  setSynthesisError]  = useState(false);
  const [stepperVisible,  setStepperVisible]  = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionIndex,   setQuestionIndex]   = useState(0);
  const [turnError,       setTurnError]       = useState<TurnError | null>(null);

  const sessionIdRef        = useRef<string | null>(resume?.sessionId ?? null);
  const conversationIdRef   = useRef<string | null>(resume?.conversationId ?? null);
  const calledOnCompleteRef = useRef(false);
  const abortRef            = useRef<AbortController | null>(null);
  const pollIntervalRef     = useRef(3000);
  // The last user message we attempted to send. retryLastTurn re-fires
  // exactly this content with the same session and history state.
  const lastUserMessageRef  = useRef<string | null>(null);
  // Full bidirectional history — user answers + AI questions. Separate from
  // `messages` display state so the chat UI is not affected.
  // Pre-populated from resumed messages so post-resume turns have full context.
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>(
    resume?.messages.map(m => ({ role: m.role, content: m.content })) ?? [],
  );

  // Session is created lazily on the user's first message — not on mount.
  // This prevents a sidebar entry being created every time /discovery is loaded.
  async function initSession(firstMessage: string): Promise<string | null> {
    try {
      const res = await fetch('/api/discovery/sessions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ firstMessage }),
      });
      if (!res.ok) throw new Error(`Session create failed: ${res.status}`);
      const sid = res.headers.get('X-Session-Id');
      const cid = res.headers.get('X-Conversation-Id');
      if (!sid) throw new Error('Missing X-Session-Id');
      sessionIdRef.current      = sid;
      conversationIdRef.current = cid;
      setSessionId(sid);
      return sid;
    } catch (err) {
      logger.error('Discovery session init failed', err instanceof Error ? err : undefined);
      return null;
    }
  }

  const sendMessage = useCallback(async (userContent: string, isRetry = false) => {
    if (!userContent.trim()) return;

    setTurnError(null);
    setStatus('loading');
    lastUserMessageRef.current = userContent;

    let sid = sessionIdRef.current;
    if (!sid) {
      sid = await initSession(userContent);
      if (!sid) {
        setStatus('error');
        // pre_stream failure on session init — retry will reattempt
        // session creation as well
        setTurnError({ kind: 'pre_stream', surface: 'message' });
        return;
      }
    }

    // On retry the user bubble already exists in the message list — do
    // not append a duplicate. The history has also already been
    // appended for the original attempt; we leave it in place because
    // the server uses it to generate the same context.
    if (!isRetry) {
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userContent };
      setMessages(prev => [...prev, userMsg]);
    }
    abortRef.current = new AbortController();

    // Capture history BEFORE adding the current message, then append it.
    // This gives the server the full prior conversation without the current turn.
    // On retry the historyRef already includes the current user turn,
    // so we splice it off the end before sending.
    const sendHistory = isRetry
      ? historyRef.current
          .slice(0, -1)
          .map(m => `${m.role}: ${m.content}`)
          .join('\n')
          .slice(0, 7500)
      : historyRef.current
          .map(m => `${m.role}: ${m.content}`)
          .join('\n')
          .slice(0, 7500);

    if (!isRetry) {
      historyRef.current = [...historyRef.current, { role: 'user', content: userContent }];
    }

    try {
      const res = await fetch(`/api/discovery/sessions/${sid}/turn`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: userContent, history: sendHistory }),
        signal:  abortRef.current.signal,
      });

      if (!res.ok) {
        // Pre-stream failure — server returned an error before any chunks
        logger.error('Discovery turn HTTP error', new Error(`turn ${res.status}`));
        setStatus('error');
        setTurnError({ kind: 'pre_stream', surface: 'stepper' });
        return;
      }

      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const data = await res.json() as { status?: string; error?: string };
        if (data.status === 'synthesizing') {
          setIsSynthesizing(true);
          setStepperVisible(false);
        } else {
          logger.error('Unexpected turn response', new Error(data.error ?? JSON.stringify(data)));
          setStatus('error');
          setTurnError({ kind: 'pre_stream', surface: 'stepper' });
          return;
        }
        setStatus('idle');
        return;
      }

      const nextCount             = res.headers.get('X-Question-Count');
      const isSynthesisTransition = res.headers.get('X-Synthesis-Transition') === 'true';
      if (nextCount) setQuestionIndex(Number(nextCount));

      if (!res.body) {
        setStatus('error');
        setTurnError({ kind: 'pre_stream', surface: 'stepper' });
        return;
      }

      setStatus('streaming');
      let finalContent = '';
      let cleanClose   = false;

      if (isSynthesisTransition) {
        // Reflection — stream directly into message list, not the stepper.
        // Synthesis is already running in Inngest; this gives the user a moment
        // to feel heard before the ThinkingPanel appears.
        const reflectionId = crypto.randomUUID();
        setMessages(prev => [...prev, { id: reflectionId, role: 'assistant', content: '' }]);
        try {
          await readTextStream(res.body, chunk => {
            finalContent = chunk;
            setMessages(prev => prev.map(m => m.id === reflectionId ? { ...m, content: chunk } : m));
          });
          cleanClose = true;
        } catch (streamErr) {
          logger.error(
            'Reflection stream cut',
            streamErr instanceof Error ? streamErr : new Error(String(streamErr)),
          );
        }

        if (cleanClose && finalContent.length >= MIN_COMPLETE_STREAM_CHARS) {
          setIsSynthesizing(true);
          setStatus('idle');
        } else {
          // Cut stream OR suspiciously short reflection. Surface as a
          // recoverable failure. The reflection bubble keeps its
          // partial content so the founder can read what arrived.
          setStatus('error');
          setTurnError({ kind: 'cut_stream', partial: finalContent, surface: 'reflection' });
        }
      } else {
        // Normal next question — show in stepper, add to history
        setStepperVisible(true);
        setCurrentQuestion('');
        try {
          await readTextStream(res.body, chunk => {
            setCurrentQuestion(chunk);
            finalContent = chunk;
          });
          cleanClose = true;
        } catch (streamErr) {
          logger.error(
            'Question stream cut',
            streamErr instanceof Error ? streamErr : new Error(String(streamErr)),
          );
        }

        if (cleanClose && finalContent.length >= MIN_COMPLETE_STREAM_CHARS) {
          historyRef.current = [...historyRef.current, { role: 'assistant', content: finalContent }];
          setStatus('idle');
        } else {
          // Cut stream OR suspiciously short question. The stepper
          // surfaces a retry icon; the partial content (if any) is
          // visible above it.
          setStatus('error');
          setTurnError({ kind: 'cut_stream', partial: finalContent, surface: 'stepper' });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logger.error('Discovery turn failed', err instanceof Error ? err : undefined);
      setStatus('error');
      // Distinguish: did we already start streaming?
      setTurnError({ kind: 'pre_stream', surface: 'stepper' });
    }
  }, []);

  /**
   * retryLastTurn
   *
   * Re-fires the most recent user message with the same session and
   * history state. The user bubble is not duplicated; the history
   * append is skipped because the original attempt already added it.
   * Clears any partial content and the error state before retrying.
   */
  const retryLastTurn = useCallback(async () => {
    const last = lastUserMessageRef.current;
    if (!last) return;
    setTurnError(null);
    setCurrentQuestion('');
    // Drop any zero-length / partial assistant bubble that may have
    // been pushed for a cut reflection turn — readers should see the
    // retry start clean rather than a half-written bubble.
    setMessages(prev => prev.filter(m => !(m.role === 'assistant' && m.content.length < MIN_COMPLETE_STREAM_CHARS)));
    await sendMessage(last, true);
  }, [sendMessage]);

  // 5-minute synthesis timeout — stops polling and surfaces error to user
  useEffect(() => {
    if (!isSynthesizing) return;
    pollIntervalRef.current = 3000;
    const timer = setTimeout(() => {
      if (!calledOnCompleteRef.current) {
        setIsSynthesizing(false);
        setSynthesisError(true);
      }
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [isSynthesizing]);

  // Recommendation polling — exponential backoff, capped at 30s
  const recKey = isSynthesizing && sessionId
    ? `/api/discovery/sessions/${sessionId}/recommendation`
    : null;

  const { data: recData } = useSWR<RecResponse>(recKey, recFetcher, {
    refreshInterval: d => {
      if (d && 'recommendation' in d) return 0;
      const next = pollIntervalRef.current;
      pollIntervalRef.current = Math.min(next * 2, 30000);
      return next;
    },
    revalidateOnFocus: false,
  });

  const recommendation = recData && 'recommendation' in recData ? recData.recommendation : null;
  const synthesisStep  = recData && 'status' in recData ? recData.synthesisStep : null;

  // Restart polling after a synthesis error — if the recommendation was already
  // persisted (e.g. error was in a later pipeline step), the first poll finds it.
  const retryRecommendation = useCallback(() => {
    pollIntervalRef.current = 3000;
    setSynthesisError(false);
    setIsSynthesizing(true);
  }, []);

  useEffect(() => {
    if (!recommendation || calledOnCompleteRef.current) return;
    calledOnCompleteRef.current = true;
    onComplete?.(recommendation, conversationIdRef.current ?? '');
  }, [recommendation, onComplete]);

  // Public sendMessage exposes the single-arg shape — the internal
  // retry path uses the second arg directly via retryLastTurn.
  const publicSendMessage = useCallback(
    (content: string) => sendMessage(content),
    [sendMessage],
  );

  return {
    messages,
    status,
    sessionReady:   true,
    isSynthesizing,
    synthesisError,
    synthesisStep,
    stepperVisible,
    setStepperVisible,
    currentQuestion,
    questionIndex,
    turnError,
    sendMessage:   publicSendMessage,
    retryLastTurn,
    retryRecommendation,
  };
}
