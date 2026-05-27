'use client';

import { useState, useRef, type FormEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageList, type ChatMessage } from '@/components/discovery/MessageList';
import { OpportunityInventoryCanvas } from '@/components/ideation/stage4/OpportunityInventoryCanvas';
import { StageBanner } from '@/components/institute';
import { useStage4Session, type Stage4Message } from './useStage4Session';
import type { Stage4AuthoringState } from '@/lib/ideation/stage4-opportunities/schema';

interface Stage4ChatProps {
  sessionId:       string;
  stageRunId:      string;
  firstName:       string;
  initialMessages: Stage4Message[];
  state:           Stage4AuthoringState;
}

/**
 * Stage 4 chat surface. Composes OpportunityInventoryCanvas (left)
 * + chat (right) with the dismissable Stage 4 banner above — same
 * shape as Stage3Chat. Every canvas action funnels through
 * useStage4Session which hits the narrow API routes and refreshes
 * the page on success.
 */
export function Stage4Chat({
  sessionId,
  stageRunId,
  firstName,
  initialMessages,
  state,
}: Stage4ChatProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const session = useStage4Session({ sessionId, stageRunId, initialMessages });

  const chatMessages: ChatMessage[] = session.messages.map(m => ({
    id:          m.id,
    role:        m.role,
    content:     m.content,
    inputMethod: m.inputMethod,
  }));

  const isBusy =
    session.status === 'sending' || session.status === 'streaming' ||
    session.status === 'composing' || session.status === 'deriving' ||
    session.status === 'generating' || session.status === 'submitting';
  const isTerminated = session.status === 'terminated';
  const canSubmit = !isBusy && !isTerminated && input.trim().length > 0;
  const hasMessages = session.messages.length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const content = input.trim();
    setInput('');
    void session.sendMessage(content);
  };

  return (
    <div className="flex flex-col h-full">
      <StageBanner
        sessionId={sessionId}
        stage={4}
        totalStages={5}
        title="Opportunity Evaluation"
        body={STAGE4_BANNER_BODY}
        forceVisible={!hasMessages}
      />

      {session.turnError && (
        <div className="border-b border-destructive/40 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <div className="mx-auto max-w-5xl">{session.turnError.message}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-5 gap-6">
          <section className="lg:col-span-3">
            {!hasMessages && (
              <p className="text-sm text-muted-foreground mb-3">
                {firstName ? `${firstName}, let's see what holds up.` : 'Let’s see what holds up.'}
              </p>
            )}
            <OpportunityInventoryCanvas
              state={state}
              readOnly={isTerminated}
              deriveLayerA={session.deriveLayerA}
              generateScript={session.generateScript}
              submitText={session.submitText}
              presign={session.presign}
              submitImage={session.submitImage}
              removeResponse={session.removeResponse}
              pickVerdict={session.pickVerdict}
              pushback={session.pushback}
              derivingFor={session.derivingFor}
              generatingFor={session.generatingFor}
            />
          </section>

          <section className="lg:col-span-2 flex flex-col min-h-[400px] rounded-lg border border-border bg-card/30">
            {hasMessages ? (
              <div className="flex-1 overflow-y-auto">
                <MessageList
                  messages={chatMessages}
                  isLoading={session.status === 'sending'}
                  isSynthesizing={session.status === 'composing'}
                />
              </div>
            ) : (
              <div className="flex-1 px-4 py-4 text-xs text-muted-foreground">
                Talk to me here about what you&apos;re finding. I&apos;ll probe gaps, ground over-confidence, recommend specific real-world actions, and tell you when you have enough to compose.
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
          placeholder={isTerminated ? 'Session ended.' : 'Tell me what’s coming back from the communities.'}
          maxRows={5}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-2"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit) {
                const content = input.trim();
                setInput('');
                void session.sendMessage(content);
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

const STAGE4_BANNER_BODY = (
  <>
    Time to put your shortlisted pain points to the <em>test.</em> For each opportunity, I&apos;ll research four dimensions (market reality, customer access, willingness to pay, market size) — that&apos;s Layer A. Then you post a test script on your own accounts and bring back what real people say — that&apos;s Layer B. Both layers feed a verdict you can push back on. I&apos;ll advance the strongest one to Stage 5.
  </>
);

