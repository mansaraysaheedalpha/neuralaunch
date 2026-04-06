// src/components/discovery/DiscoveryChat.tsx
'use client';

import { useState, useRef, useCallback, useEffect, type FormEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { BookOpen, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Recommendation } from '@/lib/discovery/client';
import { MessageList } from './MessageList';
import { WelcomeLayer } from './WelcomeLayer';
import { QuestionStepper } from './QuestionStepper';
import { InterviewGuide } from './InterviewGuide';
import { useDiscoverySession } from './useDiscoverySession';

import type { ChatMessage } from './MessageList';

interface ResumeState {
  sessionId:      string;
  conversationId: string | null;
  messages:       ChatMessage[];
}

interface DiscoveryChatProps {
  firstName:       string;
  onComplete?:     (recommendation: Recommendation, conversationId: string) => void;
  resume?:         ResumeState;
  /** True when the user has no prior completed sessions — shows guide pulse indicator */
  isFirstSession?: boolean;
}

/**
 * DiscoveryChat
 *
 * Main conversational UI for Phase 1. Delegates all server interaction
 * to useDiscoverySession; owns only local input state and rendering.
 */
// localStorage key for the unsent input draft — survives page refresh so
// a user who has typed a long message and accidentally reloads does not
// lose what they wrote. Cleared on successful send.
const DRAFT_STORAGE_KEY = 'neuralaunch:discovery-input-draft';

export function DiscoveryChat({ firstName, onComplete, resume, isFirstSession = false }: DiscoveryChatProps) {
  const [input,      setInput]      = useState('');
  const [hasStarted, setHasStarted] = useState(!!resume);
  const [guideOpen,  setGuideOpen]  = useState(false);
  const mainInputRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate the draft from localStorage once on mount. Guarded for SSR.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved && saved.length > 0) setInput(saved);
    } catch {
      // localStorage can throw in private mode — silently ignore
    }
  }, []);

  // Persist every keystroke. Debouncing is unnecessary — localStorage writes
  // are synchronous but fast, and text-input events are already throttled
  // to the user's typing speed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (input.length > 0) {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, input);
      } else {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch {
      // private mode / quota — silently ignore
    }
  }, [input]);

  const clearDraft = useCallback(() => {
    setInput('');
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ignore */ }
    }
  }, []);

  const {
    messages,
    status,
    sessionReady,
    isSynthesizing,
    synthesisError,
    synthesisStep,
    stepperVisible,
    setStepperVisible,
    currentQuestion,
    questionIndex,
    sendMessage,
    retryRecommendation,
  } = useDiscoverySession({ onComplete, resume });

  const isLoading = status === 'loading';
  const canSubmit = sessionReady && !isSynthesizing && input.trim().length > 0
    && status !== 'loading' && status !== 'streaming';

  // Focus the input as soon as the session is ready (disabled→enabled transition
  // means autoFocus fires too early, before the input is interactive).
  useEffect(() => {
    if (sessionReady && !hasStarted) mainInputRef.current?.focus();
  }, [sessionReady, hasStarted]);

  const handleSend = useCallback((content: string) => {
    setHasStarted(true);
    void sendMessage(content);
  }, [sendMessage]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const content = input;
    clearDraft();
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
            clearDraft();
            setStepperVisible(false);
            handleSend(content);
          }
        }
      }}
    />
  );

  return (
    <div className="flex flex-col h-full relative">

      {/* Guide button — always accessible, pulse indicator for first-time users */}
      <div className="flex items-center justify-end px-4 py-2 shrink-0">
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="relative flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-md hover:bg-muted/50"
          aria-label="Open interview guide"
        >
          <BookOpen className="size-3.5" />
          <span>Guide</span>
          {isFirstSession && !guideOpen && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary animate-pulse" />
          )}
        </button>
      </div>

      <InterviewGuide open={guideOpen} onOpenChange={setGuideOpen} />

      {hasStarted && (
        <MessageList
          messages={messages}
          isLoading={isLoading && !stepperVisible}
          isSynthesizing={isSynthesizing}
          synthesisError={synthesisError}
          synthesisStep={synthesisStep}
          onRetry={retryRecommendation}
        />
      )}

      {/* Empty state — welcome + input grouped and vertically centered */}
      {!hasStarted && !stepperVisible && !isSynthesizing && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4 pb-6">
          <WelcomeLayer
            firstName={firstName}
            isVisible
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
