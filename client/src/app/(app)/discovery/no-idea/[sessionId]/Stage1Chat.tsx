'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageList } from '@/components/discovery/MessageList';
import type { ChatMessage } from '@/components/discovery/MessageList';
import { Stage1Banner } from './Stage1Banner';
import { useStage1Session, type Stage1Message } from './useStage1Session';

interface Stage1ChatProps {
  sessionId:        string;
  /**
   * Accepted but unused. The opening probe endpoint pulls the
   * founder's first name server-side from the authenticated User row,
   * so subsequent client-side turns no longer need it. The prop is
   * preserved on the interface so existing callers (page.tsx, the
   * documentLoadError branch) keep compiling while a follow-up polish
   * pass cleans the threading up properly.
   */
  firstName?:       string;
  initialMessages:  Stage1Message[];
  editingDimension: 'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference' | null;
  hasPriorSnapshot: boolean;
  /**
   * The active IdeationStageRun id. Required for the in-chat
   * "Discard edit" affordance when hasPriorSnapshot is true — the
   * button POSTs to /api/ideation/stage-runs/[stageRunId]/discard-edit
   * and the page server-component re-renders the review surface.
   * Optional on the interface so the documentLoadError fallback
   * branch (which has no real stage run to talk about) still
   * compiles.
   */
  stageRunId?:      string;
  documentLoadError?: boolean;
}

/**
 * Stage 1 chat surface. Slimmer than the Discovery DiscoveryChat —
 * no audience-specific copy, no stepper, no welcome layer, no guide
 * pulse. Banner + message list + input.
 *
 * The founder's first name is no longer threaded through here — the
 * dedicated /stage1-opening endpoint pulls it server-side from the
 * authenticated User row so the agent can fold it into the opening
 * probe naturally. Subsequent turns don't need it.
 */
