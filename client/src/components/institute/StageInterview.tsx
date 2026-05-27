'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { ArrowRight, Mic } from 'lucide-react';

/**
 * Institute streaming-question shell.
 *
 * Owns the layout (question block on top, answer composer pinned at the
 * bottom), the keyboard shortcuts (⌘/Ctrl+Enter to submit, ⌥/Alt+V to
 * trigger voice), the auto-growing textarea, the submit affordance, and
 * the error-banner slot. It does NOT own the messages array, the stream
 * connection, the model selection, or the voice transcription itself —
 * those belong to the consumer.
 *
 * Reuse contract — this shell ships for:
 *   • Stage 1 No-Idea (outcome interview)
 *   • Stage 2 No-Idea (skill canvas chat)
 *   • Stage 3 No-Idea (pain composer, voiceEnabled={false}, no recall)
 *   • Standard Discovery path (full voice + audience-aware copy in
 *     wrapping component)
 *   • Stuck-founder diagnostic
 *
 * The prop surface is intentionally wide enough that none of these
 * consumers should need to wrap or fork it.
 */

export type VoiceState = 'ready' | 'recording' | 'transcribing' | 'unsupported';

export interface StageInterviewRecall {
  /** Mono label rendered above the quote — e.g. "Earlier you said —". */
  lab: string;
  /** The founder's recalled quote, rendered in serif italic. */
  quote: string;
  /** Mono ref label rendered after the quote — e.g. "Q1 · situation". */
  refLabel?: string;
}

export interface StageInterviewQuestion {
  /** Meta strip rendered above the question text. */
  meta: {
    /** Sequential question number (1-based). */
    number: number;
    /** Approximate total — supports ranges via the `total` string. */
    total: number | string;
    /** Belief-state field this question targets (e.g. "time_horizon"). */
    field?: string;
    /** Phase label rendered in --accent (e.g. "Outcome dimensions"). */
    phase?: string;
  };
  /**
   * The question itself. ReactNode so consumers can drop in
   * Instrument-Serif italic accents via `<em>…</em>`.
   */
  text: ReactNode;
  /** Optional grey hint copy below the question. */
  hint?: ReactNode;
  /** Optional founder-quote recall block. */
  recall?: StageInterviewRecall;
}

export interface StageInterviewProps {
  /**
   * The question payload. When null, the shell renders a placeholder
   * skeleton — useful while the opening probe is mid-stream and no
   * assistant message has arrived yet.
   */
  question: StageInterviewQuestion | null;
  /** Controlled textarea value. */
  value: string;
  /** Controlled textarea onChange. */
  onChange: (next: string) => void;
  /**
   * Fired on submit (button click OR ⌘/Ctrl+Enter). The shell pre-
   * validates length (>= 4 chars after trim) — consumers do not need to
   * re-check. Async or sync; the shell does not await it.
   */
  onSubmit: (value: string) => void | Promise<void>;
  /** Hard-disable the composer (network busy, session terminated, …). */
  disabled?: boolean;
  /** Placeholder copy for the empty textarea. */
  placeholder?: string;
  /** Label rendered above the textarea ("Your answer" by default). */
  answerLabel?: string;
  /** Mono label rendered next to the submit button ("Continue" by default). */
  submitLabel?: string;
  /** Voice mic visible? Default true; set false for tier-gated surfaces. */
  voiceEnabled?: boolean;
  /** Driven by the consumer's voice state machine. */
  voiceState?: VoiceState;
  /** Fires on mic-tap OR ⌥/Alt+V. No-op when voiceEnabled is false. */
  onVoiceToggle?: () => void;
  /**
   * Slot above the textarea for safety blocks, mid-stream cuts, recovery
   * banners. Rendered with a left-side --amber rule + serif italic copy.
   */
  errorBanner?: ReactNode;
  /**
   * Optional slot rendered ABOVE the question block — used for the
   * `<StageBanner>` so the banner card shares the column gutter with
   * the question. Pass null when the consumer wants just the question +
   * composer (Stage 3 add-pain composer, Stuck-founder diagnostic).
   */
  topSlot?: ReactNode;
  /** Optional className appended to the outer column wrapper. */
  className?: string;
}

