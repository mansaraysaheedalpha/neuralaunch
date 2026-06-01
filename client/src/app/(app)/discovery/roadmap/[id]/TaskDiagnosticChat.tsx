'use client';
// src/app/(app)/discovery/roadmap/[id]/TaskDiagnosticChat.tsx
//
// A6: inline chat surface for the task-level diagnostic. Mounted by
// InteractiveTaskCard when the founder clicks "Get help with this
// task". Each turn POSTs to the task diagnostic route and appends
// the exchange to local state. 10-turn limit with the same
// inconclusive pattern from A1 at the cap.

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Send, HelpCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface DiagnosticExchange {
  id:      string;
  founder: string;
  agent:   string;
  followUp?: string | null;
}

export interface TaskDiagnosticChatProps {
  roadmapId: string;
  taskId:    string;
  open:      boolean;
  onClose:   () => void;
}

/**
 * TaskDiagnosticChat — self-contained chat surface for the A6
 * task-level diagnostic. Owns its own conversation state, submission
 * logic, and rendering. The parent InteractiveTaskCard only needs to
 * pass the IDs and toggle visibility.
 *
 * The diagnostic history is persisted server-side inside the task's
 * checkInHistory array (tagged with source: 'task_diagnostic').
 * This component does NOT need to load prior history on mount — it
 * starts fresh each time the founder opens it. Prior diagnostic
 * entries are visible in the check-in history list alongside
 * regular check-ins.
 */
export function TaskDiagnosticChat({
  roadmapId,
  taskId,
  open,
  onClose,
}: TaskDiagnosticChatProps) {
  const [exchanges, setExchanges] = useState<DiagnosticExchange[]>([]);
  const [draft, setDraft]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [resolved, setResolved]   = useState(false);
  const [escalate, setEscalate]   = useState(false);
  const [inconclusive, setInconclusive] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/diagnostic`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ message: trimmed }),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setError(json.error ?? 'Could not send. Please try again.');
        return;
      }
      const json = await res.json() as {
        entry:        { id: string; agentResponse: string };
        verdict?:     string;
        followUp?:    string | null;
        escalate?:    boolean;
        inconclusive?: boolean;
        synthesis?:   string;
      };
      setDraft('');
      if (json.inconclusive) {
        setInconclusive(json.synthesis ?? json.entry.agentResponse);
        return;
      }
      setExchanges(prev => [...prev, {
        id:       json.entry.id,
        founder:  trimmed,
        agent:    json.entry.agentResponse,
        followUp: json.followUp,
      }]);
      if (json.verdict === 'resolved') setResolved(true);
      if (json.escalate) setEscalate(true);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [draft, submitting, roadmapId, taskId]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-3 border-t border-rule pt-4">
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              <HelpCircle aria-hidden="true" className="size-3" />
              Task help · diagnostic
            </p>

            <div className="flex max-h-60 flex-col gap-3 overflow-y-auto border border-rule bg-bg px-4 py-3">
              {exchanges.length === 0 && !inconclusive && (
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  Tell us what you need help with on this task.
                </p>
              )}
              {exchanges.map(ex => (
                <div key={ex.id} className="flex flex-col gap-1.5">
                  <div className="max-w-[85%] self-end border-l-2 border-accent bg-bg-2 px-3 py-2 text-[13px] leading-[1.55] text-fg break-words">
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">You</p>
                    {ex.founder}
                  </div>
                  <div className="max-w-[90%] self-start border-l-2 border-rule-strong bg-bg-2 px-3 py-2 text-[13px] leading-[1.55] text-fg break-words whitespace-pre-wrap">
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-2">NeuraLaunch</p>
                    {ex.agent}
                    {ex.followUp && (
                      <p className="mt-2 border-t border-rule pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                        {ex.followUp}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {inconclusive && (
                <div className="border-l-2 border-accent bg-bg-2 px-3 py-2 text-[13px] leading-[1.55] text-fg whitespace-pre-wrap">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">Summary</p>
                  {inconclusive}
                </div>
              )}
            </div>

            {resolved && (
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-success">
                Resolved · close this panel whenever you&rsquo;re ready.
              </p>
            )}
            {escalate && (
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                Roadmap-level concern · try &ldquo;What&rsquo;s Next?&rdquo; to evaluate overall progress.
              </p>
            )}

            {error && (
              <p className="border-l-2 border-amber bg-bg-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
                {error}
              </p>
            )}

            {!resolved && !escalate && !inconclusive && (
              <div className="flex gap-2">
                <Textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  placeholder="What do you need help with?"
                  disabled={submitting}
                  rows={3}
                  className="min-h-0 flex-1 resize-none rounded-none border border-rule bg-bg py-2 text-[14px] text-fg placeholder:text-muted focus-visible:border-accent focus-visible:ring-0"
                />
                <button
                  type="button"
                  onClick={() => { void handleSend(); }}
                  disabled={draft.trim().length === 0 || submitting}
                  className="inline-flex shrink-0 items-center gap-2 bg-accent px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
                >
                  {submitting
                    ? <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                    : <Send aria-hidden="true" className="size-3" />}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="self-start font-mono text-[10px] uppercase tracking-[0.14em] text-muted underline underline-offset-2 transition-colors hover:text-fg"
            >
              Close help
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
