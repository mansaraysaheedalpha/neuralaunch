'use client';
// src/app/(app)/discovery/roadmap/[id]/WhatsNextPanel.tsx

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Loader2, MessageCircle, Send, Compass } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
// Import directly from the schema file — NOT the barrel index.
// The barrel re-exports server-only modules (brief-generator,
// diagnostic-engine, evidence-loader, etc.) which webpack traces
// transitively and rejects in client components.
import { INCONCLUSIVE_RESOLUTION_OPTIONS } from '@/lib/continuation/diagnostic-schema';
import { useContinuationFlow } from './useContinuationFlow';
import { useRoadmapWritability, readOnlyMessage } from './RoadmapWritabilityContext';

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
  const { writable, readOnlyReason } = useRoadmapWritability();
  const readOnlyTip = readOnlyMessage(readOnlyReason);

  // Navigate to the continuation reveal page once the brief lands.
  useEffect(() => {
    if (flow.phase === 'brief_ready') {
      router.push(`/discovery/roadmap/${roadmapId}/continuation`);
    }
  }, [flow.phase, roadmapId, router]);

  const handleSubmit = async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || flow.submitting) return;
    // Preserve the draft until the server has accepted the message —
    // a transient network error must not vaporise the founder's text.
    const ok = await flow.submitDiagnostic(trimmed);
    if (ok) setDraft('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-primary/25 bg-primary/[0.04] px-5 py-5 flex flex-col gap-3"
    >
      {/* Icon-tile + stacked-content composition matching the design
          tool. Compass tile anchors the section as a "moment," eyebrow
          + state-aware headline + supporting body stack on the right.
          The action sits in the top-right of the row. The headline
          changes per flow.phase so the surface tells the founder WHAT
          it'll do at this moment, not just that it exists. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 size-9 rounded-lg border border-primary/30 bg-primary/10 text-primary flex items-center justify-center">
            <Compass className="size-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
              What&apos;s next?
            </p>
            <p className="text-base font-semibold text-foreground leading-snug">
              {flow.phase === 'idle' && writable && 'Take stock when you’re ready'}
              {flow.phase === 'idle' && !writable && 'Take stock paused'}
              {flow.phase === 'checking' && 'Reading your progress…'}
              {flow.phase === 'brief_polling' && 'Building your continuation brief…'}
              {flow.phase === 'brief_ready' && 'Your brief is ready'}
              {flow.phase === 'fork_selected' && 'Continuation already chosen'}
              {flow.phase === 'error' && 'Something went wrong'}
              {flow.phase === 'diagnostic_open' && 'Diagnostic in progress'}
            </p>
            {flow.phase === 'idle' && writable && (
              <p className="text-[13px] text-muted-foreground leading-[1.55] mt-1">
                Hit this any time. I&apos;ll read your progress and either help unblock you, or tell you what to do next based on what you&apos;ve learned.
              </p>
            )}
            {flow.phase === 'idle' && !writable && (
              <p className="text-[13px] text-muted-foreground leading-[1.55] mt-1">
                {readOnlyTip ?? 'Resume the venture from the Sessions tab to take stock of progress.'}
              </p>
            )}
            {flow.phase === 'error' && flow.error && (
              <p className="text-[13px] text-red-400 leading-[1.55] mt-1">{flow.error}</p>
            )}
          </div>
        </div>

        {/* Right-side action / status. Single primary button when idle,
            inline spinner when in flight, retry link on error. */}
        <div className="shrink-0 sm:pt-1 ml-12 sm:ml-0">
          {flow.phase === 'idle' && (
            <button
              type="button"
              onClick={() => { if (writable) void flow.startCheckpoint(); }}
              disabled={!writable}
              title={!writable ? (readOnlyTip ?? undefined) : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground/85 transition-colors ${writable ? 'hover:bg-primary/15 hover:text-foreground cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            >
              <ArrowRight className="size-3.5 text-primary" />
              Take stock
            </button>
          )}
          {(flow.phase === 'checking' || flow.phase === 'brief_polling') && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          {flow.phase === 'error' && (
            <button
              type="button"
              onClick={() => flow.reset()}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Try again
            </button>
          )}
        </div>
      </div>

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

            {/* A1: when the last agent turn has verdict 'inconclusive',
                show the three resolution options instead of the chat
                input. The founder picks one and we either route to a
                verdict or close gracefully. */}
            {(() => {
              const lastAgent = [...flow.diagnosticHistory].reverse().find(e => e.role === 'agent');
              const isInconclusive = lastAgent?.verdict === 'inconclusive';
              if (isInconclusive) {
                return (
                  <div className="flex flex-col gap-2">
                    <p className="text-[11px] text-foreground/90 font-medium">
                      What would you like to do?
                    </p>
                    {INCONCLUSIVE_RESOLUTION_OPTIONS.map((option, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={flow.submitting}
                        onClick={() => {
                          if (option.verdict === null) {
                            // "I need to step away" — close gracefully,
                            // preserve transcript, no brief generated.
                            flow.reset();
                          } else {
                            // Route the chosen verdict back through the
                            // diagnostic submit path. The server processes
                            // the verdict through nextStatusForVerdict.
                            void flow.submitDiagnostic(option.label);
                          }
                        }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-left text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                );
              }
              return (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Type your reply…"
                    rows={2}
                    disabled={flow.submitting}
                    className="min-h-0 resize-none py-2 text-xs"
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
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {flow.phase === 'brief_polling' && (
        <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
          <MessageCircle className="size-3 shrink-0 mt-0.5" />
          I&apos;m reading every check-in, every blocked task, and your parking lot to write something specific to where you are right now.
        </p>
      )}
    </motion.div>
  );
}
