"use client";
// src/components/institute/tools/research/PlanReview.tsx
//
// Plan-review surface — the engine's plan engine ran on the founder's
// query and returned a research plan. The founder can edit it before
// approving. Institute hairline panel: mono eyebrow, editable plan
// textarea, accent approve CTA. Engine flow preserved verbatim (this
// was the existing plan_review stage from ResearchFlow).

import { useEffect, useState } from "react";

export interface PlanReviewProps {
  query: string;
  plan: string;
  estimatedTime: string;
  busy?: boolean;
  onApprove: (editedPlan: string) => void;
  onCancel: () => void;
}

export function PlanReview({
  query,
  plan,
  estimatedTime,
  busy,
  onApprove,
  onCancel,
}: PlanReviewProps) {
  const [draft, setDraft] = useState(plan);

  // Keep the textarea synced when the parent's plan updates (e.g. a
  // freshly loaded session).
  useEffect(() => {
    setDraft(plan);
  }, [plan]);

  function handleApprove() {
    const final = draft.trim();
    if (final.length === 0 || busy) return;
    onApprove(final);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Plan · review or edit · {estimatedTime}
        </p>
        <p className="font-serif text-[18px] italic leading-snug text-fg">
          {query}
        </p>
      </div>

      <label
        htmlFor="research-plan"
        className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted"
      >
        Editable research plan
      </label>
      <textarea
        id="research-plan"
        aria-describedby="research-plan-help"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={busy}
        rows={12}
        className="block w-full resize-y border border-rule bg-bg-2 px-4 py-3 font-sans text-[14px] leading-[1.6] text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-60"
      />
      <p
        id="research-plan-help"
        className="text-[12px] leading-relaxed text-muted"
      >
        Review the sources and questions before approving. Your edits are used
        for this research run.
      </p>

      <div className="sticky bottom-0 z-10 grid grid-cols-2 gap-3 border-t border-rule bg-bg py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:flex lg:flex-wrap lg:border-t-0 lg:py-0">
        <button
          type="button"
          onClick={handleApprove}
          disabled={draft.trim().length === 0 || busy}
          className="inline-flex items-center gap-2 bg-accent px-5 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-opacity hover:opacity-90 disabled:opacity-[0.35] disabled:cursor-not-allowed"
        >
          Approve plan · run research
          <span aria-hidden="true">→</span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="border border-rule-strong px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          ← Edit query
        </button>
      </div>
    </div>
  );
}
