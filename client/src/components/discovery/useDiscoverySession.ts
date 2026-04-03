// src/components/discovery/useDiscoverySession.ts
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { logger } from '@/lib/logger';
import type { Recommendation, InterviewPhase } from '@/lib/discovery/client';
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
  stepperVisible:    boolean;
  currentQuestion:   string;
  questionIndex:     number;
  sendMessage:       (content: string) => Promise<void>;
  setStepperVisible: (v: boolean) => void;
}

interface Options {
  onComplete?: (recommendation: Recommendation, conversationId: string) => void;
}

/**
 * useDiscoverySession
 *
 * Manages all server interaction for the discovery interview:
 * session init, per-turn streaming, and recommendation polling.
 */
export function useDiscoverySession({ onComplete }: Options): DiscoverySessionState {
  const [messages,        setMessages]        = useState<ChatMessage[]>([]);
  const [status,          setStatus]          = useState<ChatStatus>('idle');
  const [sessionId,       setSessionId]       = useState<string | null>(null);
  const [isSynthesizing,  setIsSynthesizing]  = useState(false);
  const [stepperVisible,  setStepperVisible]  = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionIndex,   setQuestionIndex]   = useState(0);

  const sessionIdRef        = useRef<string | null>(null);
  const conversationIdRef   = useRef<string | null>(null);
  const calledOnCompleteRef = useRef(false);
  const abortRef            = useRef<AbortController | null>(null);

  // Session init — fires once on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setStatus('loading');
      try {
        const res = await fetch('/api/discovery/sessions', { method: 'POST' });
        if (!res.ok) throw new Error(`Session create failed: ${res.status}`);

        const sid = res.headers.get('X-Session-Id');
        const cid = res.headers.get('X-Conversation-Id');
        if (!sid) throw new Error('Missing X-Session-Id');

        sessionIdRef.current      = sid;
        conversationIdRef.current = cid;
        setSessionId(sid);

        if (!res.body) { setStatus('idle'); return; }

        setStepperVisible(true);
        setQuestionIndex(0);
        setCurrentQuestion('');
        setStatus('streaming');

        await readTextStream(res.body, chunk => {
          if (!cancelled) setCurrentQuestion(chunk);
        });

        if (!cancelled) setStatus('idle');
      } catch (err) {
        logger.error('Discovery session init failed', err instanceof Error ? err : undefined);
        if (!cancelled) setStatus('error');
      }
    }

    void init();
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, []);

  const sendMessage = useCallback(async (userContent: string) => {
    const sid = sessionIdRef.current;
    if (!sid || !userContent.trim()) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userContent };
    setMessages(prev => [...prev, userMsg]);
    setStatus('loading');
    abortRef.current = new AbortController();

    const history = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 7500);

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

      const nextPhase = res.headers.get('X-Phase') as InterviewPhase | null;
      const nextCount = res.headers.get('X-Question-Count');
      if (nextCount) setQuestionIndex(Number(nextCount));
      if (nextPhase === 'SYNTHESIS') {
        setStepperVisible(false);
        setIsSynthesizing(true);
        setStatus('idle');
        return;
      }

      if (!res.body) { setStatus('idle'); return; }

      setCurrentQuestion('');
      setStatus('streaming');
      await readTextStream(res.body, chunk => { setCurrentQuestion(chunk); });
      setStatus('idle');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logger.error('Discovery turn failed', err instanceof Error ? err : undefined);
      setStatus('error');
    }
  }, [messages]);

  // Recommendation polling
  const recKey = isSynthesizing && sessionId
    ? `/api/discovery/sessions/${sessionId}/recommendation`
    : null;

  const { data: recData } = useSWR<RecResponse>(recKey, recFetcher, {
    refreshInterval: d => (d && 'recommendation' in d ? 0 : 3000),
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
    sessionReady:   !!sessionId,
    isSynthesizing,
    stepperVisible,
    setStepperVisible,
    currentQuestion,
    questionIndex,
    sendMessage,
  };
}
