'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  StageBanner,
  StageInterview,
  BeliefRail,
  type StageInterviewHandle,
  type StageInterviewQuestion,
  type BeliefRailGroup,
} from '@/components/institute';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { canUseVoiceMode, useVoiceTier } from '@/lib/voice/client-tier';
import type { Stage1Message } from './useStage1Session';
import { useStage1Session } from './useStage1Session';
import type { OutcomeDimensions } from '@/lib/ideation/stage1-outcome/schema';
import { MIN_OUTCOME_FIELD_CONFIDENCE } from '@/lib/ideation/constants';

interface Stage1ChatProps {
  sessionId:        string;
  /** Threaded server-side via the dedicated opening probe — preserved
   *  on the interface so callers compile. */
  firstName?:       string;
  initialMessages:  Stage1Message[];
  initialDimensions: OutcomeDimensions | null;
  editingDimension: 'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference' | null;
  hasPriorSnapshot: boolean;
  /** Active IdeationStageRun id. Required for the Discard-edit button. */
  stageRunId?:      string;
  documentLoadError?: boolean;
}

/**
 * Stage 1 chat surface — Institute primitives.
 *
 * Now built on <StageBanner>, <StageInterview>, and <BeliefRail>. The
 * useStage1Session hook is unchanged; the messages array stays in
 * state, this surface just renders the most recent assistant turn as
 * the active question rather than a full thread (PR 10 will reintroduce
 * a transcript drawer for the conversation history).
 */
