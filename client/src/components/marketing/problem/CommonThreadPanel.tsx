import { ChevronRight } from "lucide-react";

const PHASES = [
  "Discovery",
  "Recommendation",
  "Roadmap",
  "Execution",
  "Continuation",
];

/**
 * Decorative panel that sits below the ProblemSpotlight on lg+ to fill
 * the empty right-column space and tie all five archetypes together.
 * The 5-phase arc mirrors the journey-band shown elsewhere on the page
 * (HowItWorks, Differentiation), so the "same arc, different starting
 * point" point reads as one continuous design system.
 */
export function CommonThreadPanel() {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="rounded-xl border border-slate-800 bg-navy-900/40 p-5 lg:p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-success">
        Same arc. Different starting point.
      </p>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">
        Whichever archetype you walked in as, the shape of what follows is
        the same. NeuraLaunch sizes every phase to your hours, your
        resources, and your constraints &mdash; not a generic playbook.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {PHASES.map((phase, i) => (
          <div key={phase} className="flex items-center gap-1.5">
            <span className="rounded-full border border-slate-700 bg-navy-950 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-300">
              {phase}
            </span>
            {i < PHASES.length - 1 && (
              <ChevronRight className="h-3 w-3 text-slate-600" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
