"use client";

import { ArchetypeSelector } from "./ArchetypeSelector";
import { CommonThreadPanel } from "./CommonThreadPanel";
import { ARCHETYPES } from "./data";
import { ProblemSpotlight } from "./ProblemSpotlight";
import { useArchetypeAutoplay } from "./useArchetypeAutoplay";

export function ProblemTabs() {
  const {
    activeIndex,
    setActive,
    pauseForSession,
    reducedMotion,
    containerRef,
    hoverHandlers,
  } = useArchetypeAutoplay(ARCHETYPES.length);

  const handleSelect = (index: number) => {
    pauseForSession();
    setActive(index);
  };

  const active = ARCHETYPES[activeIndex];

  return (
    <div
      ref={containerRef}
      className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12"
    >
      <div className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Who this is for
        </p>
        <h2
          id="problem-heading"
          className="mt-3 text-balance text-heading text-white"
        >
          You are not the first person to feel stuck.
        </h2>
        <p className="mt-5 max-w-md text-base leading-relaxed text-slate-300 lg:text-lg">
          The world has consultants &mdash; expensive, generic, built for
          companies with money. The world has AI tools &mdash; they hand you
          five options when you needed one answer, then leave. Nothing was
          built for the moments in between.
        </p>
        <p className="mt-6 text-sm font-medium text-gold">Until now.</p>

        <div className="mt-8">
          <ArchetypeSelector
            archetypes={ARCHETYPES}
            activeIndex={activeIndex}
            onSelect={handleSelect}
            reducedMotion={reducedMotion}
          />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:col-span-7">
        <ProblemSpotlight
          archetype={active}
          index={activeIndex}
          total={ARCHETYPES.length}
          reducedMotion={reducedMotion}
          hoverHandlers={hoverHandlers}
        />
        <CommonThreadPanel />
      </div>
    </div>
  );
}
