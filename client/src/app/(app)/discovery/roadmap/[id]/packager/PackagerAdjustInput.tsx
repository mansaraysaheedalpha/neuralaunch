"use client";

import { useState } from "react";
import { MAX_ADJUSTMENT_ROUNDS } from "@/lib/roadmap/service-packager/constants";

export interface PackagerAdjustInputProps {
  adjustmentsUsed: number;
  pending: boolean;
  onAdjust: (request: string) => void;
}

export function PackagerAdjustInput({
  adjustmentsUsed,
  pending,
  onAdjust,
}: PackagerAdjustInputProps) {
  const [draft, setDraft] = useState("");
  const remaining = Math.max(MAX_ADJUSTMENT_ROUNDS - adjustmentsUsed, 0);

  function submit() {
    const request = draft.trim();
    if (!request || pending || remaining === 0) return;
    onAdjust(request);
    setDraft("");
  }

  return (
    <section className="border border-rule-strong">
      <div className="flex justify-between border-b border-rule px-4 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        <span>Refine the package</span>
        <span className={remaining > 0 ? "text-accent" : ""}>
          {remaining} of {MAX_ADJUSTMENT_ROUNDS} remaining
        </span>
      </div>
      <label htmlFor="packager-refinement" className="sr-only">
        Package refinement request
      </label>
      <textarea
        id="packager-refinement"
        aria-describedby="packager-refinement-help"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={pending || remaining === 0}
        placeholder={
          remaining === 0
            ? "This package has used its refinement allowance."
            : "Change scope, positioning, inclusions, or the price logic…"
        }
        className="min-h-[96px] w-full resize-none bg-bg-2 px-4 py-3 font-serif text-[17px] italic text-fg outline-none placeholder:text-muted-2 disabled:opacity-45"
      />
      <p
        id="packager-refinement-help"
        className="border-t border-rule px-4 py-2 text-[11px] leading-relaxed text-muted"
      >
        Describe one concrete change. Pricing or scope changes will also update
        dependent scenarios and the prospect brief.
      </p>
      <div className="sticky bottom-0 z-10 flex justify-end border-t border-rule bg-bg p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] lg:static">
        <button
          type="button"
          onClick={submit}
          disabled={pending || remaining === 0 || !draft.trim()}
          className="bg-accent px-4 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-bg disabled:opacity-35"
        >
          {pending ? "Applying…" : "Apply refinement →"}
        </button>
      </div>
    </section>
  );
}
