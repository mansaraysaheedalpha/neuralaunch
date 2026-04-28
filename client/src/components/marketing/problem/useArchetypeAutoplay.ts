"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const AUTOPLAY_INTERVAL_MS = 6000;

export type AutoplayController = {
  activeIndex: number;
  setActive: (index: number) => void;
  /** Mark autoplay as user-overridden — stays paused for the rest of
   *  the session. Manual selector clicks call this. */
  pauseForSession: () => void;
  /** Whether autoplay is fully disabled (reduced motion). Used by the
   *  selector to render the "Pick an archetype to see the shift" hint. */
  reducedMotion: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  hoverHandlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocusCapture: () => void;
    onBlurCapture: () => void;
  };
};

/**
 * Drives the archetype autoplay loop.
 *
 * Pauses on:
 * - hover or focus inside the spotlight pane (via hoverHandlers)
 * - any manual selector click (pauseForSession — permanent for session)
 * - section being offscreen (IntersectionObserver on containerRef)
 * - prefers-reduced-motion (autoplay never starts)
 */
export function useArchetypeAutoplay(count: number): AutoplayController {
  const reducedMotion = useReducedMotion() ?? false;
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [inView, setInView] = useState(false);
  const userPausedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Track whether the section is on screen.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Tick the autoplay when conditions allow.
  useEffect(() => {
    if (reducedMotion) return;
    if (userPausedRef.current) return;
    if (hovering) return;
    if (!inView) return;

    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % count);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, hovering, inView, reducedMotion]);

  return {
    activeIndex,
    setActive: (index: number) => {
      setActiveIndex(((index % count) + count) % count);
    },
    pauseForSession: () => {
      userPausedRef.current = true;
    },
    reducedMotion,
    containerRef,
    hoverHandlers: {
      onMouseEnter: () => setHovering(true),
      onMouseLeave: () => setHovering(false),
      onFocusCapture: () => setHovering(true),
      onBlurCapture: () => setHovering(false),
    },
  };
}
