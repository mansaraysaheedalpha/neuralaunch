'use client';
// src/components/discovery/standard/StandardChat.tsx
//
// Institute render shell for the standard 4-phase discovery interview.
// Composes the PR-02 primitives (TopBar, PhaseLadder via StageInterview
// topSlot, StageInterview, BeliefRail, SynthesisOverlay) over the
// existing useDiscoverySession transport — the hook's streaming /
// session / synthesis logic is untouched; this file is render only.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  TopBar,
  Pill,
  PhaseLadder,
  StageInterview,
  BeliefRail,
  SynthesisOverlay,
  type StageInterviewQuestion,
  type SynthesisStep,
} from '@/components/institute';
import { useDiscoverySession } from '@/components/discovery/useDiscoverySession';
import type { ChatMessage } from '@/components/discovery';
import type { Recommendation } from '@/lib/discovery/client';
import type { AudienceType } from '@/lib/discovery';
import { useBeliefRailState } from './useBeliefRailState';
import { beliefStateToRail, readinessLabel } from './beliefStateToRail';
import { TranscriptModal } from './TranscriptModal';

interface StandardChatProps {
  firstName:      string;
  isFirstSession: boolean;
  audienceType:   AudienceType;
  scenario:       'first_interview' | 'fresh_start';
  /** Display label for the picked archetype, shown in the top-bar crumb. */
  archetypeLabel: string;
  onComplete:     (recommendation: Recommendation, conversationId: string) => void;
}

