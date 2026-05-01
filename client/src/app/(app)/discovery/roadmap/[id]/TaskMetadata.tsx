'use client';
// src/app/(app)/discovery/roadmap/[id]/TaskMetadata.tsx
//
// Pure read-only display of a roadmap task's static fields. Restructured
// from a flat inline-icon row to a deliberate three-zone composition
// matching the design tool:
//
//   1. Description paragraph (top, full width)
//   2. Two-column labelled metadata strip — TIME BUDGET · DONE WHEN —
//      each in its own bordered cell so the eye reads them as parallel
//      facts, not a comma-separated caption
//   3. "WHY THIS MATTERS" gold-tinted callout — the rationale is the
//      reason a task is on the roadmap, and the design tool surfaces
//      it as a real card with a gold left-rail + italic body, not a
//      one-line italic afterthought
//   4. Resource chips at the bottom — small pills with a leading Link
//      icon so each chip reads as "this is a thing you can open"

import { Clock, Target, Link as LinkIcon } from 'lucide-react';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';

export function TaskMetadata({ task }: { task: StoredRoadmapTask }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground/85 leading-relaxed break-words">{task.description}</p>

      {/* Two-column metadata strip — replaces the prior inline icon
          spans. Each cell carries a small uppercase eyebrow label and
          a slightly larger value line so the founder reads "this is
          your time budget" and "this is the done-when criteria" as
          parallel facts. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <div className="bg-card p-3 flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            <Clock className="size-3" aria-hidden="true" />
            Time budget
          </p>
          <p className="text-[13px] font-semibold text-foreground tabular-nums">
            {task.timeEstimate}
          </p>
        </div>
        <div className="bg-card p-3 flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            <Target className="size-3" aria-hidden="true" />
            Done when
          </p>
          <p className="text-[13px] text-foreground/90 leading-snug">
            {task.successCriteria}
          </p>
        </div>
      </div>

      {/* WHY THIS MATTERS — gold-tinted callout. The rationale is the
          most important piece of context on a task because it answers
          "why am I doing this at all" — the question every founder
          asks at week 4 of execution. Promoting it from a one-line
          italic afterthought to a real card is the single biggest
          improvement on the expanded surface. */}
      {task.rationale && (
        <div className="rounded-lg border border-gold/25 bg-gold/[0.04] border-l-[3px] border-l-gold px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold mb-1.5">
            Why this matters
          </p>
          <p className="text-[13px] italic text-foreground/85 leading-relaxed">
            {task.rationale}
          </p>
        </div>
      )}

      {/* Resource chips — each pill carries a small Link icon so the
          founder reads them as "things to open." Was flat slate
          background-only chips before. */}
      {task.resources && task.resources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.resources.map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-card border border-border rounded-md px-2 py-1"
            >
              <LinkIcon className="size-2.5 text-muted-foreground/70" aria-hidden="true" />
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