export interface StageInterviewHandle {
  /** Focus the textarea (for parent-driven auto-focus on mount). */
  focus: () => void;
}

/** Minimum trimmed length before the submit affordance unlocks. */
const MIN_ANSWER_LENGTH = 4;

export const StageInterview = forwardRef<StageInterviewHandle, StageInterviewProps>(
  function StageInterview(
    {
      question,
      value,
      onChange,
      onSubmit,
      disabled,
      placeholder = 'Type your answer. Press ⌘+↵ when ready.',
      answerLabel = 'Your answer',
      submitLabel = 'Continue',
      voiceEnabled = true,
      voiceState = 'ready',
      onVoiceToggle,
      errorBanner,
      topSlot,
      className,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
    }), []);

    const trimmedLen = value.trim().length;
    const canSubmit = !disabled && trimmedLen >= MIN_ANSWER_LENGTH;

    const fireSubmit = useCallback(() => {
      if (!canSubmit) return;
      void onSubmit(value);
    }, [canSubmit, onSubmit, value]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // ⌘/Ctrl+Enter — submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        fireSubmit();
        return;
      }
      // ⌥/Alt+V — toggle voice
      if (
        e.altKey
        && (e.key === 'v' || e.key === 'V')
        && voiceEnabled
        && voiceState !== 'unsupported'
        && onVoiceToggle
      ) {
        e.preventDefault();
        onVoiceToggle();
      }
    };

    // ⌘+Enter / ⌥+V should also work when focus lives outside the
    // textarea (a brief moment after submit, before refocus). Document-
    // level handler — gated on the same disabled / canSubmit checks.
    useEffect(() => {
      function onDocKey(e: globalThis.KeyboardEvent) {
        if (disabled) return;
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
          e.preventDefault();
          fireSubmit();
        } else if (
          e.altKey
          && (e.key === 'v' || e.key === 'V')
          && voiceEnabled
          && voiceState !== 'unsupported'
          && onVoiceToggle
        ) {
          e.preventDefault();
          onVoiceToggle();
        }
      }
      document.addEventListener('keydown', onDocKey);
      return () => document.removeEventListener('keydown', onDocKey);
    }, [canSubmit, disabled, fireSubmit, onVoiceToggle, voiceEnabled, voiceState]);

    return (
      <div
        className={[
          'relative grid h-full overflow-hidden gap-6',
          // Layout mirrors stage-1.html: top slot (auto, optional),
          // question block (1fr, align-self centre — vertically centred
          // in the available column space), composer (auto, pinned at
          // the bottom).
          topSlot ? 'grid-rows-[auto_1fr_auto]' : 'grid-rows-[1fr_auto]',
          'px-10 pt-10 pb-7 lg:px-[72px] lg:pt-12 lg:pb-9',
          className ?? '',
        ].filter(Boolean).join(' ')}
      >
        {/* Decorative radial wash — anchors the question block. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-48 top-0 h-[600px] w-[600px]"
          style={{
            background:
              'radial-gradient(circle at center, rgba(255,90,60,0.06), transparent 70%)',
          }}
        />

        {/* Optional top slot — the StageBanner card. */}
        {topSlot && <div className="relative">{topSlot}</div>}

        {/* Question block — vertically centred in the 1fr cell. */}
        <QuestionBlock question={question} />

        {/* Composer row — pinned at the bottom. */}
        <div className="relative">
          {errorBanner && (
            <div className="mb-5 border-l-2 border-amber bg-bg-2 px-4 py-3">
              <p className="font-serif text-[14px] italic leading-[1.45] text-fg-2">
                {errorBanner}
              </p>
            </div>
          )}

          <div className="border-t border-rule pt-6">
            <div className="mb-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              <span>{answerLabel}</span>
              <span className="flex items-center gap-3.5">
                {voiceEnabled && voiceState !== 'unsupported' && (
                  <span className="inline-flex items-center gap-1.5 text-fg-2">
                    <VoiceDot state={voiceState} />
                    Voice {voiceLabel(voiceState)}
                  </span>
                )}
                <span>{trimmedLen} chars</span>
              </span>
            </div>

            <TextareaAutosize
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              minRows={3}
              maxRows={8}
              className="
                w-full resize-none border-none bg-transparent outline-none
                font-sans text-[19px] leading-[1.55] text-fg
                placeholder:text-muted
                caret-accent
              "
              style={{ caretColor: 'var(--accent)' }}
            />

            <div className="mt-3 flex items-center justify-between">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                Submit
                <KeyHint>⌘</KeyHint>
                <KeyHint>↵</KeyHint>
                {voiceEnabled && voiceState !== 'unsupported' && (
                  <>
                    <span className="mx-2 text-muted-2">·</span>
                    Voice
                    <KeyHint>⌥</KeyHint>
                    <KeyHint>V</KeyHint>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {voiceEnabled && voiceState !== 'unsupported' && onVoiceToggle && (
                  <button
                    type="button"
                    onClick={onVoiceToggle}
                    aria-label="Toggle voice input"
                    className={[
                      'inline-flex h-[42px] w-[42px] items-center justify-center',
                      'border border-rule-strong text-fg',
                      'transition-colors hover:border-accent hover:text-accent',
                      voiceState === 'recording' ? 'border-accent text-accent' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <Mic className="size-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={fireSubmit}
                  disabled={!canSubmit}
                  className="
                    inline-flex items-center gap-3 bg-accent px-5 py-[13px]
                    font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg
                    transition-opacity
                    disabled:opacity-[0.35] disabled:cursor-not-allowed
                  "
                  style={{ color: 'var(--bg)' }}
                >
                  {submitLabel}
                  <ArrowRight aria-hidden="true" className="size-[15px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

/* -------------------------------------------------------------------------- */
/*  Internals                                                                 */
/* -------------------------------------------------------------------------- */

function QuestionBlock({ question }: { question: StageInterviewQuestion | null }) {
  if (!question) {
    return (
      <div className="grid max-w-[880px] gap-4 self-center">
        <div className="h-3 w-48 bg-rule" aria-hidden="true" />
        <div className="h-12 w-full max-w-[680px] bg-rule" aria-hidden="true" />
      </div>
    );
  }
  const meta = question.meta;
  return (
    <div className="grid max-w-[880px] gap-[18px] self-center">
      <div className="flex flex-wrap gap-[18px] font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        <span>
          Question {String(meta.number).padStart(2, '0')} / ~{meta.total}
        </span>
        {meta.phase && <span className="text-accent">Phase · {meta.phase}</span>}
        {meta.field && <span>Field · {meta.field}</span>}
      </div>
      <h2
        className="
          font-sans text-fg
          [font-size:clamp(34px,4.6vw,60px)] [line-height:1.05] [letter-spacing:-0.025em]
          [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent
        "
      >
        {question.text}
      </h2>
      {question.hint && (
        <p
          className="
            mt-1.5 max-w-[620px] border-l-2 border-accent pl-4
            font-serif text-[18px] italic leading-[1.4] text-fg-2
            [&_em]:text-accent
          "
        >
          {question.hint}
        </p>
      )}
      {question.recall && (
        <div className="mt-1 border border-rule bg-bg-2 px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {question.recall.lab}
          </div>
          <blockquote className="mt-2 font-serif text-[15px] italic leading-[1.4] text-fg">
            “{question.recall.quote}”
          </blockquote>
          {question.recall.refLabel && (
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
              {question.recall.refLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KeyHint({ children }: { children: ReactNode }) {
  return (
    <span className="ml-1.5 inline-block border border-rule-strong px-1.5 py-0.5 text-fg">
      {children}
    </span>
  );
}

function VoiceDot({ state }: { state: VoiceState }) {
  const color =
    state === 'recording' ? 'bg-accent'
    : state === 'transcribing' ? 'bg-amber'
    : 'bg-success';
  const animate = state === 'recording' || state === 'transcribing' ? 'animate-pulse' : '';
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-[6px] rounded-full ${color} ${animate}`}
    />
  );
}

function voiceLabel(state: VoiceState): string {
  switch (state) {
    case 'recording':     return 'recording';
    case 'transcribing':  return 'transcribing';
    case 'unsupported':   return 'unsupported';
    case 'ready':
    default:              return 'ready';
  }
}
