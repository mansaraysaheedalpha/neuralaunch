"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const AUTOPLAY_INTERVAL_MS = 7000;

export type AutoplayController = {
  activeIndex: number;
  setActive: (index: number) => void;
  pauseForSession: () => void;
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
 * Drives the differentiation-track autoplay loop. Pauses on:
 * - hover or focus inside the track or detail panel
 * - any manual pin click (permanent for the session)
 * - section being offscreen (IntersectionObserver, threshold 0.25)
 * - prefers-reduced-motion
 */
export function useDifferentiationAutoplay(
  count: number,
): AutoplayController {
  const reducedMotion = useReducedMotion() ?? false;
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [inView, setInView] = useState(false);
  const userPausedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
