'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageList } from '@/components/discovery/MessageList';
import type { ChatMessage } from '@/components/discovery/MessageList';
import { Stage1Banner } from './Stage1Banner';
import { useStage1Session, type Stage1Message } from './useStage1Session';

interface Stage1ChatProps {
  sessionId:        string;
  initialMessages:  Stage1Message[];
  editingDimension: 'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference' | null;
  hasPriorSnapshot: boolean;
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
  initialMessages,
  editingDimension,
  hasPriorSnapshot,
  documentLoadError,
}: Stage1ChatProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openingFiredRef = useRef(false);

  const { messages, status, turnError, sendMessage, requestOpening } = useStage1Session({
    sessionId,
    initialMessages,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fire the opening probe ONCE on mount when the conversation is
  // genuinely empty. The server-side route enforces the pristine-state
  // check authoritatively (409 on re-fire); this ref is just a UX
  // guard against React 18 StrictMode double-invocation in dev.
  useEffect(() => {
    if (openingFiredRef.current) return;
    if (initialMessages.length > 0)       return;
    if (editingDimension !== null)        return;
    if (status !== 'idle')                return;
    openingFiredRef.current = true;
    void requestOpening();
  }, [initialMessages.length, editingDimension, status, requestOpening]);

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

  // Edit-mode strip — when reverting from output_ready/committed, the
  // founder sees a clear cue that they're editing one dimension. The
  // discard-edit affordance lives on the review surface where the
  // stageRunId is in scope; here we just signal the edit context.
  const editBanner = editingDimension ? (
    <div className="border-b border-gold/40 bg-gold/5 px-4 py-2">
      <div className="mx-auto max-w-2xl flex items-center gap-3 text-xs">
        <span className="text-gold font-medium">
          Editing: {DIM_LABELS[editingDimension]}
        </span>
        {hasPriorSnapshot && (
          <span className="text-muted-foreground">
            You can discard this edit and restore the prior document from the review page.
          </span>
        )}
      </div>
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

