'use client';
// src/components/institute/tools/research/FollowUpComposer.tsx
//
// After a report lands, the founder can fire up to 5 follow-up
// rounds. Same engine; same Institute treatment scaled down — small
// hairline panel, mono caps eyebrow, accent submit.

import { useState } from 'react';
import { FOLLOWUP_MAX_ROUNDS } from '@/lib/roadmap/research-tool/constants';

export interface FollowUpComposerProps {
  /** Current round count — 1-indexed for display. */
  round:    number;
  busy?:    boolean;
  onSubmit: (query: string) => void;
}

export function FollowUpComposer({ round, busy, onSubmit }: FollowUpComposerProps) {
  const [q, setQ] = useState('');
  const atCap = round >= FOLLOWUP_MAX_ROUNDS;

  function handle() {
    const v = q.trim();
    if (v.length === 0 || busy || atCap) return;
    onSubmit(v);
    setQ('');
  }

  if (atCap) {
    return (
      <p className="border-l-2 border-rule-strong bg-bg-2 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Follow-up cap reached · {FOLLOWUP_MAX_ROUNDS} rounds. Start a new research session.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 border border-rule bg-bg-2 px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Follow-up · round {round + 1} / {FOLLOWUP_MAX_ROUNDS}
      </p>
      <textarea
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handle();
          }
        }}
        disabled={busy}
        rows={2}
        placeholder="Drill into something — narrow geography, dig on a finding, ask why?"
        className="block w-full resize-none border border-rule bg-bg px-3 py-2 font-sans text-[14px] text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">⌘ ↵ to send</span>
        <button
          type="button"
          onClick={handle}
          disabled={q.trim().length === 0 || busy}
          className="inline-flex items-center gap-2 bg-accent px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-opacity hover:opacity-90 disabled:opacity-[0.35] disabled:cursor-not-allowed"
        >
          {busy ? 'Sending…' : 'Send follow-up'}
          {!busy && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </div>
  );
}
