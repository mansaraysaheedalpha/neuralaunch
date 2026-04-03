// src/components/discovery/DiscoveryChat.tsx
'use client';

import { useState, useRef, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import TextareaAutosize from 'react-textarea-autosize';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Recommendation } from '@/lib/discovery/client';
import { MessageList } from './MessageList';
import { WelcomeLayer } from './WelcomeLayer';
import { QuestionStepper } from './QuestionStepper';
import { useDiscoverySession } from './useDiscoverySession';

interface DiscoveryChatProps {
  firstName:   string;
  onComplete?: (recommendation: Recommendation, conversationId: string) => void;
}

/**
 * DiscoveryChat
 *
 * Main conversational UI for Phase 1. Delegates all server interaction
 * to useDiscoverySession; owns only local input state and rendering.
 */
export function DiscoveryChat({ firstName, onComplete }: DiscoveryChatProps) {
  const router = useRouter();
  const [input,      setInput]      = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const mainInputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    status,
    sessionReady,
    isSynthesizing,
    synthesisError,
    stepperVisible,
    setStepperVisible,
    currentQuestion,
    questionIndex,
    sendMessage,
  } = useDiscoverySession({ onComplete });

  const isLoading = status === 'loading';
  const canSubmit = sessionReady && !isSynthesizing && input.trim().length > 0
    && status !== 'loading' && status !== 'streaming';

  const handleChipClick = useCallback((text: string) => {
    setInput(text);
    mainInputRef.current?.focus();
  }, []);

  const handleSend = useCallback((content: string) => {
    setHasStarted(true);
    void sendMessage(content);
  }, [sendMessage]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const content = input;
    setInput('');
    setStepperVisible(false);
    handleSend(content);
  };

  const inputField = (
    <TextareaAutosize
      ref={mainInputRef}
      value={input}
      onChange={e => setInput(e.target.value)}
      disabled={!sessionReady || isSynthesizing}
      placeholder="Share your thoughts…"
      maxRows={5}
      className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-2"
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (canSubmit) {
            const content = input;
            setInput('');
            setStepperVisible(false);
            handleSend(content);
          }
        }
      }}
    />
  );

  return (
    <div className="flex flex-col h-full relative">

      {hasStarted && (
        <MessageList
          messages={messages}
          isLoading={isLoading && !stepperVisible}
          isSynthesizing={isSynthesizing}
          synthesisError={synthesisError}
          onRetry={() => router.push('/discovery')}
        />
      )}

      {/* Empty state — welcome + input grouped and vertically centered */}
      {!hasStarted && !stepperVisible && !isSynthesizing && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4 pb-6">
          <WelcomeLayer
            firstName={firstName}
            isVisible
            onChipClick={handleChipClick}
          />
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 items-end w-full max-w-2xl rounded-xl border border-border bg-background px-4 py-3"
          >
            {inputField}
            <Button type="submit" size="icon" disabled={!canSubmit} variant="ghost">
              <SendHorizontal className="size-4" />
            </Button>
          </form>
        </div>
      )}

      <QuestionStepper
        currentQuestion={currentQuestion}
        currentIndex={questionIndex}
        isVisible={stepperVisible && !isSynthesizing}
        onAnswer={answer => {
          setStepperVisible(false);
          handleSend(answer);
        }}
        onDismiss={() => {
          setStepperVisible(false);
          mainInputRef.current?.focus();
        }}
      />

      {/* Bottom input bar — once conversation is active and stepper dismissed */}
      {hasStarted && !stepperVisible && !isSynthesizing && (
        <form
          onSubmit={handleSubmit}
          className="flex gap-2 items-end border-t border-border bg-background px-4 py-3"
        >
          {inputField}
          <Button type="submit" size="icon" disabled={!canSubmit} variant="ghost">
            <SendHorizontal className="size-4" />
          </Button>
        </form>
      )}
    </div>
  );
}
