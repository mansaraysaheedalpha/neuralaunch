"use client";

import { COMPETITORS } from "./data";
import { DifferentiationDetail } from "./DifferentiationDetail";
import { DifferentiationTrack } from "./DifferentiationTrack";
import { useDifferentiationAutoplay } from "./useDifferentiationAutoplay";

export function DifferentiationPanel() {
  const {
    activeIndex,
    setActive,
    pauseForSession,
    reducedMotion,
    containerRef,
    hoverHandlers,
  } = useDifferentiationAutoplay(COMPETITORS.length);

  const handleSelect = (i: number) => {
    pauseForSession();
    setActive(i);
  };

  const active = COMPETITORS[activeIndex];

  return (
    <div ref={containerRef} className="mx-auto mt-14 max-w-6xl">
      <DifferentiationTrack
        activeIndex={activeIndex}
        onSelect={handleSelect}
      />
      <DifferentiationDetail
        competitor={active}
        reducedMotion={reducedMotion}
        hoverHandlers={hoverHandlers}
      />
    </div>
  );
}