export function Stage1Chat({
  sessionId,
  firstName: _firstName,
  initialMessages,
  initialDimensions,
  editingDimension,
  hasPriorSnapshot,
  stageRunId,
  documentLoadError,
}: Stage1ChatProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const interviewRef = useRef<StageInterviewHandle>(null);
  const openingFiredRef = useRef(false);
  const editProbeFiredRef = useRef(false);
  const [discardBusy, startDiscard] = useTransition();
  const [discardError, setDiscardError] = useState<string | null>(null);

  // Voice — Compound-tier gate; mic transcribes into the answer textarea.
  const voiceEnabled = canUseVoiceMode(useVoiceTier());

  const { messages, status, turnError, sendMessage, requestOpening, requestEditProbe } =
    useStage1Session({ sessionId, initialMessages });

  useEffect(() => {
    interviewRef.current?.focus();
  }, []);

  // Fire the opening probe ONCE on mount when the conversation is
  // genuinely empty AND the founder is NOT in edit mode. The server-
  // side route enforces the pristine-state check authoritatively
  // (409 on re-fire); this ref guards against React 18 StrictMode
  // double-invocation in dev.
  useEffect(() => {
    if (openingFiredRef.current)    return;
    if (initialMessages.length > 0) return;
    if (editingDimension !== null)  return;
    if (status !== 'idle')          return;
    openingFiredRef.current = true;
    void requestOpening();
  }, [initialMessages.length, editingDimension, status, requestOpening]);

  // Fire the edit probe ONCE per mount when the founder lands in
  // edit mode. Mutually exclusive with the opening effect via
  // editingDimension polarity.
  useEffect(() => {
    if (editProbeFiredRef.current) return;
    if (editingDimension === null) return;
    if (status !== 'idle')         return;
    editProbeFiredRef.current = true;
    void requestEditProbe();
  }, [editingDimension, status, requestEditProbe]);

  const isBusy = status === 'sending' || status === 'streaming' || status === 'composing';
  const isTerminated = status === 'terminated';
  const disabled = isBusy || isTerminated;

  // Derive the current question from the latest assistant message.
  // The shell shows null until the opening probe arrives, which renders
  // its skeleton placeholder.
  const question = useMemo<StageInterviewQuestion | null>(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant || lastAssistant.content.trim().length === 0) return null;
    // Question number = count of assistant messages. A new assistant
    // turn is appended before its content streams in, so this counts
    // the in-flight turn as "the current question."
    const number = messages.filter(m => m.role === 'assistant').length;
    const editLabel = editingDimension ? DIM_FIELD_LABELS[editingDimension] : undefined;
    return {
      meta: {
        number,
        total: '6',
        phase: 'Outcome dimensions',
        field: editLabel,
      },
      text: lastAssistant.content,
    };
  }, [messages, editingDimension]);

  // BeliefRail groups — the four outcome dimensions, painted captured
  // when confidence ≥ MIN_OUTCOME_FIELD_CONFIDENCE. No group label
  // because the rail's eyebrow + completion % already carry the
  // grouping signal (stage-1.html shows dimensions directly under the
  // header, no inner section heading).
  const beliefGroups = useMemo<BeliefRailGroup[]>(() => {
    const dims = initialDimensions ?? EMPTY_DIMS;
    const fields = DIM_ORDER.map((key, i) => {
      const f = dims[key];
      const captured = (f?.confidence ?? 0) >= MIN_OUTCOME_FIELD_CONFIDENCE;
      const live = !captured && editingDimension === key;
      return {
        id: key,
        roman: ROMAN_LOWER[i],
        name: DIM_DISPLAY[key],
        value: captured
          ? formatDimensionValue(key, f)
          : live
            ? 'extracting…'
            : 'to come',
        state: captured ? 'captured' as const : live ? 'live' as const : 'pending' as const,
      };
    });
    return [{ fields }];
  }, [initialDimensions, editingDimension]);

  const capturedCount = useMemo(() => {
    const dims = initialDimensions ?? EMPTY_DIMS;
    return DIM_ORDER.reduce((acc, key) => {
      return acc + ((dims[key]?.confidence ?? 0) >= MIN_OUTCOME_FIELD_CONFIDENCE ? 1 : 0);
    }, 0);
  }, [initialDimensions]);
  const completionPct = (capturedCount / DIM_ORDER.length) * 100;
  const remaining = Math.max(0, DIM_ORDER.length - capturedCount);

  // Stack of inline banners — kept narrow + readable; consumed via the
  // StageInterview errorBanner slot when at most one wants to show.
  const editBanner = editingDimension ? (
    <span>
      Editing <em>{DIM_DISPLAY[editingDimension]}</em>.
      {hasPriorSnapshot && stageRunId && (
        <>
          {' '}
          <button
            type="button"
            onClick={handleDiscard}
            disabled={discardBusy}
            className="
              ml-2 inline-flex items-center gap-1 border border-rule-strong px-2 py-0.5
              font-mono text-[10px] uppercase tracking-[0.14em] not-italic text-muted
              transition-colors hover:border-accent hover:text-accent
              disabled:opacity-50
            "
          >
            <X aria-hidden="true" className="size-3" />
            {discardBusy ? 'Discarding…' : 'Discard edit'}
          </button>
        </>
      )}
    </span>
  ) : null;

  const composingBanner = status === 'composing' ? (
    <span>Drafting your <em>Outcome Document</em>…</span>
  ) : null;

  const turnErrorBanner = turnError ? <span>{turnError.message}</span> : null;

  const recoveryBanner = documentLoadError ? (
    <span>
      We couldn&apos;t load the previous Outcome Document. Continue the conversation
      and we&apos;ll draft it again.
    </span>
  ) : null;

  // Banner priority: turn error > document load error > editing > composing.
  const errorBanner =
    turnErrorBanner
    ?? recoveryBanner
    ?? editBanner
    ?? composingBanner;

  function handleDiscard() {
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
        router.refresh();
      } catch (err) {
        setDiscardError(err instanceof Error ? err.message : 'Discard failed');
      }
    });
  }

  // Surface a discard-API failure as a toast so the founder sees it
  // without competing with the StageInterview's single error slot.
  useEffect(() => {
    if (discardError) toast.error(discardError);
  }, [discardError]);

  const hasMessages = messages.length > 0;

  return (
    <div className="grid h-full grid-cols-1 min-[1000px]:grid-cols-[1fr_360px]">
      <div className="flex h-full min-w-0 flex-col overflow-hidden">
        <StageInterview
          ref={interviewRef}
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
            isTerminated
              ? 'Session ended.'
              : 'Say what you\'d actually do, not what you\'d plan to do.'
          }
          voiceSlot={
            voiceEnabled ? (
              <VoiceInputButton
                onTranscription={(text) => {
                  if (!text.trim()) return;
                  setInput((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${text}` : text));
                }}
                disabled={disabled}
              />
            ) : undefined
          }
          errorBanner={errorBanner}
          topSlot={
            <StageBanner
              sessionId={sessionId}
              stage={1}
              totalStages={5}
              title="Outcome Definition"
              body={
                <>
                  Before we look for ideas — <em>what outcome would actually fit your life?</em>
                  {' '}Four dimensions: how soon you want results, what you want to earn,
                  how much risk you can take, and the kind of operation you want to be
                  running.
                </>
              }
              forceVisible={!hasMessages}
            />
          }
        />
      </div>

      <BeliefRail
        eyebrow="Outcome map"
        title={<>What you&apos;re <em>aiming for</em></>}
        completionPct={completionPct}
        groups={beliefGroups}
        footLeft={`Synthesis at ${Math.round(completionPct)}%`}
        footRight={{
          text: remaining === 0 ? 'Ready' : `Ready in ~${remaining} turn${remaining === 1 ? '' : 's'}`,
          accent: remaining <= 1,
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dimension display helpers                                                 */
/* -------------------------------------------------------------------------- */

const DIM_ORDER = [
  'timeHorizon',
  'financialGoal',
  'riskTolerance',
  'lifestylePreference',
] as const;

const DIM_DISPLAY: Record<typeof DIM_ORDER[number], string> = {
  timeHorizon:         'Time horizon',
  financialGoal:       'Financial goal',
  riskTolerance:       'Risk tolerance',
  lifestylePreference: 'Lifestyle pref.',
};

/** Mono-friendly identifier for the StageInterview meta.field slot. */
const DIM_FIELD_LABELS: Record<typeof DIM_ORDER[number], string> = {
  timeHorizon:         'time_horizon',
  financialGoal:       'financial_goal',
  riskTolerance:       'risk_tolerance',
  lifestylePreference: 'lifestyle_pref',
};

const ROMAN_LOWER = ['i.', 'ii.', 'iii.', 'iv.'];

const EMPTY_DIMS = {
  timeHorizon:         { value: null, confidence: 0, extractedAt: null },
  financialGoal:       { value: null, confidence: 0, extractedAt: null },
  riskTolerance:       { value: null, confidence: 0, extractedAt: null },
  lifestylePreference: { value: null, confidence: 0, extractedAt: null },
} satisfies OutcomeDimensions;

function formatDimensionValue(
  key: typeof DIM_ORDER[number],
  field: OutcomeDimensions[keyof OutcomeDimensions],
): string {
  if (!field || field.value === null) return '—';
  if (key === 'financialGoal') {
    const fg = field.value as OutcomeDimensions['financialGoal']['value'];
    if (!fg) return '—';
    return fg.target ?? fg.shape ?? '—';
  }
  // Enum dimensions — return as-is.
  return String(field.value);
}
