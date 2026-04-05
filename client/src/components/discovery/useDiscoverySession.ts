// src/components/discovery/useDiscoverySession.ts
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { logger } from '@/lib/logger';
import type { Recommendation } from '@/lib/discovery/client';
import type { ChatMessage } from './MessageList';

type ChatStatus  = 'idle' | 'loading' | 'streaming' | 'error';
type RecResponse = { recommendation: Recommendation } | { status: 'pending' };

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

export interface DiscoverySessionState {
  messages:          ChatMessage[];
  status:            ChatStatus;
  sessionReady:      boolean;
  isSynthesizing:    boolean;
  synthesisError:    boolean;
  stepperVisible:    boolean;
  currentQuestion:   string;
  questionIndex:     number;
  sendMessage:       (content: string) => Promise<void>;
  setStepperVisible: (v: boolean) => void;
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

  const sessionIdRef        = useRef<string | null>(resume?.sessionId ?? null);
  const conversationIdRef   = useRef<string | null>(resume?.conversationId ?? null);
  const calledOnCompleteRef = useRef(false);
  const abortRef            = useRef<AbortController | null>(null);
  const pollIntervalRef     = useRef(3000);
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

  const sendMessage = useCallback(async (userContent: string) => {
    if (!userContent.trim()) return;

    setStatus('loading');
    let sid = sessionIdRef.current;
    if (!sid) {
      sid = await initSession(userContent);
      if (!sid) { setStatus('error'); return; }
    }

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userContent };
    setMessages(prev => [...prev, userMsg]);
    abortRef.current = new AbortController();

    // Capture history BEFORE adding the current message, then append it.
    // This gives the server the full prior conversation without the current turn.
    const history = historyRef.current
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 7500);
    historyRef.current = [...historyRef.current, { role: 'user', content: userContent }];

    try {
      const res = await fetch(`/api/discovery/sessions/${sid}/turn`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: userContent, history }),
        signal:  abortRef.current.signal,
      });

      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        const data = await res.json() as { status?: string; error?: string };
        if (data.status === 'synthesizing') {
          setIsSynthesizing(true);
          setStepperVisible(false);
        } else {
          logger.error('Unexpected turn response', new Error(data.error ?? JSON.stringify(data)));
          setStatus('error');
        }
        setStatus('idle');
        return;
      }

      const nextCount             = res.headers.get('X-Question-Count');
      const isSynthesisTransition = res.headers.get('X-Synthesis-Transition') === 'true';
      if (nextCount) setQuestionIndex(Number(nextCount));

      if (!res.body) { setStatus('idle'); return; }

      setStatus('streaming');
      let finalContent = '';

      if (isSynthesisTransition) {
        // Reflection — stream directly into message list, not the stepper.
        // Synthesis is already running in Inngest; this gives the user a moment
        // to feel heard before the ThinkingPanel appears.
        const reflectionId = crypto.randomUUID();
        setMessages(prev => [...prev, { id: reflectionId, role: 'assistant', content: '' }]);
        await readTextStream(res.body, chunk => {
          finalContent = chunk;
          setMessages(prev => prev.map(m => m.id === reflectionId ? { ...m, content: chunk } : m));
        });
        setIsSynthesizing(true);
      } else {
        // Normal next question — show in stepper, add to history
        setStepperVisible(true);
        setCurrentQuestion('');
        await readTextStream(res.body, chunk => {
          setCurrentQuestion(chunk);
          finalContent = chunk;
        });
        if (finalContent) {
          historyRef.current = [...historyRef.current, { role: 'assistant', content: finalContent }];
        }
      }
      setStatus('idle');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logger.error('Discovery turn failed', err instanceof Error ? err : undefined);
      setStatus('error');
    }
  }, []);

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

  useEffect(() => {
    if (!recommendation || calledOnCompleteRef.current) return;
    calledOnCompleteRef.current = true;
    onComplete?.(recommendation, conversationIdRef.current ?? '');
  }, [recommendation, onComplete]);

  return {
    messages,
    status,
    sessionReady:   true,
    isSynthesizing,
    synthesisError,
    stepperVisible,
    setStepperVisible,
    currentQuestion,
    questionIndex,
    sendMessage,
  };
}
