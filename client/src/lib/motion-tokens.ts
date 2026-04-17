/**
 * Canonical motion tokens for Framer Motion / motion-react components.
 *
 * These mirror the Tailwind duration/easing extensions in tailwind.config.ts
 * so CSS transitions and JS animations share the same vocabulary.
 *
 * Usage with motion/react:
 *   transition={{ duration: DURATION.slow, ease: EASE.standard }}
 */

export const DURATION = {
  fast: 0.15,
  medium: 0.25,
  slow: 0.4,
} as const;

export const EASE = {
  standard: [0, 0, 0.2, 1] as const,
  emphasis: [0.22, 1, 0.36, 1] as const,
} as const;
