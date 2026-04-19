'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ActiveVentureOption {
  id:   string;
  name: string;
}

interface ReactivateDialogProps {
  /** Name of the archived venture being activated. */
  activateName: string;
  /** Active ventures the caller could archive in exchange. */
  activeOptions: ActiveVentureOption[];
  /** Tier cap — drives the cap message in the body copy. */
  cap:          number;
  /** Tier name for the cap message ("Execute", "Compound"). */
  tierLabel:    string;
  submitting:   boolean;
  onCancel:     () => void;
  onConfirm:    (archiveVentureId: string) => void;
}

/**
 * Confirmation dialog shown when the caller is at their tier cap and
 * has to pick which currently-active venture should be archived in
 * exchange for activating the selected archived venture. Controlled
 * component — parent owns submit state and dispatches the server
 * action; this component just picks the target.
 */
export function ReactivateDialog({
  activateName,
  activeOptions,
  cap,
  tierLabel,
  submitting,
  onCancel,
  onConfirm,
}: ReactivateDialogProps) {
  const [selected, setSelected] = useState<string | null>(
    activeOptions[0]?.id ?? null,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reactivate-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <h2 id="reactivate-dialog-title" className="text-sm font-semibold text-foreground">
              Pick a venture to archive
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="Cancel"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          You can have <span className="font-semibold text-foreground">{cap}</span> active{' '}
          {cap === 1 ? 'venture' : 'ventures'} on your {tierLabel} plan. Activating{' '}
          <span className="font-medium text-foreground">&ldquo;{activateName}&rdquo;</span>{' '}
          means archiving one of your currently-active ventures. Pick which one:
        </p>

        <ul className="mt-4 flex flex-col gap-1.5">
          {activeOptions.map(opt => (
            <li key={opt.id}>
              <label className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                selected === opt.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/40'
              }`}>
                <input
                  type="radio"
                  name="archive-target"
                  value={opt.id}
                  checked={selected === opt.id}
                  onChange={() => setSelected(opt.id)}
                  disabled={submitting}
                  className="size-3.5 accent-primary"
                />
                <span className="text-sm text-foreground truncate">{opt.name}</span>
              </label>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          The archived venture&apos;s roadmap, tasks, and history are preserved. Swap back
          anytime.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (selected) onConfirm(selected);
            }}
            disabled={submitting || !selected}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Swapping…' : 'Confirm swap'}
          </button>
        </div>
      </div>
    </div>
  );
}
