'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchPlanEditor.tsx
//
// Step 2 of the research flow. Shows the agent's research plan in an
// editable textarea so the founder can refine it before execution.
// The founder can approve (start research) or revise (send back for
// a new plan).

import { useState } from 'react';
import { Clock, Play } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export interface ResearchPlanEditorProps {
  plan:          string;
  estimatedTime: string;
  onApprove:     (editedPlan: string) => void;
  loading:       boolean;
}

/**
 * ResearchPlanEditor
 *
 * Renders the agent's research plan in an editable textarea. The
 * founder modifies the plan inline — the textarea IS the revision
 * surface — and "Start research" fires onApprove with the (possibly
 * edited) plan text.
 *
 * An earlier "Revise plan" button that flipped the stage back to the
 * query step was removed on 2026-04-21: it destroyed the entire plan
 * on click instead of letting the founder refine it. Inline editing
 * in the textarea already covers the revision use case — the extra
 * button only created a footgun.
 */
export function ResearchPlanEditor({
  plan,
  estimatedTime,
  onApprove,
  loading,
}: ResearchPlanEditorProps) {
  const [editedPlan, setEditedPlan] = useState(plan);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-medium text-foreground">Research plan</p>
        <p className="text-[10px] text-muted-foreground">
          Edit the plan directly — add angles, narrow scope, redirect focus. When ready, click Start research.
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
      </div>
    </div>
  );
}
