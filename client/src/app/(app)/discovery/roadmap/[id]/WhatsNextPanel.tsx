'use client';
// src/app/(app)/discovery/roadmap/[id]/WhatsNextPanel.tsx

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Loader2, MessageCircle, Send } from 'lucide-react';
import { useContinuationFlow } from './useContinuationFlow';

/**
 * WhatsNextPanel
 *
 * The "What's Next?" surface on the roadmap page. Always visible,
 * always active — never greyed out — per docs/ROADMAP_CONTINUATION.md.
 *
 * Owns three child surfaces:
 *   - The trigger button (idle / checking states)
 *   - The diagnostic chat (Scenario A/B; transcript + input + send)
 *   - The brief-polling status (Scenario C/D or after diagnostic release)
 *
 * Navigates to /discovery/roadmap/[id]/continuation when the brief
 * is ready or already exists. Resets to idle when the founder closes
 * the panel without picking a fork.
 */
export function WhatsNextPanel({ roadmapId }: { roadmapId: string }) {
  const router = useRouter();
  const flow = useContinuationFlow(roadmapId);
  const [draft, setDraft] = useState('');

  // Navigate to the continuation reveal page once the brief lands.
  useEffect(() => {
    if (flow.phase === 'brief_ready') {
      router.push(`/discovery/roadmap/${roadmapId}/continuation`);
    }
  }, [flow.phase, roadmapId, router]);

  const handleSubmit = async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || flow.submitting) return;
    setDraft('');
    await flow.submitDiagnostic(trimmed);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] uppercase tracking-widest text-primary/70">
            Always available
          </p>
          <p className="text-sm font-semibold text-foreground">What&apos;s next?</p>
        </div>
        {flow.phase === 'idle' && (
          <button
            type="button"
            onClick={() => { void flow.startCheckpoint(); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
          >
            <ArrowRight className="size-3.5" />
            Take stock
          </button>
        )}
        {flow.phase === 'checking' && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Reading your progress…
          </span>
        )}
        {flow.phase === 'brief_polling' && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Building your continuation brief…
          </span>
        )}
        {flow.phase === 'brief_ready' && (
          <span className="text-xs text-primary">Opening your brief…</span>
        )}
        {flow.phase === 'fork_selected' && (
          <span className="text-xs text-muted-foreground">Continuation already chosen.</span>
        )}
        {flow.phase === 'error' && (
          <button
            type="button"
            onClick={() => flow.reset()}
            className="text-xs text-red-500 hover:text-red-600"
          >
            Try again
          </button>
        )}
      </div>

      {flow.phase === 'idle' && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Hit this any time. I&apos;ll read your progress and either help unblock you, or tell you what to do next based on what you&apos;ve learned.
        </p>
      )}

      {flow.phase === 'error' && flow.error && (
        <p className="text-[11px] text-red-500 leading-relaxed">{flow.error}</p>
      )}

      <AnimatePresence>
        {flow.phase === 'diagnostic_open' && (
          <motion.div
            key="diagnostic"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-3 overflow-hidden"
          >
            <div className="rounded-lg border border-border bg-background px-3 py-3 flex flex-col gap-2 max-h-80 overflow-y-auto">
              {flow.diagnosticHistory.length === 0 && (
                <p className="text-[11px] text-muted-foreground italic">
                  {flow.scenario === 'A'
                    ? 'You haven\'t started any tasks yet — what\'s in the way? I\'m not here to judge, I\'m here to help you actually move.'
                    : 'You\'ve made real progress and left some tasks. Talk to me about why — there might be a legitimate reason, or there might be something I can help unblock.'}
                </p>
              )}
              {flow.diagnosticHistory.map(entry => (
                <div
                  key={entry.id}
                  className={[
                    'rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap break-words',
                    entry.role === 'founder'
                      ? 'self-end bg-primary/10 text-foreground max-w-[85%]'
                      : 'self-start bg-muted text-foreground/90 max-w-[90%]',
                  ].join(' ')}
                >
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-0.5">
                    {entry.role === 'founder' ? 'You' : 'NeuraLaunch'}
                  </p>
                  {entry.message}
                  {entry.followUpQuestion && (
                    <p className="mt-1.5 pt-1.5 border-t border-foreground/10 text-foreground font-medium">
                      {entry.followUpQuestion}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Type your reply…"
                rows={2}
                disabled={flow.submitting}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground resize-none disabled:opacity-50 outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => flow.reset()}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Close diagnostic
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSubmit(); }}
                  disabled={draft.trim().length === 0 || flow.submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {flow.submitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                  Send
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {flow.phase === 'brief_polling' && (
        <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
          <MessageCircle className="size-3 shrink-0 mt-0.5" />
          The brief takes about 30 seconds. I&apos;m reading every check-in, every blocked task, and your parking lot to write something specific to where you are right now.
        </p>
      )}
    </motion.div>
  );
}
