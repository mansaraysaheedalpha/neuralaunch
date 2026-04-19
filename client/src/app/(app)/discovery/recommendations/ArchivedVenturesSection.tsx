'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Archive, RotateCcw } from 'lucide-react';
import { swapVentureStatus, type SwapResult } from '@/app/actions/ventures';
import { ReactivateDialog } from './ReactivateDialog';

export interface ArchivedVentureEntry {
  id:          string;
  name:        string;
  archivedAt:  string;
  cycleCount:  number;
}

export interface ActiveVentureEntry {
  id:   string;
  name: string;
}

interface ArchivedVenturesSectionProps {
  archived:    ArchivedVentureEntry[];
  /** Currently-active ventures (archivedAt === null && status === 'active'). */
  activeOptions: ActiveVentureEntry[];
  /** Tier cap — 1 for Execute, 3 for Compound, 0 for Free. */
  cap:         number;
  /** Tier label used in the confirmation copy. */
  tierLabel:   'Free' | 'Execute' | 'Compound';
}

function formatArchivedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year:  'numeric',
    month: 'short',
    day:   'numeric',
  });
}

/**
 * Renders the "Archived ventures" surface on the Sessions page.
 * Hidden entirely when the user has no archived ventures (the parent
 * only renders this when archived.length > 0, but we double-check
 * here for safety). Each card exposes a "Make active" button:
 *
 *   - Under cap → fire the swap immediately, no dialog.
 *   - At cap → open ReactivateDialog so the user picks which active
 *     venture to swap out.
 *
 * Optimistic UI: the clicked archived row greys out + the button
 * disables while the server action runs. On success we fire a
 * router.refresh() so the server-rendered list reconciles with the
 * new state (no local state manipulation — keeps this component
 * simple and the server authoritative).
 */
export function ArchivedVenturesSection({
  archived,
  activeOptions,
  cap,
  tierLabel,
}: ArchivedVenturesSectionProps) {
  const [, startTransition] = useTransition();
  const [dialogFor, setDialogFor] = useState<ArchivedVentureEntry | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const router = useRouter();

  const atCap = useMemo(
    () => cap > 0 && activeOptions.length >= cap,
    [cap, activeOptions.length],
  );

  const runSwap = useCallback(
    (ventureIdToActivate: string, ventureIdToArchive?: string) => {
      setSubmitting(true);
      setPendingId(ventureIdToActivate);
      startTransition(async () => {
        let result: SwapResult;
        try {
          result = await swapVentureStatus({ ventureIdToActivate, ventureIdToArchive });
        } catch (err) {
          toast.error('Swap failed — try again in a moment.');
          setSubmitting(false);
          setPendingId(null);
          setDialogFor(null);
          // Swallow error to the handler; log via console for devtools.
          console.error('swapVentureStatus threw', err);
          return;
        }

        if (result.ok) {
          if (result.archivedName) {
            toast.success(
              `Activated "${result.activatedName}". "${result.archivedName}" is archived but preserved.`,
            );
          } else {
            toast.success(`Activated "${result.activatedName}".`);
          }
          setDialogFor(null);
          // Refresh the server component to reconcile with the swapped state.
          router.refresh();
        } else {
          toast.error(swapErrorMessage(result));
        }

        setSubmitting(false);
        setPendingId(null);
      });
    },
    [router],
  );

  function handleMakeActive(v: ArchivedVentureEntry) {
    if (cap === 0) {
      toast.error('Your plan does not include active ventures. Upgrade to continue.');
      return;
    }
    if (atCap) {
      setDialogFor(v);
    } else {
      runSwap(v.id);
    }
  }

  if (archived.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Archived
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {archived.length} preserved
        </span>
      </div>

      {archived.map(v => {
        const isPending = pendingId === v.id && submitting;
        return (
          <div
            key={v.id}
            className={`flex items-start justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4 transition-opacity ${
              isPending ? 'opacity-60' : ''
            }`}
          >
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Archive className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                <p className="text-sm font-medium text-muted-foreground truncate">{v.name}</p>
                <span className="shrink-0 text-[9px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                  Archived
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {v.cycleCount === 0
                  ? 'No cycles yet'
                  : `${v.cycleCount} cycle${v.cycleCount === 1 ? '' : 's'}`}
                {' · '}
                Archived {formatArchivedAt(v.archivedAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleMakeActive(v)}
              disabled={submitting}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-transparent px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-slate-500 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              {isPending ? 'Activating…' : 'Make active'}
            </button>
          </div>
        );
      })}

      {dialogFor && (
        <ReactivateDialog
          activateName={dialogFor.name}
          activeOptions={activeOptions}
          cap={cap}
          tierLabel={tierLabel}
          submitting={submitting}
          onCancel={() => {
            if (!submitting) setDialogFor(null);
          }}
          onConfirm={archiveId => runSwap(dialogFor.id, archiveId)}
        />
      )}
    </section>
  );
}

function swapErrorMessage(result: Extract<SwapResult, { ok: false }>): string {
  if (result.message) return result.message;
  switch (result.reason) {
    case 'unauthorised':              return 'Please sign in again.';
    case 'rate-limited':              return 'Too many requests — try again in a minute.';
    case 'not-found':                 return 'Venture not found.';
    case 'activate-not-archived':     return 'That venture is already active.';
    case 'archive-not-active':        return 'Selected replacement is no longer active.';
    case 'activate-target-required':  return 'Pick a venture to archive in exchange.';
    case 'free-tier':                 return 'Upgrade to activate archived ventures.';
    case 'same-venture':              return 'Cannot swap a venture with itself.';
    default:                          return 'Swap failed — try again.';
  }
}