export function Stage1Chat({
  sessionId,
  firstName: _firstName,
  initialMessages,
  editingDimension,
  hasPriorSnapshot,
  stageRunId,
  documentLoadError,
}: Stage1ChatProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openingFiredRef = useRef(false);
  const editProbeFiredRef = useRef(false);
  const [discardBusy, startDiscard] = useTransition();
  const [discardError, setDiscardError] = useState<string | null>(null);

  const { messages, status, turnError, sendMessage, requestOpening, requestEditProbe } = useStage1Session({
    sessionId,
    initialMessages,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fire the opening probe ONCE on mount when the conversation is
  // genuinely empty AND the founder is NOT in edit mode. The server-
  // side route enforces the pristine-state check authoritatively
  // (409 on re-fire); this ref is just a UX guard against React 18
  // StrictMode double-invocation in dev.
  useEffect(() => {
    if (openingFiredRef.current)    return;
    if (initialMessages.length > 0) return;
    if (editingDimension !== null)  return;
    if (status !== 'idle')          return;
    openingFiredRef.current = true;
    void requestOpening();
  }, [initialMessages.length, editingDimension, status, requestOpening]);

  // Fire the edit probe ONCE per mount when the founder lands in
  // edit mode. Mutually exclusive with the opening effect via the
  // `editingDimension` polarity — that effect early-returns when
  // editing, this one fires only when editing. The server-side
  // /stage1-edit-probe route is authoritative on the re-fire guard
  // (409 if an assistant message already exists with createdAt >
  // editStartedAt). This ref protects against StrictMode double-
  // invocation in dev.
  useEffect(() => {
    if (editProbeFiredRef.current) return;
    if (editingDimension === null) return;
    if (status !== 'idle')         return;
    editProbeFiredRef.current = true;
    void requestEditProbe();
  }, [editingDimension, status, requestEditProbe]);

  const isBusy = status === 'sending' || status === 'streaming' || status === 'composing';
  const isTerminated = status === 'terminated';
  const canSubmit = !isBusy && !isTerminated && input.trim().length > 0;

  const chatMessages: ChatMessage[] = messages.map(m => ({
    id:          m.id,
    role:        m.role,
    content:     m.content,
    inputMethod: m.inputMethod,
  }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const content = input.trim();
    setInput('');
    void sendMessage(content);
  };

  const handleDiscard = () => {
    if (!stageRunId || !hasPriorSnapshot) return;
    startDiscard(async () => {
      setDiscardError(null);
      try {
        const res = await fetch(`/api/ideation/stage-runs/${stageRunId}/discard-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          setDiscardError(data.error ?? `Could not discard (HTTP ${res.status})`);
          return;
        }
        // router.refresh re-evaluates the page server component;
        // the restored row goes back to output_ready/committed and
        // OutcomeDocumentView renders instead of this chat.
        router.refresh();
      } catch (err) {
        setDiscardError(err instanceof Error ? err.message : 'Discard failed');
      }
    });
  };

  // Edit-mode strip — when reverting from output_ready/committed, the
  // founder sees a clear cue that they're editing one dimension AND
  // an actual Discard button (vs. the previous "go back to the review
  // page" prose, which was misleading because the founder is in chat,
  // not on the review page).
  const editBanner = editingDimension ? (
    <div className="border-b border-gold/40 bg-gold/5 px-4 py-2">
      <div className="mx-auto max-w-2xl flex items-center justify-between gap-3 text-xs">
        <span className="text-gold font-medium">
          Editing: {DIM_LABELS[editingDimension]}
        </span>
        {hasPriorSnapshot && stageRunId && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleDiscard}
            disabled={discardBusy}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3 mr-1" />
            {discardBusy ? 'Discarding…' : 'Discard edit'}
          </Button>
        )}
      </div>
      {discardError && (
        <div className="mx-auto max-w-2xl mt-1 text-xs text-destructive">{discardError}</div>
      )}
    </div>
  ) : null;

  const composingBanner = status === 'composing' ? (
    <div className="border-b border-primary/30 bg-primary/5 px-4 py-2 text-xs text-primary">
      <div className="mx-auto max-w-2xl">Drafting your Outcome Document…</div>
    </div>
  ) : null;

  const errorBanner = turnError ? (
    <div className="border-b border-destructive/40 bg-destructive/5 px-4 py-2 text-xs text-destructive">
      <div className="mx-auto max-w-2xl">{turnError.message}</div>
    </div>
  ) : null;

  const recoveryBanner = documentLoadError ? (
    <div className="border-b border-destructive/40 bg-destructive/5 px-4 py-2 text-xs text-destructive">
      <div className="mx-auto max-w-2xl">
        We couldn&apos;t load the previous Outcome Document. Continue the conversation and
        we&apos;ll draft it again.
      </div>
    </div>
  ) : null;

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full">
      <Stage1Banner sessionId={sessionId} forceVisible={!hasMessages} />
      {editBanner}
      {composingBanner}
      {errorBanner}
      {recoveryBanner}

      {(hasMessages || status === 'sending' || status === 'streaming') ? (
        <MessageList
          messages={chatMessages}
          isLoading={status === 'sending'}
          isSynthesizing={false}
        />
      ) : (
        // Pre-opening state — extremely brief. The opening probe fires
        // automatically on mount (see useEffect above) and arrives in
        // under a few seconds, at which point the MessageList branch
        // takes over. Anything more substantive here would compete
        // with the agent's first message.
        <div className="flex-1" aria-hidden="true" />
      )}

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 items-end border-t border-border bg-background px-4 py-3"
      >
        <TextareaAutosize
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isBusy || isTerminated}
          placeholder={isTerminated ? 'Session ended.' : 'Share your thoughts…'}
          maxRows={5}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-2"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) {
                const content = input.trim();
                setInput('');
                void sendMessage(content);
              }
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!canSubmit}
          variant="ghost"
          className={canSubmit ? 'text-primary hover:bg-primary/10 hover:text-primary' : undefined}
        >
          <SendHorizontal className="size-4" />
        </Button>
      </form>
    </div>
  );
}

const DIM_LABELS = {
  timeHorizon:         'Time horizon',
  financialGoal:       'Financial goal',
  riskTolerance:       'Risk tolerance',
  lifestylePreference: 'Lifestyle preference',
} as const;

