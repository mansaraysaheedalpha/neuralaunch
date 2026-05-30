'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage2Chat.tsx
//
// Stage 2 — Requirements / Skill Canvas, Institute treatment.
// Render layer only — the existing useStage2Session hook owns
// session/streaming/derive transports; this component just composes
// the Institute primitives over them.

import { useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  TopBar,
  Pill,
  StageBanner,
  StageInterview,
  type StageInterviewHandle,
  type StageInterviewQuestion,
} from '@/components/institute';
import {
  SkillGrid,
  ExpectedProfilePanel,
  StructuralBlocker,
  TIER_RANK,
} from '@/components/institute/no-idea';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { canUseVoiceMode, useVoiceTier } from '@/lib/voice/client-tier';
import { TeammateForm } from '@/components/ideation/TeammateForm';
import { SKILL_KEYS, type SkillKey, type SkillTier } from '@neuralaunch/constants';
import type {
  SkillInventory,
  ExpectedProfileEntry,
} from '@/lib/ideation/stage2-requirements/schema';
import { useStage2Session, type Stage2Message } from './useStage2Session';
import { Trash2, Loader2 } from 'lucide-react';

interface Stage2ChatProps {
  sessionId:        string;
  stageRunId:       string;
  firstName:        string;
  initialMessages:  Stage2Message[];
  inventory:        SkillInventory;
  expectedProfile:  ExpectedProfileEntry[] | null;
  hasExpectedProfile: boolean;
  requiresRederivation: boolean;
  /** Kept on the prop surface for compat; the entry mode picker is
   *  bypassed in the Institute treatment — the founder lands directly
   *  on the calibration canvas (the chat docks below). */
  showEntryPicker?: boolean;
}

const STAGE2_BANNER_BODY = (
  <>
    Now we figure out what skills your committed outcome actually <em>demands</em>{' '}
    and rate where you (and any teammates) sit against those demands. The canvas
    is the truth — click a lane to set each skill, or talk to me below and I&apos;ll
    move them as we go.
  </>
);

