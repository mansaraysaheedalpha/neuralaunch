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
  sendMessage:            (content: string, inputMethod?: 'voice') => Promise<void>;
  retryLastTurn:          () => Promise<void>;
  setStepperVisible:      (v: boolean) => void;
  retryRecommendation:    () => void;
  /**
   * Concern 5 trigger #3 — set when the founder tries to start a
   * new discovery session while a prior partially-complete roadmap
   * has no outcome attestation. The chat UI renders the outcome
   * modal targeting this recommendation, then calls
   * dismissPendingOutcomeAndRetry to actually create the new session.
   */
  pendingOutcomeRecommendationId: string | null;
  dismissPendingOutcomeAndRetry:  () => Promise<void>;
  /**
   * Server-returned error message for cases where session creation
   * was refused with 403 (Free-tier lifetime cap reached). The chat
   * UI renders this as a banner with an upgrade CTA instead of
   * leaving the screen blank. The server page at /discovery catches
   * most of these pre-emptively; this is the defensive second layer
   * for any stale tab that hits the server check first.
   */
  sessionInitError: string | null;
  clearSessionInitError: () => void;
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
  // Concern 5 trigger #3 — set when the session POST returns 200 with
  // pendingOutcomeRecommendationId. The chat UI renders the outcome
  // modal in front of the founder before the new session can be
  // created. Cleared by dismissPendingOutcomeAndRetry.
  const [pendingOutcomeRecommendationId, setPendingOutcomeRecommendationId] = useState<string | null>(null);
  // Surfaces server-returned 403 messages from POST /api/discovery/sessions
  // so the chat renders a clear banner instead of going blank. Cleared
  // by the chat UI when the user navigates or explicitly dismisses.
  const [sessionInitError, setSessionInitError] = useState<string | null>(null);

  const sessionIdRef        = useRef<string | null>(resume?.sessionId ?? null);
  const conversationIdRef   = useRef<string | null>(resume?.conversationId ?? null);
  const calledOnCompleteRef = useRef(false);
  const abortRef            = useRef<AbortController | null>(null);
  const pollIntervalRef     = useRef(3000);
  // The last user message we attempted to send. retryLastTurn re-fires
  // exactly this content with the same session and history state.
  const lastUserMessageRef  = useRef<string | null>(null);
  // Concern 5 trigger #3 — stash the original first message so
  // dismissPendingOutcomeAndRetry can re-fire it after the founder
  // dismisses the outcome modal.
  const pendingFirstMessageRef = useRef<string | null>(null);
  // Mutable ref to the latest sendMessage closure so the
  // dismissPendingOutcomeAndRetry callback (defined before
  // sendMessage) can call it without a stale-closure warning.
  const sendMessageInternalRef = useRef<((content: string, isRetry?: boolean, ackPendingOutcome?: boolean, inputMethod?: 'voice') => Promise<void>) | null>(null);
  // Full bidirectional history — user answers + AI questions. Separate from
  // `messages` display state so the chat UI is not affected.
  // Pre-populated from resumed messages so post-resume turns have full context.
  const historyRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>(
    resume?.messages.map(m => ({ role: m.role, content: m.content })) ?? [],
  );

  // Session is created lazily on the user's first message — not on mount.
  // This prevents a sidebar entry being created every time /discovery is loaded.
  //
  // Concern 5 trigger #3: the server may return a 200 with
  // pendingOutcomeRecommendationId instead of creating the session,
  // when the founder has a prior partially-complete roadmap with no
  // outcome attestation yet. The hook surfaces that state via
  // pendingOutcomeRecommendationId; the UI renders the outcome modal
  // and re-calls initSession(message, true) once the modal is dismissed.
  async function initSession(
    firstMessage: string,
    acknowledgePendingOutcome = false,
  ): Promise<string | null> {
    try {
      const res = await fetch('/api/discovery/sessions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ firstMessage, acknowledgePendingOutcome }),
      });
      if (!res.ok) {
        // 403 with an error body is the Free-tier cap (or any other
        // tier-limit refusal). Surface the server message so the chat
        // can render it instead of silently going blank.
        if (res.status === 403) {
          const json = await res.json().catch(() => ({})) as { error?: string };
          const msg = json.error ?? "You've reached the free-tier discovery limit. Upgrade to Execute to continue.";
          setSessionInitError(msg);
          return null;
        }
        throw new Error(`Session create failed: ${res.status}`);
      }

      // Concern 5 trigger #3 — server returned 200 without creating
      // the session. Surface the pending recommendation ID and let
      // the UI render the outcome modal.
      const sid = res.headers.get('X-Session-Id');
      if (!sid) {
        const json = await res.json().catch(() => ({})) as { pendingOutcomeRecommendationId?: string };
        if (json.pendingOutcomeRecommendationId) {
          setPendingOutcomeRecommendationId(json.pendingOutcomeRecommendationId);
          // Stash the message so the UI can re-fire after the modal closes.
          pendingFirstMessageRef.current = firstMessage;
          return null;
        }
        throw new Error('Missing X-Session-Id');
      }

      const cid = res.headers.get('X-Conversation-Id');
      sessionIdRef.current      = sid;
      conversationIdRef.current = cid;
      setSessionId(sid);
      return sid;
    } catch (err) {
      logger.error('Discovery session init failed', err instanceof Error ? err : undefined);
      return null;
    }
  }

  /**
   * Concern 5 trigger #3 — re-attempt session creation after the
   * founder has either submitted or skipped the outcome modal.
   * Sends acknowledgePendingOutcome=true to bypass the server check.
   */
  const dismissPendingOutcomeAndRetry = useCallback(async () => {
    const msg = pendingFirstMessageRef.current;
    if (!msg) {
      setPendingOutcomeRecommendationId(null);
      return;
    }
    setPendingOutcomeRecommendationId(null);
    pendingFirstMessageRef.current = null;
    // Retry with the acknowledge flag set
    await sendMessageInternalRef.current?.(msg, false, true);
  }, []);

  const sendMessage = useCallback(async (
    userContent: string,
    isRetry = false,
    ackPendingOutcome = false,
    inputMethod?: 'voice',
  ) => {
    if (!userContent.trim()) return;

    setTurnError(null);
    setStatus('loading');
    lastUserMessageRef.current = userContent;

    let sid = sessionIdRef.current;
    if (!sid) {
      sid = await initSession(userContent, ackPendingOutcome);
      if (!sid) {
        // initSession may have set pendingOutcomeRecommendationId
        // (Concern 5 trigger #3) — that's a normal control-flow
        // case, not an error. The chat UI is responsible for
        // rendering the modal and calling dismissPendingOutcomeAndRetry.
        // We do NOT surface a turn error in that case.
        setStatus('idle');
        return;
      }
    }

    // On retry the user bubble already exists in the message list — do
    // not append a duplicate. The history has also already been
    // appended for the original attempt; we leave it in place because
    // the server uses it to generate the same context.
    if (!isRetry) {
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userContent, inputMethod };
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
        body:    JSON.stringify({ message: userContent, history: sendHistory, inputMethod }),
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

  // Public sendMessage exposes (content, inputMethod?) — the internal
  // retry path uses isRetry/ackPendingOutcome directly via retryLastTurn
  // and dismissPendingOutcomeAndRetry.
  const publicSendMessage = useCallback(
    (content: string, inputMethod?: 'voice') => sendMessage(content, false, false, inputMethod),
    [sendMessage],
  );

  // Keep the internal ref pointed at the latest sendMessage closure
  // so dismissPendingOutcomeAndRetry can call it without a stale
  // reference. useEffect runs after every render with the new value.
  useEffect(() => {
    sendMessageInternalRef.current = sendMessage;
  }, [sendMessage]);

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
    pendingOutcomeRecommendationId,
    dismissPendingOutcomeAndRetry,
    sessionInitError,
    clearSessionInitError: () => setSessionInitError(null),
  };
}
