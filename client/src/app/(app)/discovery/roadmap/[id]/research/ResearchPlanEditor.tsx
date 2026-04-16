'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchPlanEditor.tsx
//
// Step 2 of the research flow. Shows the agent's research plan in an
// editable textarea so the founder can refine it before execution.
// The founder can approve (start research) or revise (send back for
// a new plan).

import { useState } from 'react';
import { Clock, Pencil, Play } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export interface ResearchPlanEditorProps {
  plan:          string;
  estimatedTime: string;
  onApprove:     (editedPlan: string) => void;
  onRevise:      () => void;
  loading:       boolean;
}

/**
 * ResearchPlanEditor
 *
 * Renders the agent's research plan in an editable textarea. The
 * founder can modify the plan before approving execution. "Start
 * research" fires `onApprove` with the (possibly edited) plan text.
 * "Revise plan" fires `onRevise` so the parent can send edits back
 * to the plan route for a new plan.
 */
export function ResearchPlanEditor({
  plan,
  estimatedTime,
  onApprove,
  onRevise,
  loading,
}: ResearchPlanEditorProps) {
  const [editedPlan, setEditedPlan] = useState(plan);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-medium text-foreground">Research plan</p>
        <p className="text-[10px] text-muted-foreground">
          Review and edit before research begins. Add angles, narrow scope, or redirect focus.
        </p>
      </div>

      <Textarea
        value={editedPlan}
        onChange={e => setEditedPlan(e.target.value)}
        disabled={loading}
        rows={6}
        className="min-h-0 resize-none py-2 text-xs leading-relaxed"
      />

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="size-3 shrink-0" />
        <span>Estimated time: {estimatedTime}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApprove(editedPlan.trim())}
          disabled={editedPlan.trim().length === 0 || loading}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Play className="size-3 shrink-0" />
          Start research
        </button>

        <button
          type="button"
          onClick={onRevise}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <Pencil className="size-3 shrink-0" />
          Revise plan
        </button>
      </div>
    </div>
  );
}
