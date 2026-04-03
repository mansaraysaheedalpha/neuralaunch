// src/components/discovery/DiscoveryChat.tsx
'use client';

import { useState, useRef, useCallback, useEffect, type FormEvent } from 'react';
import useSWR from 'swr';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal } from 'lucide-react';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import type { Recommendation, InterviewPhase } from '@/lib/discovery/client';
import { MessageList, type ChatMessage } from './MessageList';
import { WelcomeLayer } from './WelcomeLayer';
import { QuestionStepper } from './QuestionStepper';

// Rough question estimate per session — used for stepper dots/counter.
// Actual total is adaptive; we update as questions arrive.
const ESTIMATED_QUESTIONS = 8;

type ChatStatus  = 'idle' | 'loading' | 'streaming' | 'error';
type RecResponse = { recommendation: Recommendation } | { status: 'pending' };

interface DiscoveryChatProps {
  firstName:   string;
  onComplete?: (recommendation: Recommendation, conversationId: string) => void;
}

const recFetcher = (url: string): Promise<RecResponse> =>
  fetch(url).then(r => r.json() as Promise<RecResponse>);

async function readTextStream(
  stream:  ReadableStream<Uint8Array>,
  onChunk: (partial: string) => void,
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
 * DiscoveryChat
 *
 * Main conversational UI for Phase 1.
 * - Shows WelcomeLayer until first message is sent
 * - Shows QuestionStepper anchored above input while interview is active
 * - Shows MessageList for the conversation thread
 * - Polls for recommendation once synthesis begins
 */
export function DiscoveryChat({ firstName, onComplete }: DiscoveryChatProps) {
  const [messages,        setMessages]        = useState<ChatMessage[]>([]);
  const [input,           setInput]           = useState('');
  const [status,          setStatus]          = useState<ChatStatus>('idle');
  const [sessionId,       setSessionId]       = useState<string | null>(null);
  const [isSynthesizing,  setIsSynthesizing]  = useState(false);
  const [hasStarted,      setHasStarted]      = useState(false);

  // Stepper state
  const [stepperVisible,   setStepperVisible]   = useState(false);
  const [currentQuestion,  setCurrentQuestion]  = useState('');
  const [questionIndex,    setQuestionIndex]     = useState(0);
  const [totalEstimate,    setTotalEstimate]     = useState(ESTIMATED_QUESTIONS);

  const sessionIdRef        = useRef<string | null>(null);
  const conversationIdRef   = useRef<string | null>(null);
  const calledOnCompleteRef = useRef(false);
  const abortRef            = useRef<AbortController | null>(null);
  const mainInputRef        = useRef<HTMLTextAreaElement>(null);

  // -------------------------------------------------------------------------
  // Session init — fires once on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setStatus('loading');
      try {
        const res = await fetch('/api/discovery/sessions', { method: 'POST' });
        if (!res.ok) throw new Error(`Session create failed: ${res.status}`);

        const sid  = res.headers.get('X-Session-Id');
        const cid  = res.headers.get('X-Conversation-Id');
        if (!sid) throw new Error('Missing X-Session-Id');

        sessionIdRef.current      = sid;
        conversationIdRef.current = cid;
        setSessionId(sid);

        if (!res.body) { setStatus('idle'); return; }

        // Stream opening question into stepper
        setStepperVisible(true);
        setQuestionIndex(0);
        let accumulated = '';
        setCurrentQuestion('');
        setStatus('streaming');

        await readTextStream(res.body, chunk => {
          if (!cancelled) {
            accumulated = chunk;
            setCurrentQuestion(chunk);
          }
        });

        if (!cancelled) {
          setCurrentQuestion(accumulated);
          setStatus('idle');
        }
      } catch (err) {
        logger.error('Discovery session init failed', err instanceof Error ? err : undefined);
        if (!cancelled) setStatus('error');
      }
    }

    void init();
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, []);

  // -------------------------------------------------------------------------
  // Send a message (from stepper answer OR main input)
  // -------------------------------------------------------------------------
  const sendMessage = useCallback(async (userContent: string) => {
    const sid = sessionIdRef.current;
    if (!sid || !userContent.trim()) return;

    // Echo user message into thread
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: userContent };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setHasStarted(true);
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
          setStatus('idle');
        } else {
          logger.error('Unexpected turn response', new Error(data.error ?? JSON.stringify(data)));
          setStatus('error');
        }
        return;
      }

      // Next question streams in — update stepper
      const nextPhase = res.headers.get('X-Phase') as InterviewPhase | null;
      const nextCount = res.headers.get('X-Question-Count');
      if (nextCount) {
        const qNum = Number(nextCount);
        setQuestionIndex(qNum);
        // Widen estimate if we're approaching the current estimate
        setTotalEstimate(prev => Math.max(prev, qNum + 2));
      }
      if (nextPhase === 'SYNTHESIS') {
        setStepperVisible(false);
        setIsSynthesizing(true);
        setStatus('idle');
        return;
      }

      if (!res.body) { setStatus('idle'); return; }

      setCurrentQuestion('');
      setStatus('streaming');
      await readTextStream(res.body, chunk => {
        setCurrentQuestion(chunk);
      });
      setStatus('idle');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logger.error('Discovery turn failed', err instanceof Error ? err : undefined);
      setStatus('error');
    }
  }, [messages]);

  // -------------------------------------------------------------------------
  // Recommendation polling
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Chip click — populate main input and focus it
  // -------------------------------------------------------------------------
  const handleChipClick = useCallback((text: string) => {
    setInput(text);
    mainInputRef.current?.focus();
  }, []);

  // -------------------------------------------------------------------------
  // Main input submit
  // -------------------------------------------------------------------------
  const isLoading = status === 'loading';
  const canSubmit = !!sessionId && !isSynthesizing && input.trim().length > 0
    && status !== 'loading' && status !== 'streaming';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) {
      setStepperVisible(false); // user chose to answer in main input
      void sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-full relative">

      {/* Scrollable message thread — only visible once conversation starts */}
      {hasStarted && (
        <MessageList
          messages={messages}
          isLoading={isLoading && !stepperVisible}
          isSynthesizing={isSynthesizing}
        />
      )}

      {/* Welcome layer — empty state, disappears on first message */}
      <WelcomeLayer
        firstName={firstName}
        isVisible={!hasStarted && !isSynthesizing}
        onChipClick={handleChipClick}
      />

      {/* Question stepper — anchored above input, driven by server stream */}
      <QuestionStepper
        currentQuestion={currentQuestion}
        currentIndex={questionIndex}
        totalEstimate={totalEstimate}
        isVisible={stepperVisible && !isSynthesizing}
        onAnswer={answer => void sendMessage(answer)}
        onDismiss={() => {
          setStepperVisible(false);
          mainInputRef.current?.focus();
        }}
      />

      {/* Main input bar — always present, always in position */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-2 items-end border-t border-border px-4 py-3 bg-background"
      >
        <TextareaAutosize
          ref={mainInputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={!sessionId || isSynthesizing}
          placeholder={isSynthesizing ? 'Generating your recommendation…' : 'Share your thoughts…'}
          maxRows={5}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-2"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) {
                setStepperVisible(false);
                void sendMessage(input);
              }
            }
          }}
        />
        <Button type="submit" size="icon" disabled={!canSubmit} variant="ghost">
          <SendHorizontal className="size-4" />
        </Button>
      </form>
    </div>
  );
}
