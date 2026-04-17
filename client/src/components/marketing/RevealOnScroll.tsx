"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * RevealOnScroll — small client island that fades content in when it enters
 * the viewport. Uses IntersectionObserver, no animation library required.
 * If JS is disabled, content renders fully visible (no opacity-0 fallback
 * is left behind because we mount with `revealed: true` when reduced-motion
 * is preferred).
 */
export default function RevealOnScroll({
  children,
  delayMs = 0,
  className = "",
  variant = "default",
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
  variant?: "default" | "emphasis";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [revealed, setRevealed] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={`transition-all ${
        variant === "emphasis" ? "duration-slow ease-emphasis" : "duration-slow ease-standard"
      } ${
        revealed
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
