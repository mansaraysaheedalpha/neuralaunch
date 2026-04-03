// src/components/discovery/DiscoveryChat.tsx
'use client';

import { useState, useRef, useCallback, useEffect, type FormEvent } from 'react';
import useSWR from 'swr';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal } from 'lucide-react';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import type { Recommendation, InterviewPhase } from '@/lib/discovery/client';
import { PhaseIndicator } from './PhaseIndicator';
import { ContextProgress } from './ContextProgress';
import { MessageList, type ChatMessage } from './MessageList';

type ChatStatus  = 'idle' | 'loading' | 'streaming' | 'error';
type RecResponse = { recommendation: Recommendation } | { status: 'pending' };

interface DiscoveryChatProps {
  onComplete?: (recommendation: Recommendation) => void;
}

const recFetcher = (url: string): Promise<RecResponse> =>
  fetch(url).then(r => r.json() as Promise<RecResponse>);

async function readTextStream(
  stream: ReadableStream<Uint8Array>,
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
 * Main conversational UI for the Phase 1 discovery interview.
 * Creates a session on mount, streams interview questions via fetch, and
 * polls for the recommendation once synthesis begins.
 */
export function DiscoveryChat({ onComplete }: DiscoveryChatProps) {
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [input,          setInput]          = useState('');
  const [status,         setStatus]         = useState<ChatStatus>('idle');
  const [sessionId,      setSessionId]      = useState<string | null>(null);
  const [phase,          setPhase]          = useState<InterviewPhase>('ORIENTATION');
  const [questionCount,  setQuestionCount]  = useState(0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const sessionIdRef        = useRef<string | null>(null);
  const calledOnCompleteRef = useRef(false);
  const abortRef            = useRef<AbortController | null>(null);

  // Session initialisation — POST side-effect, not a data-fetching GET
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setStatus('loading');
      try {
        const res = await fetch('/api/discovery/sessions', { method: 'POST' });
        if (!res.ok) throw new Error(`Session create failed: ${res.status}`);
        const sid = res.headers.get('X-Session-Id');
        if (!sid) throw new Error('Missing X-Session-Id');
        sessionIdRef.current = sid;
        setSessionId(sid);
        if (!res.body) { setStatus('idle'); return; }
        const msgId = crypto.randomUUID();
        setMessages([{ id: msgId, role: 'assistant', content: '' }]);
        setStatus('streaming');
        await readTextStream(res.body, c => {
          if (!cancelled) setMessages([{ id: msgId, role: 'assistant', content: c }]);
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
    setInput('');
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
        // Body is consumed here — must return in ALL branches to avoid locking the stream
        const data = await res.json() as { status?: string; error?: string };
        if (data.status === 'synthesizing') {
          setIsSynthesizing(true);
          setStatus('idle');
        } else {
          // Any other JSON response (error, unexpected status) — surface as error
          logger.error('Unexpected turn response', new Error(data.error ?? JSON.stringify(data)));
          setStatus('error');
        }
        return;
      }

      const p = res.headers.get('X-Phase') as InterviewPhase | null;
      const q = res.headers.get('X-Question-Count');
      if (p) setPhase(p);
      if (q) setQuestionCount(Number(q));
      if (!res.body) { setStatus('idle'); return; }

      const msgId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: msgId, role: 'assistant', content: '' }]);
      setStatus('streaming');
      await readTextStream(res.body, c => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: c } : m));
      });
      setStatus('idle');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      logger.error('Discovery turn failed', err instanceof Error ? err : undefined);
      setStatus('error');
    }
  }, [messages]);

  // Recommendation polling — stops automatically once data arrives
  const recKey = isSynthesizing && sessionId
    ? `/api/discovery/sessions/${sessionId}/recommendation`
    : null;

  const { data: recData } = useSWR<RecResponse>(recKey, recFetcher, {
    refreshInterval: (d) => (d && 'recommendation' in d ? 0 : 3000),
    revalidateOnFocus: false,
  });

  const recommendation = recData && 'recommendation' in recData ? recData.recommendation : null;

  useEffect(() => {
    if (!recommendation || calledOnCompleteRef.current) return;
    calledOnCompleteRef.current = true;
    onComplete?.(recommendation);
  }, [recommendation, onComplete]);

  const isLoading = status === 'loading';
  const canSubmit = !!sessionId && !isSynthesizing && input.trim().length > 0
    && status !== 'loading' && status !== 'streaming';

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); if (canSubmit) void sendMessage(input); };

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full">
      <div className="flex flex-col gap-3 py-4 border-b border-border">
        <PhaseIndicator currentPhase={phase} />
        <ContextProgress questionCount={questionCount} currentPhase={phase} />
      </div>

      <MessageList messages={messages} isLoading={isLoading} isSynthesizing={isSynthesizing} />

      <form onSubmit={handleSubmit} className="flex gap-2 items-end border-t border-border px-4 py-3">
        <TextareaAutosize
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={!sessionId || isSynthesizing}
          placeholder={isSynthesizing ? 'Generating your recommendation…' : 'Share your thoughts…'}
          maxRows={5}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-2"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSubmit) void sendMessage(input); }
          }}
        />
        <Button type="submit" size="icon" disabled={!canSubmit} variant="ghost">
          <SendHorizontal className="size-4" />
        </Button>
      </form>
    </div>
  );
}
