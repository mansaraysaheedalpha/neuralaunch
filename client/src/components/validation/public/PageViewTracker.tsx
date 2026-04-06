'use client';
// src/components/validation/public/PageViewTracker.tsx

import { useEffect, useRef } from 'react';

interface PageViewTrackerProps {
  pageSlug: string;
  onExitIntent?: () => void;
}

/**
 * PageViewTracker
 *
 * Client-side analytics beacon for the public validation landing page.
 * Fires a single page_view on mount, tracks scroll depth milestones
 * (25/50/75/100), and detects exit intent (cursor leaving the top of the
 * viewport on desktop) to trigger an exit survey.
 *
 * All events are best-effort — a failure must never break visitor UX.
 */
export function PageViewTracker({ pageSlug, onExitIntent }: PageViewTrackerProps) {
  const depthsReached = useRef<Set<number>>(new Set());
  const pageViewed    = useRef(false);
  const exitFired     = useRef(false);

  useEffect(() => {
    if (pageViewed.current) return;
    pageViewed.current = true;

    // Fire page_view immediately
    const fire = (payload: Record<string, unknown>) => {
      try {
        void fetch('/api/lp/analytics', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ slug: pageSlug, ...payload }),
          keepalive: true,
        });
      } catch { /* non-fatal */ }
    };

    fire({ event: 'page_view' });

    // Scroll depth tracking
    const MILESTONES = [25, 50, 75, 100];
    function handleScroll() {
      const scrollTop   = window.scrollY;
      const docHeight   = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const percentage  = Math.min(100, Math.round((scrollTop / docHeight) * 100));
      for (const m of MILESTONES) {
        if (percentage >= m && !depthsReached.current.has(m)) {
          depthsReached.current.add(m);
          fire({ event: 'scroll_depth', depth: m });
        }
      }
    }

    // Exit-intent detection — desktop only (cursor leaves top of viewport)
    function handleMouseLeave(e: MouseEvent) {
      if (exitFired.current) return;
      if (e.clientY > 10) return;
      exitFired.current = true;
      fire({ event: 'exit_intent' });
      onExitIntent?.();
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [pageSlug, onExitIntent]);

  return null;
}