const PHASES = ['Orientation', 'Goals', 'Constraints', 'Conviction', 'Synthesis'];
const PHASE_INDEX: Record<string, number> = {
  ORIENTATION: 0, GOAL_CLARITY: 1, CONSTRAINT_MAP: 2, CONVICTION: 3, SYNTHESIS: 4,
};
const PHASE_LABEL: Record<string, string> = {
  ORIENTATION: 'Orientation', GOAL_CLARITY: 'Goals', CONSTRAINT_MAP: 'Constraint map',
  CONVICTION: 'Conviction', SYNTHESIS: 'Synthesis',
};
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export function StandardChat({
  firstName,
  isFirstSession,
  audienceType,
  scenario,
  archetypeLabel,
  onComplete,
}: StandardChatProps) {
  const [input, setInput] = useState('');
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptSnapshot, setTranscriptSnapshot] = useState<ChatMessage[]>([]);

  const {
    messages,
    status,
    sessionId,
    isSynthesizing,
    synthesisError,
    synthesisStep,
    currentQuestion,
    questionIndex,
    turnError,
    sendMessage,
    retryLastTurn,
    retryRecommendation,
    sessionInitError,
    getTranscript,
  } = useDiscoverySession({
    onComplete,
    preseed: { audienceType, scenario },
  });

  // Belief rail — fetched once the session exists, re-read after each
  // turn (keyed on questionIndex).
  const { belief } = useBeliefRailState(sessionId, questionIndex);

  const hasStarted = messages.length > 0 || sessionId !== null;
  const isBusy = status === 'loading' || status === 'streaming';
  const disabled = isBusy || isSynthesizing;

  // Recording elapsed timer — drives the live indicator in the top bar.
  const elapsed = useElapsed();

  // Phase for the ladder + crumb. Falls back to ORIENTATION pre-session.
  const phaseKey = belief?.phase ?? 'ORIENTATION';
  const phaseIdx = isSynthesizing ? 4 : (PHASE_INDEX[phaseKey] ?? 0);

  // Most-recent founder answer → recall block.
  const lastUserAnswer = useMemo(() => {
    const u = [...messages].reverse().find((m) => m.role === 'user');
    return u?.content ?? null;
  }, [messages]);

  const question = useMemo<StageInterviewQuestion | null>(() => {
    if (!hasStarted) {
      return {
        meta: { number: 1, total: '~12', phase: 'Orientation' },
        text: (
          <>
            Tell me where you are right now — <em>what&rsquo;s going on?</em>
          </>
        ),
        hint: "However you'd explain it to someone you trust. Start anywhere — we'll shape it together.",
      };
    }
    if (!currentQuestion) return null; // streaming gap → skeleton
    const fieldLabel = belief?.activeField ?? undefined;
    const recall =
      lastUserAnswer && questionIndex > 0
        ? {
            lab: 'Earlier you said —',
            quote: truncate(lastUserAnswer, 150),
            refLabel: fieldLabel ? `prior answer · ${fieldLabel}` : 'prior answer',
          }
        : undefined;
    return {
      meta: {
        number: Math.max(1, questionIndex),
        total: '~12',
        phase: PHASE_LABEL[phaseKey] ?? 'Discovery',
        field: belief?.activeField ?? undefined,
      },
      text: renderQuestionText(currentQuestion),
      recall,
    };
  }, [hasStarted, currentQuestion, belief?.activeField, phaseKey, lastUserAnswer, questionIndex]);

  // Error banner — turn cut OR session-init refusal, with a retry.
  const errorBanner: ReactNode = useMemo(() => {
    if (sessionInitError) return <span>{sessionInitError}</span>;
    if (turnError) {
      return (
        <span>
          {turnError.kind === 'cut_stream'
            ? 'That response was cut off mid-stream.'
            : 'Something interrupted the last turn.'}{' '}
          <button
            type="button"
            onClick={() => void retryLastTurn()}
            className="font-mono text-[11px] uppercase tracking-[0.14em] not-italic text-accent underline underline-offset-2"
          >
            Retry
          </button>
        </span>
      );
    }
    return null;
  }, [sessionInitError, turnError, retryLastTurn]);

  const railGroups = useMemo(
    () => (belief ? beliefStateToRail(belief.context, belief.activeField) : []),
    [belief],
  );

  const synthSteps: SynthesisStep[] = useMemo(
    () => [
      { label: 'Belief state · loaded', state: 'done' },
      { label: 'Alternatives · narrowing', state: 'done' },
      { label: synthesisStep ?? 'Final synthesis · Opus 4.6', state: 'active' },
      { label: 'Recommendation · ready', state: 'pending' },
    ],
    [synthesisStep],
  );

  const shortId = sessionId ? sessionId.slice(0, 6) : 'new';

  return (
    <div className="flex h-full flex-col">
      <TopBar
        crumb={[
          { label: 'Discovery', accent: true },
          { label: archetypeLabel },
          { label: sessionId ? `Session ${shortId}` : 'New session' },
          { label: `Phase ${ROMAN[phaseIdx]}`, current: true },
        ]}
        rightStatus={
          <Pill accent>
            <span
              aria-hidden="true"
              className="mr-2 inline-block size-[6px] animate-pulse rounded-full bg-accent"
              style={{ animationDuration: '1.6s' }}
            />
            {isSynthesizing ? 'Synthesising' : `Recording · ${elapsed}`}
          </Pill>
        }
        rightActions={
          <Link href="/discovery" className="text-muted transition-colors hover:text-fg">
            Save &amp; exit
          </Link>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_360px]">
        {/* Stage column */}
        <div className="relative flex min-w-0 flex-col overflow-hidden border-r border-rule">
          <StageInterview
            className="h-full"
            topSlot={<PhaseLadder phases={PHASES} currentIndex={phaseIdx} />}
            question={question}
            value={input}
            onChange={setInput}
            onSubmit={async (val) => {
              const content = val.trim();
              if (!content) return;
              setInput('');
              await sendMessage(content);
            }}
            disabled={disabled}
            placeholder={
              hasStarted
                ? 'Say what you actually think, not what sounds right.'
                : 'Start anywhere. A sentence is enough to begin.'
            }
            submitLabel={hasStarted ? 'Continue' : 'Begin'}
            voiceEnabled
            voiceState="ready"
            onVoiceToggle={() =>
              toast('Voice is coming to this surface in a later pass.', { icon: '🎙' })
            }
            errorBanner={errorBanner}
          />

          {/* Synthesis overlay — covers the stage column only; the belief
              rail keeps showing its final state alongside. */}
          <SynthesisOverlay
            open={isSynthesizing && !synthesisError}
            heading={<>Reading you back to <em>yourself.</em></>}
            body="One direction, for your specific situation, with reasoning and risks — ready in about a minute."
            steps={synthSteps}
          />

          {synthesisError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md" style={{ background: 'rgba(10,10,12,0.94)' }}>
              <div className="max-w-[420px] px-6 text-center">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-amber">
                  Synthesis interrupted
                </p>
                <p className="mb-6 text-[15px] leading-[1.55] text-fg-2">
                  The recommendation didn&rsquo;t finish generating. Your belief
                  state is saved — retry and we&rsquo;ll pick up where it stopped.
                </p>
                <button
                  type="button"
                  onClick={retryRecommendation}
                  className="inline-flex items-center gap-3 bg-accent px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg"
                >
                  Retry synthesis
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Belief rail */}
        <BeliefRail
          eyebrow="Belief state"
          title={<>What we know <em>about you</em></>}
          completionPct={belief?.completionPct ?? 0}
          groups={railGroups}
          footLeft="Synthesis at 80%"
          footRight={{
            text: readinessLabel(
              belief?.capturedCount ?? 0,
              belief?.synthTarget ?? 12,
              isSynthesizing,
            ),
            accent: true,
          }}
        />
      </div>

      {/* Transcript bar */}
      <footer className="flex h-16 items-center justify-between border-t border-rule px-7 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        <div className="flex flex-wrap gap-3.5">
          <span>Turn {messages.length} · Q{Math.max(1, questionIndex)}</span>
          <span>Model · {isSynthesizing ? 'Opus 4.6' : 'Sonnet 4.6'}</span>
          <span>Safety · {turnError ? 'Retry' : 'Pass'}</span>
          {isFirstSession && <span className="text-accent">First session</span>}
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => {
              setTranscriptSnapshot(getTranscript());
              setTranscriptOpen(true);
            }}
            className="border border-rule-strong px-3.5 py-2 text-fg transition-colors hover:border-accent hover:text-accent"
          >
            View transcript
          </button>
          <Link
            href="/discovery"
            className="inline-flex items-center border border-rule-strong px-3.5 py-2 text-fg transition-colors hover:border-accent hover:text-accent"
          >
            ← Sessions
          </Link>
        </div>
      </footer>

      <TranscriptModal
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        messages={transcriptSnapshot}
      />

      {/* Greeting toast on first mount — keeps the founder oriented
          without a heavy welcome layer. firstName is optional. */}
      {firstName && !hasStarted && (
        <span className="sr-only">Welcome back, {firstName}</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** mm:ss elapsed since mount, for the live recording indicator. */
function useElapsed(): string {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function truncate(s: string, n: number): string {
  const clean = s.trim();
  return clean.length <= n ? clean : `${clean.slice(0, n - 1)}…`;
}

/**
 * Render a question string that may contain literal <em>…</em> emphasis
 * markup from the question-generation prompt. Only <em> is interpreted;
 * everything else is plain text (React-escaped), so this is XSS-safe
 * even though the source is our own LLM.
 */
function renderQuestionText(raw: string): ReactNode {
  if (!raw.includes('<em>')) return raw;
  const parts = raw.split(/(<em>.*?<\/em>)/g);
  return parts.map((part, i) => {
    const m = /^<em>(.*?)<\/em>$/.exec(part);
    if (m) return <em key={i}>{m[1]}</em>;
    return <span key={i}>{part}</span>;
  });
}