export function Stage2Chat({
  sessionId,
  stageRunId: _stageRunId,
  firstName: _firstName,
  initialMessages,
  inventory,
  expectedProfile,
  hasExpectedProfile,
  requiresRederivation,
}: Stage2ChatProps) {
  const [input, setInput] = useState('');
  const [activePerson, setActivePerson] = useState<'founder' | number>('founder');
  const interviewRef = useRef<StageInterviewHandle>(null);

  const {
    messages,
    status,
    turnError,
    sendMessage,
    updateSkillTier,
    addTeammate,
    removeTeammate,
    deriveExpectedProfile,
  } = useStage2Session({ sessionId, stageRunId: _stageRunId, initialMessages });

  const isBusy = status === 'sending' || status === 'streaming' || status === 'composing';
  const isTerminated = status === 'terminated';
  const disabled = isBusy || isTerminated;

  const voiceEnabled = canUseVoiceMode(useVoiceTier());

  // Active person's tier map.
  const currentPerson =
    activePerson === 'founder'
      ? inventory.founder
      : inventory.team[activePerson] ?? inventory.founder;

  // Expected tier per skill — keyed for SkillRow's ghost marker.
  const expectedByKey = useMemo<Partial<Record<SkillKey, SkillTier>>>(() => {
    if (!expectedProfile) return {};
    const out: Partial<Record<SkillKey, SkillTier>> = {};
    for (const e of expectedProfile) out[e.skill] = e.requiredTier;
    return out;
  }, [expectedProfile]);

  // Structural blocker — count critical demanded-Strong (good) skills
  // where the across-team-strongest tier sits below adequate (bad or
  // unknown). Mirrors lib/ideation/stage2-requirements/constraints.ts
  // logic at the visual-summary level so this surface stays render-only.
  const blockerCount = useMemo(() => {
    if (!expectedProfile) return 0;
    return expectedProfile.filter((e) => {
      if (!e.critical) return false;
      if (e.requiredTier !== 'good') return false;
      const strongest = strongestTier(inventory, e.skill);
      return TIER_RANK[strongest] < TIER_RANK.acceptable;
    }).length;
  }, [expectedProfile, inventory]);

  // Readiness — count of calibrated (non-unknown) tiers for the active person.
  const calibratedCount = useMemo(
    () => SKILL_KEYS.reduce((n, k) => n + (currentPerson.tiers[k] !== 'unknown' ? 1 : 0), 0),
    [currentPerson],
  );
  const calibratedPct = Math.round((calibratedCount / SKILL_KEYS.length) * 100);

  // Calibration chat question — the most recent assistant turn becomes
  // the agent prompt; when none, we surface a soft default.
  const question = useMemo<StageInterviewQuestion | null>(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return null;
    const questionNumber = messages.filter((m) => m.role === 'assistant').length;
    return {
      meta: { number: questionNumber, total: '~', phase: 'Calibration' },
      text: lastAssistant.content,
    };
  }, [messages]);

  const errorBanner: ReactNode = turnError ? <span>{turnError.message}</span> : null;

  const shortId = sessionId.slice(0, 6);

  // Derive button label / handler — preserves the existing "derive
  // Expected Profile" flow. The reference's "Commit Stage II" button
  // sits in the same slot; until an explicit commit route exists, this
  // button derives the Expected Profile (which is what currently
  // advances Stage 2). See PR notes.
  const deriveLabel = !hasExpectedProfile
    ? 'Derive Expected Profile'
    : requiresRederivation
      ? 'Re-derive Expected Profile'
      : 'Calibrate further to advance';
  const canDerive = !isBusy && !isTerminated && (!hasExpectedProfile || requiresRederivation);
  const canCommit = hasExpectedProfile && !requiresRederivation && calibratedCount >= 12;

  return (
    <div className="flex h-full flex-col">
      <TopBar
        crumb={[
          { label: 'No Idea', accent: true },
          { label: `Session ${shortId}` },
          { label: 'Stage II · Requirements', current: true },
        ]}
        rightStatus={
          <Pill accent>
            <span aria-hidden="true" className="mr-2 inline-block size-[6px] animate-pulse rounded-full bg-accent" style={{ animationDuration: '1.6s' }} />
            {hasExpectedProfile ? 'Calibrating' : 'Authoring'}
          </Pill>
        }
        rightActions={
          <Link href={`/discovery/no-idea/${sessionId}`} className="text-muted transition-colors hover:text-fg">
            ← Stage I
          </Link>
        }
      />

      <StageBanner
        sessionId={sessionId}
        stage={2}
        totalStages={5}
        title="Requirements"
        body={STAGE2_BANNER_BODY}
        forceVisible={messages.length === 0}
      />

      <div className="flex-1 overflow-y-auto">
        {/* Header band */}
        <header className="border-b border-rule px-6 pb-6 pt-10 sm:px-12 lg:px-16">
          <div className="mb-6 flex flex-wrap gap-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            <span>Stage <span className="text-accent">II</span> of V · Requirements</span>
            <span>14 skills · 4 tiers</span>
            <span>Saved continuously</span>
          </div>
          <h1 className="max-w-[1100px] font-sans text-fg [font-size:clamp(36px,5vw,68px)] [font-weight:500] [line-height:1] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
            What you&rsquo;re <em>built to execute.</em>
          </h1>
          <p className="mt-4 max-w-[680px] text-[16px] leading-[1.55] text-fg-2 [&_em]:font-serif [&_em]:italic [&_em]:text-accent [&_strong]:font-medium [&_strong]:text-fg">
            Calibrate each skill <em>honestly.</em> The dashed marker on each row shows what the outcome you committed to <strong>actually demands</strong>. The mismatch is the structural shape Stage III plans around.
          </p>

          {requiresRederivation && (
            <div className="mt-5 max-w-[920px] border-l-2 border-amber bg-amber/[0.05] px-4 py-3 text-[13.5px] leading-[1.5] text-fg-2">
              <b className="font-medium text-amber">Stage 1 was updated.</b>{' '}
              Re-derive the Expected Profile so it matches your new outcome.
            </div>
          )}
        </header>

        {/* Teammate tabs */}
        <div className="flex max-w-[1400px] flex-wrap items-end gap-0 border-b border-rule px-6 pt-4 sm:px-12 lg:px-16">
          <PersonTab
            label="You"
            roman="I."
            active={activePerson === 'founder'}
            onClick={() => setActivePerson('founder')}
          />
          {inventory.team.map((t, i) => (
            <div key={i} className="flex items-center">
              <PersonTab
                label={t.name ?? `Teammate ${i + 1}`}
                roman={`${['II.', 'III.', 'IV.', 'V.'][i] ?? `${i + 2}.`}`}
                active={activePerson === i}
                onClick={() => setActivePerson(i)}
              />
              {!isTerminated && (
                <button
                  type="button"
                  onClick={() => {
                    void removeTeammate(i);
                    if (activePerson === i) setActivePerson('founder');
                  }}
                  aria-label={`Remove ${t.name ?? `Teammate ${i + 1}`}`}
                  className="px-2 py-3 text-muted-2 transition-colors hover:text-accent"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {!isTerminated && (
            <div className="px-3.5 py-2">
              <TeammateForm
                existingNames={inventory.team.map((t) => t.name).filter((n): n is string => !!n)}
                onAdd={addTeammate}
              />
            </div>
          )}
        </div>

        {/* Canvas: grid (left) + rail (right) */}
        <div className="grid grid-cols-1 gap-12 px-6 pb-20 pt-8 sm:px-12 lg:grid-cols-[1fr_320px] lg:px-16">
          <main>
            <SkillGrid
              tiers={currentPerson.tiers}
              expectedByKey={expectedByKey}
              onSet={(skill, tier) => { void updateSkillTier(activePerson, skill, tier); }}
              readOnly={isTerminated}
            />

            {/* Calibration chat — bottom-docked. Reuses StageInterview
                with no recall block + voiceSlot per the hotfix
                pattern. Visible once a calibration turn has occurred
                (or once the founder has calibrated some skills). */}
            {(question || messages.length === 0) && (
              <section className="mt-12 border border-rule bg-bg-2 px-7 py-6">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  Calibration · agent prompt
                </div>
                <StageInterview
                  ref={interviewRef}
                  question={question ?? {
                    meta: { number: 0, total: '~', phase: 'Calibration' },
                    text: 'Move chips into lanes, or tell me about a skill — I will calibrate as we go.',
                  }}
                  value={input}
                  onChange={setInput}
                  onSubmit={async (val) => {
                    const content = val.trim();
                    if (!content) return;
                    setInput('');
                    await sendMessage(content);
                  }}
                  disabled={disabled}
                  placeholder="Two sentences is enough. The honest one, not the polished one."
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
                />
              </section>
            )}
          </main>

          <aside className="grid content-start gap-6 lg:sticky lg:top-20 lg:self-start">
            {expectedProfile && expectedProfile.length > 0 && (
              <ExpectedProfilePanel entries={expectedProfile} />
            )}

            <StructuralBlocker
              count={blockerCount}
              onChoose={(choice) => {
                // Seed the calibration chat with a structured starter
                // tied to the chosen path. Mirrors the spec's "wire
                // these to the existing branching logic" — the
                // existing branching IS the calibration agent.
                const seed =
                  choice === 'teammate'
                    ? 'I want to talk through bringing on a teammate to cover the demanded-Strong skills I am below on.'
                    : choice === 'use_strengths'
                      ? 'Show me which directions could lean on my existing strengths instead of demanding the skills I am below on.'
                      : 'I want to keep this path and build the missing skills — slower start. What does that look like?';
                setInput(seed);
                interviewRef.current?.focus();
              }}
            />

            {/* Readiness */}
            <div className="border border-rule bg-bg-2 px-5 py-[18px]">
              <div className="mb-3.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                <span>Readiness</span>
                <span className="text-accent">{calibratedPct}% calibrated</span>
              </div>
              <div className="font-serif text-[36px] italic leading-none tracking-[-0.01em] text-accent">
                {calibratedCount} / {SKILL_KEYS.length}
              </div>
              <div className="relative mt-3.5 h-1 bg-rule">
                <div className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-500" style={{ width: `${calibratedPct}%` }} />
              </div>
              <p className="mt-2.5 font-mono text-[10px] leading-[1.6] tracking-[0.04em] text-muted">
                {SKILL_KEYS.length - calibratedCount > 0
                  ? `${SKILL_KEYS.length - calibratedCount} unknown${SKILL_KEYS.length - calibratedCount === 1 ? '' : 's'} remain. Mark each tier, then commit.`
                  : 'All 14 calibrated. Commit to advance.'}
              </p>
              <button
                type="button"
                onClick={() => { void deriveExpectedProfile(); }}
                disabled={!canDerive && !canCommit}
                className="mt-4 flex w-full items-center justify-center gap-2.5 bg-accent px-3 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isBusy && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
                {canCommit ? 'Commit Stage II' : deriveLabel}
                {!isBusy && <span aria-hidden="true">→</span>}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Internals                                                                 */
/* -------------------------------------------------------------------------- */

function PersonTab({
  label,
  roman,
  active,
  onClick,
}: {
  label:  string;
  roman:  string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-2 border-b-2 px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors',
        active
          ? 'border-accent text-fg'
          : 'border-transparent text-muted hover:text-fg',
      ].join(' ')}
    >
      <span className="font-serif text-[14px] italic normal-case tracking-[-0.01em] text-accent">{roman}</span>
      {label}
    </button>
  );
}

/**
 * Across-team strongest tier for a skill. Used to compute the
 * structural blocker count (a venture-level signal, not per-person).
 */
function strongestTier(inventory: SkillInventory, skill: SkillKey): SkillTier {
  const people = [inventory.founder, ...inventory.team];
  let max: SkillTier = 'unknown';
  for (const p of people) {
    const t = (p.tiers as Record<SkillKey, SkillTier>)[skill] ?? 'unknown';
    if (TIER_RANK[t] > TIER_RANK[max]) max = t;
  }
  return max;
}
