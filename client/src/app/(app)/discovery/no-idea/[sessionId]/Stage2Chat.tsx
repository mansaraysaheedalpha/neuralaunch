'use client';

import { useState, useRef, type FormEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageList, type ChatMessage } from '@/components/discovery/MessageList';
import { SkillCanvas } from '@/components/ideation/SkillCanvas';
import { SkillCanvasEntry, type SkillCanvasEntryMode } from '@/components/ideation/SkillCanvasEntry';
import { Stage2Banner } from './Stage2Banner';
import { useStage2Session, type Stage2Message } from './useStage2Session';
import type { SkillInventory } from '@/lib/ideation';

interface Stage2ChatProps {
  sessionId:       string;
  stageRunId:      string;
  firstName:       string;
  initialMessages: Stage2Message[];
  inventory:       SkillInventory;
  hasExpectedProfile: boolean;
  requiresRederivation: boolean;
}

/**
 * Stage 2 chat surface. Composes SkillCanvas (left) + chat (right)
 * with the dismissable Stage 2 banner above. On the first turn —
 * no messages, empty inventory — shows the SkillCanvasEntry mode
 * picker instead of the canvas. After the founder picks a mode the
 * canvas takes over.
 */
export function Stage2Chat({
  sessionId,
  stageRunId,
  firstName,
  initialMessages,
  inventory,
  hasExpectedProfile,
  requiresRederivation,
}: Stage2ChatProps) {
  const [mode, setMode] = useState<SkillCanvasEntryMode | null>(
    initialMessages.length > 0 || hasInventoryContent(inventory)
      ? 'canvas'  // resumed session — skip the picker
      : null,
  );
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    status,
    turnError,
    sendMessage,
    updateSkillTier,
    addTeammate,
    removeTeammate,
    deriveExpectedProfile,
  } = useStage2Session({ sessionId, stageRunId, initialMessages });

  const chatMessages: ChatMessage[] = messages.map(m => ({
    id:          m.id,
    role:        m.role,
    content:     m.content,
    inputMethod: m.inputMethod,
  }));

  const isBusy = status === 'sending' || status === 'streaming' || status === 'composing';
  const isTerminated = status === 'terminated';
  const canSubmit = !isBusy && !isTerminated && input.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const content = input.trim();
    setInput('');
    void sendMessage(content);
  };

  // Mode picker — first-turn empty state
  if (mode === null) {
    return (
      <div className="flex flex-col h-full">
        <Stage2Banner sessionId={sessionId} forceVisible />
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="text-sm text-muted-foreground">
              {firstName ? `${firstName}, here's the picture.` : 'Here\'s the picture.'} You committed an Outcome Document in Stage 1. Now we figure out the skills it actually demands and rate where you sit against them.
            </div>
            <SkillCanvasEntry onChoose={setMode} />
          </div>
        </div>
      </div>
    );
  }

  const hasMessages = messages.length > 0;
  const showDeriveButton = hasInventoryContent(inventory) && !hasExpectedProfile;
  const showRederiveBanner = requiresRederivation && hasExpectedProfile;

  return (
    <div className="flex flex-col h-full">
      <Stage2Banner sessionId={sessionId} forceVisible={!hasMessages} />

      {showRederiveBanner && (
        <div className="border-b border-gold/40 bg-gold/5 px-4 py-2 text-xs text-foreground">
          <div className="mx-auto max-w-3xl flex items-center justify-between gap-3">
            <span>Stage 1 was updated. Re-derive the Expected Profile to align with your new outcome.</span>
            <Button onClick={() => void deriveExpectedProfile()} disabled={isBusy} size="sm">
              Re-derive
            </Button>
          </div>
        </div>
      )}

      {turnError && (
        <div className="border-b border-destructive/40 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <div className="mx-auto max-w-3xl">{turnError.message}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Canvas — full width on mobile, 3/5 on desktop */}
          <section className="lg:col-span-3 space-y-4">
            <header>
              <h2 className="text-sm font-semibold text-foreground">Skill inventory</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Drag chips between tiers. Updates save instantly.</p>
            </header>
            <SkillCanvas
              inventory={inventory}
              readOnly={isTerminated}
              onTierChange={updateSkillTier}
              onTeammateAdd={addTeammate}
              onTeammateRemove={removeTeammate}
            />
            {showDeriveButton && (
              <Button
                type="button"
                onClick={() => void deriveExpectedProfile()}
                disabled={isBusy}
                className="w-full"
              >
                <Sparkles className="size-4 mr-1" />
                {status === 'composing' ? 'Deriving Expected Profile…' : 'Derive the Expected Profile'}
              </Button>
            )}
          </section>

          {/* Chat — full width on mobile, 2/5 on desktop */}
          <section className="lg:col-span-2 flex flex-col min-h-[400px] rounded-lg border border-border bg-card/30">
            {hasMessages ? (
              <div className="flex-1 overflow-y-auto">
                <MessageList
                  messages={chatMessages}
                  isLoading={status === 'sending'}
                  isSynthesizing={false}
                />
              </div>
            ) : (
              <div className="flex-1 px-4 py-4 text-xs text-muted-foreground">
                Talk to the agent here. As you describe your experience, the canvas updates.
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
          placeholder={isTerminated ? 'Session ended.' : 'Tell me about a skill — or just react to a chip you moved.'}
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

function hasInventoryContent(inv: SkillInventory): boolean {
  // True if any tier is not 'unknown' on the founder, or any teammate exists.
  if (inv.team.length > 0) return true;
  for (const k in inv.founder.tiers) {
    if (inv.founder.tiers[k as keyof typeof inv.founder.tiers] !== 'unknown') return true;
  }
  return false;
}
