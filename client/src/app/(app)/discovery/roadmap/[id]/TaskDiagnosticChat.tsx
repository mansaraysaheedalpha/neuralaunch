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
          <div className="flex flex-col gap-2 pt-2 border-t border-primary/20">
            <p className="text-[10px] uppercase tracking-widest text-primary/70 flex items-center gap-1">
              <HelpCircle className="size-3" />
              Task help
            </p>

            <div className="rounded-lg border border-border bg-background px-3 py-3 flex flex-col gap-2 max-h-60 overflow-y-auto">
              {exchanges.length === 0 && !inconclusive && (
                <p className="text-[11px] text-muted-foreground italic">
                  Tell me what you need help with on this task.
                </p>
              )}
              {exchanges.map(ex => (
                <div key={ex.id} className="flex flex-col gap-1">
                  <div className="self-end rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] text-foreground max-w-[85%] break-words">
                    {ex.founder}
                  </div>
                  <div className="self-start rounded-lg bg-muted px-2.5 py-1.5 text-[11px] text-foreground/90 max-w-[90%] break-words whitespace-pre-wrap">
                    {ex.agent}
                    {ex.followUp && (
                      <p className="mt-1.5 pt-1.5 border-t border-foreground/10 font-medium">
                        {ex.followUp}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {inconclusive && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-foreground/90 whitespace-pre-wrap">
                  <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 mb-1">Summary</p>
                  {inconclusive}
                </div>
              )}
            </div>

            {resolved && (
              <p className="text-[11px] text-green-600 dark:text-green-400 font-medium">
                Glad I could help. Close this panel whenever you are ready.
              </p>
            )}
            {escalate && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                This looks like a roadmap-level concern. Try hitting &quot;What&apos;s Next?&quot; to evaluate your overall progress.
              </p>
            )}

            {error && (
              <p className="text-[11px] text-red-500">{error}</p>
            )}

            {!resolved && !escalate && !inconclusive && (
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  placeholder="What do you need help with?"
                  disabled={submitting}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-50 outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => { void handleSend(); }}
                  disabled={draft.trim().length === 0 || submitting}
                  className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="self-start text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              Close help
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
