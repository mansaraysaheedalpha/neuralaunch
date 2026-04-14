// src/hooks/useDiscovery.ts
//
// Discovery session hook — manages the full interview lifecycle:
// session creation, per-turn streaming, synthesis polling, and
// recommendation retrieval. Mirror of the web app's
// useDiscoverySession.ts adapted for React Native.

import { useState, useRef, useCallback, useEffect } from 'react';
import { api, ApiError, API_BASE_URL, getToken } from '@/services/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

type Status = 'idle' | 'loading' | 'streaming' | 'error';

interface Recommendation {
  id:                     string;
  summary:                string;
  path:                   string;
  reasoning:              string;
  firstThreeSteps:        string[];
  timeToFirstResult:      string;
  risks:                  Array<{ risk: string; mitigation: string }>;
  assumptions:            string[];
  whatWouldMakeThisWrong: string;
  alternativeRejected:    { alternative: string; whyNotForThem: string };
  recommendationType:     string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDiscovery() {
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [status,         setStatus]         = useState<Status>('idle');
  const [sessionId,      setSessionId]      = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisError, setSynthesisError] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

  const sessionIdRef    = useRef<string | null>(null);
  const pollIntervalRef = useRef(3000);
  const pollTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef        = useRef<AbortController | null>(null);

  // ---- Session init ----
  const initSession = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await api<{ sessionId: string }>('/api/discovery/sessions', {
        method: 'POST',
      });
      sessionIdRef.current = data.sessionId;
      setSessionId(data.sessionId);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }, []);

  // ---- Resume an existing session ----
  const resumeSession = useCallback(async (existingSessionId: string) => {
    setStatus('loading');
    try {
      const data = await api<{ messages: ChatMessage[] }>(
        `/api/discovery/sessions/${existingSessionId}/resume`,
      );
      sessionIdRef.current = existingSessionId;
      setSessionId(existingSessionId);
      setMessages(data.messages ?? []);
      setStatus('idle');
    } catch {
      // Resume failed — fall back to a new session
      void initSession();
    }
  }, [initSession]);

  // ---- Discard an incomplete session ----
  const discardSession = useCallback(async (existingSessionId: string) => {
    try {
      await api(`/api/discovery/sessions/${existingSessionId}`, {
        method: 'DELETE',
      });
    } catch { /* non-fatal */ }
    await initSession();
  }, [initSession]);

  // ---- Send message ----
  const sendMessage = useCallback(async (content: string) => {
    const sid = sessionIdRef.current;
    if (!sid || !content.trim()) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content,
    };
    setMessages(prev => [...prev, userMsg]);
    setStatus('loading');

    const history = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 7500);

    abortRef.current = new AbortController();

    try {
      // The turn endpoint returns either JSON (synthesizing) or a text stream (next question)
      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE_URL}/api/discovery/sessions/${sid}/turn`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ message: content, history }),
          signal: abortRef.current.signal,
        },
      );

      const ct = res.headers.get('content-type') ?? '';

      if (ct.includes('application/json')) {
        const data = await res.json() as { status?: string; error?: string };
        if (data.status === 'synthesizing') {
          setIsSynthesizing(true);
        }
        setStatus('idle');
        return;
      }

      // Stream the next question
      if (!res.body) {
        setStatus('idle');
        return;
      }

      setStatus('streaming');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      const assistantId = `${Date.now()}-assistant`;

      // Add empty assistant message, then update it as chunks arrive
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m),
        );
      }

      setStatus('idle');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setStatus('error');
    }
  }, [messages]);

  // ---- Synthesis polling ----
  useEffect(() => {
    if (!isSynthesizing || !sessionIdRef.current) return;

    const deadline = Date.now() + 5 * 60 * 1000; // 5 min timeout
    pollIntervalRef.current = 3000;

    async function poll() {
      if (Date.now() >= deadline) {
        setIsSynthesizing(false);
        setSynthesisError(true);
        return;
      }

      try {
        const data = await api<{ recommendation?: Recommendation; status?: string }>(
          `/api/discovery/sessions/${sessionIdRef.current}/recommendation`,
        );

        if (data.recommendation) {
          setRecommendation(data.recommendation);
          setIsSynthesizing(false);
          return;
        }

        // Back off: 3s → 6s → 12s → 24s → 30s cap
        pollIntervalRef.current = Math.min(pollIntervalRef.current * 2, 30000);
        pollTimerRef.current = setTimeout(poll, pollIntervalRef.current);
      } catch {
        pollTimerRef.current = setTimeout(poll, pollIntervalRef.current);
      }
    }

    void poll();
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [isSynthesizing]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  return {
    messages,
    status,
    sessionId,
    sessionReady: !!sessionId,
    isSynthesizing,
    synthesisError,
    recommendation,
    initSession,
    resumeSession,
    discardSession,
    sendMessage,
  };
}

// ---------------------------------------------------------------------------
// Incomplete session check — used by the discovery screen on mount to
// show the SessionResumption UI if a previous session is resumable.
// ---------------------------------------------------------------------------

export async function fetchIncompleteSession(): Promise<{
  sessionId:     string;
  questionCount: number;
} | null> {
  try {
    const data = await api<{
      incomplete: { id: string; questionCount: number } | null;
    }>('/api/discovery/sessions/incomplete');
    if (!data.incomplete) return null;
    return {
      sessionId:     data.incomplete.id,
      questionCount: data.incomplete.questionCount,
    };
  } catch {
    return null;
  }
}
