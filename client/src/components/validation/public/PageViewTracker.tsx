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
 *
 * Emits:
 *   - page_view  : once on mount
 *   - scroll_depth : at 25 / 50 / 75 / 100% milestones
 *   - exit_intent : when the visitor is leaving the page
 *
 * Exit-intent detection is multi-signal so it works on both desktop and
 * mobile:
 *
 *   1. Desktop cursor leaves the top of the viewport → immediate fire.
 *   2. pagehide (tab close, back navigation) → immediate fire via Beacon.
 *      This is the terminal signal; fire first and let the overlay
 *      callback do nothing since the page is going away.
 *   3. visibilitychange → 'hidden' on mobile (swipe to home, tab switch)
 *      starts a 30-second timer. If visibility returns before it fires,
 *      the timer is cancelled — tab switches are not exits. If the
 *      timer elapses while still hidden, fire the exit-intent beacon.
 *
 * All events are best-effort — a failure must never break visitor UX.
 * Uses navigator.sendBeacon for unload-time events so the browser
 * actually delivers them (fetch with keepalive is unreliable here).
 */
export function PageViewTracker({ pageSlug, onExitIntent }: PageViewTrackerProps) {
  const depthsReached = useRef<Set<number>>(new Set());
  const pageViewed    = useRef(false);
  const exitFired     = useRef(false);

  useEffect(() => {
    if (pageViewed.current) return;
    pageViewed.current = true;

    const fire = (payload: Record<string, unknown>, useBeacon = false): void => {
      const body = JSON.stringify({ slug: pageSlug, ...payload });
      try {
        if (useBeacon && typeof navigator.sendBeacon === 'function') {
          // sendBeacon is the only reliable transport during pagehide
          navigator.sendBeacon(
            '/api/lp/analytics',
            new Blob([body], { type: 'application/json' }),
          );
          return;
        }
        void fetch('/api/lp/analytics', {
          method:    'POST',
          headers:   { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        });
      } catch { /* non-fatal */ }
    };

    const fireExitOnce = (viaBeacon: boolean): void => {
      if (exitFired.current) return;
      exitFired.current = true;
      fire({ event: 'exit_intent' }, viaBeacon);
      // Only invoke the UI callback for in-page exits (not unload — the
      // page is going away, the overlay wouldn't be visible anyway)
      if (!viaBeacon) onExitIntent?.();
    };

    // --- Fire page_view ---
    fire({ event: 'page_view' });

    // --- Scroll depth tracking ---
    const MILESTONES = [25, 50, 75, 100];
    function handleScroll() {
      const scrollTop  = window.scrollY;
      const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const percentage = Math.min(100, Math.round((scrollTop / docHeight) * 100));
      for (const m of MILESTONES) {
        if (percentage >= m && !depthsReached.current.has(m)) {
          depthsReached.current.add(m);
          fire({ event: 'scroll_depth', depth: m });
        }
      }
    }

    // --- Desktop mouseleave (top edge) ---
    function handleMouseLeave(e: MouseEvent) {
      if (e.clientY > 10) return;
      fireExitOnce(false);
    }

    // --- pagehide: terminal, use Beacon ---
    function handlePagehide() {
      fireExitOnce(true);
    }

    // --- visibilitychange: maybe-exit, debounced ---
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    const HIDDEN_TIMEOUT_MS = 30_000;

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        if (hiddenTimer !== null) return;
        hiddenTimer = setTimeout(() => {
          hiddenTimer = null;
          if (document.visibilityState === 'hidden') {
            // Still hidden after the grace period — treat as exit
            fireExitOnce(true);
          }
        }, HIDDEN_TIMEOUT_MS);
      } else if (hiddenTimer !== null) {
        // Visibility returned before the timer — cancel
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.documentElement.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('pagehide', handlePagehide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('pagehide', handlePagehide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (hiddenTimer !== null) clearTimeout(hiddenTimer);
    };
  }, [pageSlug, onExitIntent]);

  return null;
}
