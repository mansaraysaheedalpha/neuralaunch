'use client';
// src/app/(app)/discovery/SessionResumption.tsx
//
// Shown when the founder returns to /discovery with an incomplete
// standard-archetype session. Renders an Institute-styled picker
// card; on "continue" hydrates the prior turns into StandardChat
// (the Institute interview shell), on "start fresh" deletes the
// paused session and lets the page re-render.
//
// Pre-PR-16 this surface handed off to the legacy DiscoveryChat
// bubble UI, which jarringly broke design continuity mid-interview.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StandardChat } from '@/components/discovery/standard/StandardChat';
import type { ChatMessage } from '@/components/discovery/message-types';
import type { Recommendation } from '@/lib/discovery/client';

interface IncompleteSession {
  id:            string;
  questionCount: number;
  conversationId: string | null;
}

interface ResumeData {
  messages:       { role: string; content: string; inputMethod?: string | null }[];
  questionCount:  number;
  conversationId: string | null;
}

interface Props {
  session:   IncompleteSession;
  firstName: string;
}

/**
 * SessionResumption
 *
 * Picker for a paused standard discovery session. The card renders
 * in the Institute palette (hairline mono eyebrow, serif italic
 * heading, accent CTA, ghost secondary). After "continue", the
 * resumed turns hydrate StandardChat via the new `resume` prop so
 * the chrome stays consistent.
 */
export function SessionResumption({ session, firstName }: Props) {
  const router  = useRouter();
  const [loading,   setLoading]   = useState(false);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [discarding, setDiscarding] = useState(false);

  const handleComplete = (rec: Recommendation, convId: string) => {
    const dest = convId ? `/discovery/recommendation?from=${convId}` : '/discovery/recommendation';
    router.push(dest);
    void rec;
  };

  async function handleResume() {
    setLoading(true);
    try {
      const res = await fetch(`/api/discovery/sessions/${session.id}/resume`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as ResumeData;
      setResumeData(data);
    } catch {
      setLoading(false);
    }
  }

  async function handleStartFresh() {
    setDiscarding(true);
    try {
      await fetch(`/api/discovery/sessions/${session.id}`, { method: 'DELETE' }).catch(() => null);
    } finally {
      router.refresh();
    }
  }

  if (resumeData) {
    const priorMessages: ChatMessage[] = resumeData.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        id:          crypto.randomUUID(),
        role:        m.role as 'user' | 'assistant',
        content:     m.content,
        inputMethod: m.inputMethod === 'voice' ? 'voice' : null,
      }));

    return (
      <StandardChat
        firstName={firstName}
        isFirstSession={false}
        archetypeLabel="Standard"
        onComplete={handleComplete}
        resume={{
          sessionId:      session.id,
          conversationId: resumeData.conversationId,
          messages:       priorMessages,
        }}
      />
    );
  }

  const answered = session.questionCount;
  const answeredCopy = answered > 0
    ? `${answered} answer${answered !== 1 ? 's' : ''} captured`
    : 'paused mid-interview';

  return (
    <section className="mx-auto flex h-full max-w-[640px] flex-col justify-center px-6 py-16">
      <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        Discovery · session paused
      </div>
      <h2 className="mb-5 font-sans text-fg [font-size:clamp(32px,4vw,52px)] [font-weight:500] [line-height:1.02] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
        Pick up <em>where you stopped.</em>
      </h2>
      <p className="mb-8 max-w-[520px] text-[15px] leading-[1.6] text-fg-2">
        You were partway through your discovery interview — {answeredCopy}.
        Everything is still here. Continue from the next question, or start a new session.
      </p>

      <div className="flex flex-wrap items-start gap-3.5">
        <button
          type="button"
          onClick={() => { void handleResume(); }}
          disabled={loading}
          className="inline-flex items-center gap-3 bg-accent px-6 py-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
        >
          {loading ? 'Loading your session…' : 'Continue where you left off'}
          {!loading && <span aria-hidden="true">→</span>}
        </button>
        <button
          type="button"
          onClick={() => { void handleStartFresh(); }}
          disabled={discarding}
          className="border border-rule-strong px-6 py-4 font-mono text-[11px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Start a new session
        </button>
      </div>
    </section>
  );
}
