'use client';

import { useState, useRef, type FormEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageList, type ChatMessage } from '@/components/discovery/MessageList';
import { PainInventoryCanvas } from '@/components/ideation/stage3/PainInventoryCanvas';
import { StageBanner } from '@/components/institute';
import { useStage3Session, type Stage3Message } from './useStage3Session';
import type { Stage3AuthoringState } from '@/lib/ideation/stage3-opportunities/schema';

interface Stage3ChatProps {
  sessionId:       string;
  stageRunId:      string;
  firstName:       string;
  initialMessages: Stage3Message[];
  state:           Stage3AuthoringState;
}

/**
 * Stage 3 chat surface. Composes PainInventoryCanvas (left) + chat
 * (right) with the dismissable Stage 3 banner above — same shape as
 * Stage2Chat. Every canvas action funnels through useStage3Session
 * which hits the narrow API routes and refreshes the page on success.
 */
export function Stage3Chat({
  sessionId,
  stageRunId,
  firstName,
  initialMessages,
  state,
}: Stage3ChatProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    status,
    turnError,
    sendMessage,
    runPainScout,
    addFounderPainPoint,
    scorePainPoint,
    removePainPoint,
    runPushbackRound,
  } = useStage3Session({ sessionId, stageRunId, initialMessages });

  const chatMessages: ChatMessage[] = messages.map(m => ({
    id:          m.id,
    role:        m.role,
    content:     m.content,
    inputMethod: m.inputMethod,
  }));

  const isBusy =
    status === 'sending' || status === 'streaming' ||
    status === 'composing' || status === 'scouting';
  const isTerminated = status === 'terminated';
  const canSubmit = !isBusy && !isTerminated && input.trim().length > 0;
  const hasMessages = messages.length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const content = input.trim();
    setInput('');
    void sendMessage(content);
  };

  return (
    <div className="flex flex-col h-full">
      <StageBanner
        sessionId={sessionId}
        stage={3}
        totalStages={5}
        title="Opportunity Identification"
        body={STAGE3_BANNER_BODY}
        forceVisible={!hasMessages}
      />

      {turnError && (
        <div className="border-b border-destructive/40 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <div className="mx-auto max-w-5xl">{turnError.message}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-5 gap-6">
          <section className="lg:col-span-3">
            {!hasMessages && (
              <p className="text-sm text-muted-foreground mb-3">
                {firstName ? `${firstName}, this is where we look for pain worth solving.` : 'This is where we look for pain worth solving.'}
              </p>
            )}
            <PainInventoryCanvas
              state={state}
              scouting={status === 'scouting'}
              readOnly={isTerminated}
              onScout={runPainScout}
              onAddFounderPP={addFounderPainPoint}
              onScore={scorePainPoint}
              onRemove={removePainPoint}
              onPushback={runPushbackRound}
            />
          </section>

          <section className="lg:col-span-2 flex flex-col min-h-[400px] rounded-lg border border-border bg-card/30">
            {hasMessages ? (
              <div className="flex-1 overflow-y-auto">
                <MessageList
                  messages={chatMessages}
                  isLoading={status === 'sending'}
                  isSynthesizing={status === 'composing'}
                />
              </div>
            ) : (
              <div className="flex-1 px-4 py-4 text-xs text-muted-foreground">
                Talk to me here. I&apos;ll probe vague pain points, ground over-stated ones, recommend real-world actions, and tell you when you have enough to compose the shortlist.
              </div>
            )}
          </section>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 items-end border-t border-border bg-background px-4 py-3"
      >
        <TextareaAutosize
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={isBusy || isTerminated}
          placeholder={isTerminated ? 'Session ended.' : 'Tell me what hurts — yours or theirs.'}
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

const STAGE3_BANNER_BODY = (
  <>
    Time to find <em>real pain worth solving.</em> Add pain points you&apos;ve hit yourself, lived with through someone close, or watched an industry struggle with — your own life is the strongest signal. The Pain Scout will surface community signals you might not have seen; treat its picks as a check on yourself, not the answer. Rate what survives on intensity, frequency, and niche specificity. I&apos;ll shortlist up to five for Stage 4.
  </>
);

