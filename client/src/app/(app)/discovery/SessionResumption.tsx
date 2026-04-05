'use client';
// src/app/(app)/discovery/SessionResumption.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { DiscoveryChat } from '@/components/discovery';
import type { Recommendation } from '@/lib/discovery/client';
import type { ChatMessage } from '@/components/discovery/MessageList';

interface IncompleteSession {
  id:            string;
  questionCount: number;
  conversationId: string | null;
}

interface ResumeData {
  messages:       { role: string; content: string }[];
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
 * Shown when the user returns to /discovery with an incomplete session.
 * Offers to continue from where they left off or start fresh.
 * On resume: fetches conversation history and hands off to DiscoveryChat
 * with the existing sessionId and pre-loaded messages.
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
        id:      crypto.randomUUID(),
        role:    m.role as 'user' | 'assistant',
        content: m.content,
      }));

    return (
      <DiscoveryChat
        firstName={firstName}
        onComplete={handleComplete}
        resume={{ sessionId: session.id, conversationId: resumeData.conversationId, messages: priorMessages }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full max-w-md mx-auto px-6 gap-6 text-center"
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-foreground">Your session was paused</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          You were partway through your discovery interview.
          {session.questionCount > 0 && ` You had answered ${session.questionCount} question${session.questionCount !== 1 ? 's' : ''}.`}
          {' '}Pick up where you left off — everything is still here.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={() => { void handleResume(); }}
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {loading ? 'Loading your session…' : 'Continue where you left off'}
        </button>
        <button
          onClick={() => { void handleStartFresh(); }}
          disabled={discarding}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-60 transition-colors"
        >
          Start a new session
        </button>
      </div>
    </motion.div>
  );
}
