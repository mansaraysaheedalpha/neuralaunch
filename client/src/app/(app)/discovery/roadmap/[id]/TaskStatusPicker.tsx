'use client';
// src/app/(app)/discovery/roadmap/[id]/TaskStatusPicker.tsx

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { TaskStatus } from '@/lib/roadmap/checkin-types';

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed:   'Completed',
  blocked:     'Blocked',
};

const STATUS_DOT: Record<TaskStatus, string> = {
  not_started: 'bg-muted-foreground',
  in_progress: 'bg-primary',
  completed:   'bg-success',
  blocked:     'bg-destructive',
};

const STATUS_TRIGGER: Record<TaskStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  completed:   'bg-success/10 text-success',
  blocked:     'bg-destructive/10 text-destructive',
};

const ALL_STATUSES: TaskStatus[] = ['not_started', 'in_progress', 'completed', 'blocked'];

interface TaskStatusPickerProps {
  status:   TaskStatus;
  pending:  boolean;
  /** When true, the trigger is disabled with the dropdown closed.
   *  Used to gate status changes when the parent venture is paused
   *  or completed — the API also enforces, but preflight-disabling
   *  prevents the click in the first place. Optional title carries
   *  the reason into the native tooltip. */
  disabled?: boolean;
  disabledReason?: string | null;
  onChange: (status: TaskStatus) => void;
}

/**
 * TaskStatusPicker — styled dropdown replacing the native <select>.
 * Shows a badge-style trigger with status dot + chevron. On click,
 * opens a dropdown with colored options. After a successful change,
 * briefly flashes success before settling to the new color.
 */
export function TaskStatusPicker({ status, pending, disabled, disabledReason, onChange }: TaskStatusPickerProps) {
  const [open, setOpen] = useState(false);
  const [justChanged, setJustChanged] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside handler
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Brief success flash on status change
  useEffect(() => {
    if (!justChanged) return;
    const t = setTimeout(() => setJustChanged(false), 600);
    return () => clearTimeout(t);
  }, [justChanged]);

  function handleSelect(s: TaskStatus) {
    setOpen(false);
    if (s === status) return;
    setJustChanged(true);
    onChange(s);
  }

  const triggerClass = justChanged
    ? 'bg-success/10 text-success'
    : STATUS_TRIGGER[status];

  const isInert = pending || disabled === true;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => { if (!isInert) setOpen(v => !v); }}
        disabled={isInert}
        title={disabled ? (disabledReason ?? undefined) : undefined}
        className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium transition-colors duration-fast hover:border-foreground/30 disabled:opacity-50 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${triggerClass}`}
      >
        {pending ? (
          <Loader2 className="size-2.5 animate-spin" />
        ) : (
          <span className={`size-2 rounded-full ${justChanged ? 'bg-success' : STATUS_DOT[status]}`} />
        )}
        {STATUS_LABELS[status]}
        <ChevronDown className={`size-3 transition-transform duration-fast ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg border border-border bg-card shadow-lg py-1">
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors duration-fast"
            >
              <span className={`size-2 rounded-full ${STATUS_DOT[s]}`} />
              {STATUS_LABELS[s]}
              {s === status && <Check className="size-3 text-primary ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
