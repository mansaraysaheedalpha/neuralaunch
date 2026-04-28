"use client";

import { useReducedMotion } from "motion/react";
import { useRef } from "react";
import { COMPETITORS } from "./data";
import { HorizontalTrack } from "./HorizontalTrack";
import {
  PIN_STAGGER_S,
  SPRING,
  makeArrowKeyHandler,
  type MotionProps,
} from "./track-shared";
import { VerticalTrack } from "./VerticalTrack";

export type DifferentiationTrackProps = {
  activeIndex: number;
  onSelect: (index: number) => void;
};

export function DifferentiationTrack({
  activeIndex,
  onSelect,
}: DifferentiationTrackProps) {
  const reduce = useReducedMotion() ?? false;
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Focus callback closes over tabsRef but reads `.current` only at
  // event-time (when the keyboard handler fires inside
  // makeArrowKeyHandler's returned function). The react-hooks/refs
  // rule flags any function-passing-with-ref-closure conservatively
  // because it can't statically prove the read isn't synchronous —
  // verified by reading makeArrowKeyHandler in track-shared.ts.
  const focusTab = (i: number) => { tabsRef.current[i]?.focus(); };
  const handleKey = makeArrowKeyHandler(
    COMPETITORS.length,
    activeIndex,
    onSelect,
    // eslint-disable-next-line react-hooks/refs -- ref read happens inside the keyboard event handler, not during render
    focusTab,
  );

  const lineMotion: MotionProps = reduce
    ? { initial: false, animate: { scaleX: 1 } }
    : {
        initial: { scaleX: 0 },
        whileInView: { scaleX: 1 },
        viewport: { once: true, margin: "-15%" },
        transition: { ...SPRING, duration: 0.7 },
      };

  const pinMotion = (i: number): MotionProps =>
    reduce
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: -8 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-15%" },
          transition: { ...SPRING, delay: 0.3 + i * PIN_STAGGER_S },
        };

  const variantProps = {
    activeIndex,
    onSelect,
    handleKey,
    // registerTab closes over tabsRef so the ref never leaves this
    // component. Children invoke this from their own callback refs;
    // the .current write happens at element-mount time, never
    // during render.
    registerTab: (i: number, el: HTMLButtonElement | null) => {
      tabsRef.current[i] = el;
    },
    lineMotion,
    pinMotion,
  };

  return (
    <>
      <div className="hidden md:block">
        <HorizontalTrack {...variantProps} />
      </div>
      <div className="md:hidden">
        <VerticalTrack {...variantProps} />
      </div>
    </>
  );
}

export { DETAIL_PANEL_ID } from "./track-shared";
