'use client';
// src/app/(app)/discovery/roadmap/[id]/TaskMetadata.tsx
//
// Pure read-only display of a roadmap task's static fields. Mirrors
// the design tool's expanded task layout:
//
//   1. Description paragraph at the top — text-base for comfortable
//      reading (was text-xs before, which was too small for body)
//   2. Two-column labelled metadata strip — TIME BUDGET / DONE WHEN.
//      Bigger eyebrow text + value text + generous per-cell padding
//      so each fact has room to breathe. (No DEPENDS ON column —
//      the schema doesn't carry that field today.)
//   3. WHY THIS MATTERS gold-tinted callout — bigger eyebrow, larger
//      italic body. The rationale is the answer to "why am I doing
//      this at all" and gets the most prominent treatment.
//   4. Resource chips at the bottom — pills with leading Link icons.

import { Link as LinkIcon } from 'lucide-react';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';

export function TaskMetadata({ task }: { task: StoredRoadmapTask }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Body description — design-tool spec: 14px / 1.65 leading.
          Was text-base (16px) before; the spec calls for text-sm
          with extra leading to give the long task descriptions room
          to breathe vertically while staying compact horizontally. */}
      <p className="text-sm text-foreground/90 leading-[1.65] break-words">{task.description}</p>

      {/* Metadata strip — labelled cells, gap-px between them creates
          the divider effect via the parent's bg-border showing through. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <div className="bg-card px-4 py-3 flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
            Time budget
          </p>
          <p className="text-[13.5px] font-mono text-foreground tabular-nums">
            {task.timeEstimate}
          </p>
        </div>
        <div className="bg-card px-4 py-3 flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
            Done when
          </p>
          <p className="text-[13.5px] text-foreground/95 leading-snug">
            {task.successCriteria}
          </p>
        </div>
      </div>

      {/* WHY THIS MATTERS — gold-tinted callout. Per the design
          tool, the body is GOLD italic (not slate) so the eyebrow +
          body read as one continuous gold idea, not a slate paragraph
          in a gold frame. The slightly muted gold/85 keeps the body
          readable next to the punchier gold eyebrow. */}
      {task.rationale && (
        <div className="rounded-lg border border-gold/25 bg-gold/[0.04] border-l-[3px] border-l-gold px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold mb-2">
            Why this matters
          </p>
          <p className="text-[13.5px] italic text-gold/85 leading-relaxed">
            {task.rationale}
          </p>
        </div>
      )}

      {/* Resource chips — each pill carries a small Link icon. Sized
          to the spec's 11.5px so they read as supporting metadata,
          not primary content. */}
      {task.resources && task.resources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {task.resources.map((r, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground bg-card border border-border rounded-md px-2.5 py-1.5"
            >
              <LinkIcon className="size-3 text-muted-foreground/70" aria-hidden="true" />
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
