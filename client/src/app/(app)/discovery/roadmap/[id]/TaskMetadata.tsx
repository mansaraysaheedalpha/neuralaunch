'use client';
// src/app/(app)/discovery/roadmap/[id]/TaskMetadata.tsx
//
// Pure read-only display of a roadmap task's static fields:
// description, time estimate, success criteria, rationale, and
// resources. No state — the founder cannot edit any of this from
// the task card. Extracted so InteractiveTaskCard stays under the
// 200-line component cap.

import { Clock, Target } from 'lucide-react';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';

export function TaskMetadata({ task }: { task: StoredRoadmapTask }) {
  return (
    <>
      <p className="text-xs text-muted-foreground leading-relaxed break-words">{task.description}</p>

      <div className="flex flex-wrap gap-3 mt-1">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" />{task.timeEstimate}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Target className="size-3" />{task.successCriteria}
        </span>
      </div>

      {task.rationale && (
        <p className="text-[11px] text-primary/70 italic border-t border-border pt-2 mt-1">
          {task.rationale}
        </p>
      )}

      {task.resources && task.resources.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.resources.map((r, i) => (
            <span key={i} className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5">
              {r}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
