'use client';

import { forwardRef, useImperativeHandle, useRef, type KeyboardEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { ArrowUp } from 'lucide-react';

/**
 * A single normalised turn for the rail. The orchestrator maps the
 * persisted PushbackTurn[] (plus the synthetic opening turn) into this
 * display shape so the rail stays transport-agnostic.
 */
export interface RailTurn {
  /** Mono-caps attribution, e.g. "NeuraLaunch · Synthesis" / "You · Round 3". */
  who: string;
  text: string;
  /** True for founder turns — accent left border + fill. */
  you: boolean;
  /** Mode tag below the bubble, e.g. "Open" / "Defend" / "Refine" / "Replace". */
  mode?: string;
}

/**
 * PushbackRail — the sticky right column. Head (round counter + pips),
 * scrollable body of turns, foot composer. Visual grammar:
 * recommendation.html .rail. Presentational; the consumer owns the
 * transport + round source of truth (do not duplicate pushback state).
 */
export interface PushbackRailProps {
  turns: RailTurn[];
  /** Completed user rounds. */
  round: number;
  maxRounds: number;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  /** Disables the composer (cap reached or in flight). */
  disabled?: boolean;
  capReached?: boolean;
  /** Foot hint, e.g. "Phase 1A · Opus + research" / "Phase 1A · Researching…". */
  modeHint: string;
  onViewTranscript?: () => void;
}

export interface PushbackRailHandle {
  focusComposer: () => void;
}

export const PushbackRail = forwardRef<PushbackRailHandle, PushbackRailProps>(
  function PushbackRail(
    { turns, round, maxRounds, value, onChange, onSubmit, disabled, capReached, modeHint, onViewTranscript },
    ref,
  ) {
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => ({ focusComposer: () => taRef.current?.focus() }), []);

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!disabled && value.trim().length > 0) onSubmit();
      }
    };

    return (
      <aside
        id="pushback"
        className="hidden min-[1100px]:grid sticky top-14 h-[calc(100vh-56px)] grid-rows-[auto_1fr_auto] overflow-hidden bg-bg-2"
      >
        {/* Head */}
        <div className="border-b border-rule px-[26px] py-[22px]">
          <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            <span>Push back</span>
            <span className="text-accent">Round {round} of {maxRounds}</span>
          </div>
          <h3 className="mt-2 font-serif text-[28px] font-normal leading-tight tracking-[-0.015em] text-fg">
            Disagree? <em className="italic text-accent">Argue.</em>
          </h3>
          <div className="mt-3.5 flex items-center gap-1">
            {Array.from({ length: maxRounds }).map((_, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={['h-1 w-4', i < round ? 'bg-accent' : 'bg-rule'].join(' ')}
              />
            ))}
            <span className="ml-2.5 font-mono text-[10px] tracking-[0.04em] text-muted">
              {maxRounds} rounds available
            </span>
          </div>
          {onViewTranscript && turns.length > 1 && (
            <button
              type="button"
              onClick={onViewTranscript}
              className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted underline underline-offset-2 transition-colors hover:text-accent"
            >
              View transcript · {turns.length} turns
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 overflow-y-auto px-[26px] py-5">
          {turns.map((t, i) => (
            <Turn key={i} turn={t} />
          ))}
        </div>

        {/* Foot */}
        <form
          className="grid gap-3 border-t border-rule px-[26px] pb-[22px] pt-[18px]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled && value.trim().length > 0) onSubmit();
          }}
        >
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <span>Your pushback</span>
            <span>⌘ + ↵ to send</span>
          </div>
          <TextareaAutosize
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            minRows={3}
            maxRows={8}
            placeholder={
              capReached
                ? 'Round cap reached — the closing alternative is being prepared.'
                : "What feels wrong? A specific assumption, a fear we didn't account for, a constraint that's changed."
            }
            className="w-full resize-none border border-rule bg-bg-3 px-3.5 py-3 font-sans text-[14.5px] leading-[1.5] text-fg outline-none focus:border-accent placeholder:text-muted-2 disabled:opacity-50"
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {modeHint}
            </span>
            <button
              type="submit"
              disabled={disabled || value.trim().length === 0}
              className="inline-flex items-center gap-2 bg-accent px-3.5 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-opacity disabled:opacity-40"
            >
              Send
              <ArrowUp aria-hidden="true" className="size-3" />
            </button>
          </div>
        </form>
      </aside>
    );
  },
);

function Turn({ turn }: { turn: RailTurn }) {
  return (
    <div className="text-[14px] leading-[1.55] text-fg-2">
      <div
        className={[
          'mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em]',
          turn.you ? 'text-accent' : 'text-muted-2',
        ].join(' ')}
      >
        {turn.who}
      </div>
      <div
        className={[
          'border-l-2 px-3.5 py-2.5',
          turn.you ? 'border-accent' : 'border-rule bg-bg-3',
        ].join(' ')}
        style={turn.you ? { background: 'rgba(255,90,60,0.06)' } : undefined}
      >
        {turn.text}
      </div>
      {turn.mode && (
        <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-2">
          Mode · <b className="font-medium text-accent">{turn.mode}</b>
        </div>
      )}
    </div>
  );
}
