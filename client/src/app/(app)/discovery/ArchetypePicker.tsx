'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { AudienceType } from '@/lib/discovery';
import { DiscoveryChat } from '@/components/discovery';
import type { Recommendation } from '@/lib/discovery/client';

// ---------------------------------------------------------------------------
// Archetype options — copy approved 2026-05-11.
// ---------------------------------------------------------------------------

type ArchetypeOption =
  | {
      id:           'no_idea';
      label:        string;
      description:  string;
    }
  | {
      id:           AudienceType;
      label:        string;
      description:  string;
    };

const ARCHETYPES: ArchetypeOption[] = [
  {
    id:          'no_idea',
    label:       "I don't have a business idea yet",
    description: 'Define what kind of outcome would fit your life, then we find the idea together.',
  },
  {
    id:          'LOST_GRADUATE',
    label:       "I'm early in my career and figuring out my direction",
    description: 'Early career, weighing whether to build something instead of (or alongside) a traditional job.',
  },
  {
    id:          'ASPIRING_BUILDER',
    label:       'I have an idea I want to build',
    description: 'You know roughly what you want to make; we help you decide whether and how.',
  },
  {
    id:          'STUCK_FOUNDER',
    label:       "I've started something and I'm stuck",
    description: 'A venture is already underway and the path forward is unclear.',
  },
  {
    id:          'ESTABLISHED_OWNER',
    label:       'I run a business and want to grow it',
    description: 'Running operation, looking for the next leverage point.',
  },
  {
    id:          'MID_JOURNEY_PROFESSIONAL',
    label:       "I'm mid-career, thinking about a change",
    description: 'Considering leaving employment to build something, evaluating the trade-offs.',
  },
];

// ---------------------------------------------------------------------------
// Picker component
// ---------------------------------------------------------------------------

interface ArchetypePickerProps {
  firstName:         string;
  hasFounderProfile: boolean;
  isFirstSession:    boolean;
}

/**
 * ArchetypePicker
 *
 * 6-option selection surface that replaces the direct-into-chat
 * behaviour on /discovery when NEXT_PUBLIC_NO_IDEA_ENABLED is set.
 *
 * Selection routing:
 *   - 'no_idea'        → navigate to /discovery/no-idea/mindset (Stage 0)
 *   - any other        → mount DiscoveryChat with audienceType preseed
 *                        and scenario = fresh_start (when the founder
 *                        already has a FounderProfile) or first_interview
 *                        (when not).
 *
 * The 'fork_continuation' scenario is NOT reachable from this surface
 * — founders arrive at that path via continuation briefs from a paused
 * or completed roadmap, not by self-pick.
 */
export function ArchetypePicker({ firstName, hasFounderProfile, isFirstSession }: ArchetypePickerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<ArchetypeOption | null>(null);

  // Once a non-no-idea archetype is picked, render DiscoveryChat with
  // the audience preseed. The chat's useDiscoverySession hook will
  // include scenario + preseededAudienceType in its session-create
  // POST, and audienceTypeLocked flows through createInterviewState.
  if (chosen && chosen.id !== 'no_idea') {
    return (
      <DiscoveryChat
        firstName={firstName}
        isFirstSession={isFirstSession}
        onComplete={(rec: Recommendation, conversationId: string) => {
          const dest = conversationId
            ? `/discovery/recommendation?from=${conversationId}`
            : '/discovery/recommendation';
          router.push(dest);
        }}
        preseed={{
          audienceType: chosen.id,
          scenario:     hasFounderProfile ? 'fresh_start' : 'first_interview',
        }}
      />
    );
  }

  const handlePick = (opt: ArchetypeOption) => {
    if (opt.id === 'no_idea') {
      startTransition(() => router.push('/discovery/no-idea/mindset'));
      return;
    }
    setChosen(opt);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-3xl">
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          {firstName ? `${firstName}, where are you starting from?` : 'Where are you starting from?'}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Each option leads to a different experience built for that situation. Pick the one that fits.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ARCHETYPES.map(opt => (
            <button
              key={opt.id}
              type="button"
              disabled={pending}
              onClick={() => handlePick(opt)}
              className="group text-left rounded-xl border border-border bg-card/70 hover:bg-card hover:border-primary/40 px-4 py-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-sm font-medium text-foreground group-hover:text-primary">
                {opt.label}
              </div>
              <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {opt.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
