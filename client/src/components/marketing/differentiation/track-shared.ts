import type { KeyboardEvent } from "react";

export const SPRING = {
  type: "spring" as const,
  stiffness: 240,
  damping: 28,
};

export const PIN_STAGGER_S = 0.06;
export const DETAIL_PANEL_ID = "differentiation-detail";

export type MotionProps = Record<string, unknown>;
export type PinMotionFn = (i: number) => MotionProps;

export type TrackVariantProps = {
  activeIndex: number;
  onSelect: (i: number) => void;
  handleKey: (e: KeyboardEvent<HTMLButtonElement>) => void;
  /**
   * Callback ref helper — children call this from each tab's own
   * callback ref to register the element with the parent. Replaces
   * the previous tabsRef prop, which the react-hooks/refs lint rule
   * flagged as a ref-during-render at the parent's pass-through
   * point. The parent owns its own MutableRefObject and writes to
   * it inside this callback.
   */
  registerTab: (index: number, el: HTMLButtonElement | null) => void;
  lineMotion: MotionProps;
  pinMotion: PinMotionFn;
};

export function makeArrowKeyHandler(
  total: number,
  activeIndex: number,
  onSelect: (i: number) => void,
  /**
   * Focus callback invoked after onSelect lands. The caller closes
   * over its own tab ref inside this callback (e.g.
   * `(i) => tabsRef.current[i]?.focus()`). The helper itself never
   * receives the ref, so the react-hooks/refs lint rule has nothing
   * to flag at the call site — passing a ref directly was tripping
   * its "ref read during render" detector even though the read
   * actually happens inside the returned event handler.
   */
  focusItem: (index: number) => void,
) {
  return (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = total - 1;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = activeIndex === last ? 0 : activeIndex + 1;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = activeIndex === 0 ? last : activeIndex - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    if (next === null) return;
    e.preventDefault();
    onSelect(next);
    focusItem(next);
  };
}
