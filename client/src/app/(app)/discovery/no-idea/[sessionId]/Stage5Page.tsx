// src/app/(app)/discovery/no-idea/[sessionId]/Stage5Page.tsx
//
// Server Component — composes the Stage 5 pre-synthesis review surface.
// Renders header + banner + cascade-stale banner (when set) + chosen
// panel + reserves list + the orchestrating Stage5Client (which owns
// the CTA + in-flight/failure/success transitions).
//
// Inputs are pre-loaded by the dispatcher (no-idea/[sessionId]/page.tsx)
// so this component does not touch Prisma directly — it stays pure
// rendering + composition. Copy locked in docs/stage5-copy-review.md
// § A.

import { Stage5Banner } from './Stage5Banner';
import { Stage5ChosenPanel } from './Stage5ChosenPanel';
import { Stage5ReservesList } from './Stage5ReservesList';
import { Stage5CascadeBanner } from './Stage5CascadeBanner';
import { Stage5Client } from './Stage5Client';
import type {
  ChosenOpportunitySnapshot,
  ReserveOpportunity,
} from '@/lib/ideation/stage5-handoff/schema';

interface Stage5PageProps {
  sessionId:             string;
  chosen:                ChosenOpportunitySnapshot;
  reserves:              ReadonlyArray<ReserveOpportunity>;
  requiresRederivation:  boolean;
  /** Set when a Stage 5 synthesis job already exists for this session. */
  existingJobId:         string | null;
  /** Sanitised error message from the last failed run (if any). */
  lastFailureMessage:    string | null;
}

export function Stage5Page({
  sessionId,
  chosen,
  reserves,
  requiresRederivation,
  existingJobId,
  lastFailureMessage,
}: Stage5PageProps) {
  return (
    <div className="flex flex-col h-full bg-background">
      <Stage5Banner sessionId={sessionId} />
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <header>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Pre-synthesis review · Validation Handoff
            </p>
            <h1 className="text-2xl font-semibold text-foreground">
              Your handoff to validation — Stage 5 of 5
            </h1>
          </header>

          {requiresRederivation && (
            <Stage5CascadeBanner sessionId={sessionId} />
          )}

          <Stage5ChosenPanel chosen={chosen} />
          <Stage5ReservesList reserves={reserves} />

          <Stage5Client
            sessionId={sessionId}
            initialJobId={existingJobId}
            initialFailureMessage={lastFailureMessage}
            cascadeStale={requiresRederivation}
          />

          <footer className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Stage 5 of 5 · Synthesis happens once. You can re-fire it from the recommendation review if upstream evidence changes.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
