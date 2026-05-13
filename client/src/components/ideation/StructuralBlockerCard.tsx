'use client';

import { useState, useTransition } from 'react';
import { AlertOctagon, ArrowRight } from 'lucide-react';
import type { StructuralBlocker } from '@/lib/ideation/stage2-requirements/schema';
import type { StructuralBlockerChoice } from '@neuralaunch/constants';

interface StructuralBlockerCardProps {
  blocker:          StructuralBlocker;
  /** Disabled when the document is committed — choice is frozen. */
  readOnly?:        boolean;
  /** Returns a Promise so the card can show pending state. */
  onChoose:         (choice: StructuralBlockerChoice, notes: string | null) => Promise<void>;
}

/**
 * Soft-warning card. Renders only when the blocker is triggered; the
 * founder picks one of three paths plus optional notes. The choice
 * is recorded on the artifact but doesn't change the constraint
 * computation — adding a teammate that fills the gap is what flips
 * `triggered` back to false on the next composer pass.
 *
 * TODO(copy): final wording on the headline, body, and per-choice
 * descriptions pending product-voice approval.
 */
export function StructuralBlockerCard({
  blocker,
  readOnly = false,
  onChoose,
}: StructuralBlockerCardProps) {
  const [notes, setNotes] = useState<string>(blocker.notes ?? '');
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!blocker.triggered) return null;

  const choose = (choice: StructuralBlockerChoice) => {
    startTransition(async () => {
      setError(null);
      try {
        await onChoose(choice, notes.trim() || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your choice');
      }
    });
  };

  return (
    <div className="rounded-lg border border-gold/40 bg-gold/5 px-4 py-4">
      <header className="flex items-start gap-2 mb-3">
        <AlertOctagon className="size-5 text-gold shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            This outcome looks structurally hard to reach with the current inventory
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Two or more critical skills in the Expected Profile sit below the tier the outcome demands. That doesn&apos;t mean stop — but it does mean the next stage will be working with a real constraint. Pick the path that fits.
          </p>
        </div>
      </header>

      <div className="space-y-2 mb-4">
        <ChoiceRow
          choice="revisit_outcome"
          label="Revisit the outcome"
          description="Go back to Stage 1 and tighten what you&apos;re aiming for. Sometimes the right move is a less ambitious shape that fits what you actually have."
          current={blocker.founderChoice}
          disabled={readOnly || busy}
          onPick={() => choose('revisit_outcome')}
        />
        <ChoiceRow
          choice="plan_team_recruit"
          label="Plan to recruit"
          description="Keep the outcome, plan to fill the gap with a co-founder or hire. The next stages will know your skill profile assumes a team you don&apos;t have yet."
          current={blocker.founderChoice}
          disabled={readOnly || busy}
          onPick={() => choose('plan_team_recruit')}
        />
        <ChoiceRow
          choice="pushed_back_and_committed"
          label="I disagree — commit anyway"
          description="You think the Expected Profile got this wrong, or you&apos;ll grow into the gap mid-build. Logged on the record."
          current={blocker.founderChoice}
          disabled={readOnly || busy}
          onPick={() => choose('pushed_back_and_committed')}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="blocker-notes" className="text-xs text-muted-foreground">
          Notes (optional) — what your choice actually means for how you&apos;ll proceed.
        </label>
        <textarea
          id="blocker-notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={readOnly || busy}
          maxLength={800}
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-gold/40"
          placeholder="Optional context the next stage should know about your choice."
        />
      </div>

      {error && (
        <div className="mt-3 text-xs text-destructive">{error}</div>
      )}
    </div>
  );
}

interface ChoiceRowProps {
  choice:      StructuralBlockerChoice;
  label:       string;
  description: string;
  current:     StructuralBlockerChoice;
  disabled:    boolean;
  onPick:      () => void;
}

function ChoiceRow({ choice, label, description, current, disabled, onPick }: ChoiceRowProps) {
  const selected = current === choice;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`group w-full text-left rounded-md border px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        selected
          ? 'border-gold bg-gold/10'
          : 'border-border bg-background/40 hover:border-gold/40 hover:bg-gold/5'
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        {selected && <ArrowRight className="size-3 text-gold" />}
        {label}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </button>
  );
}

