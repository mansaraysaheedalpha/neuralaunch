'use client';
// src/app/(app)/discovery/roadmap/[id]/RoadmapWritabilityContext.tsx
//
// Single source of truth for "can the founder write into this
// roadmap right now?" Threaded from the server component down through
// the entire roadmap tree so leaf interactive surfaces (status
// picker, tool launchers, check-in form, parking lot, What's Next)
// can preflight-disable instead of letting the founder click
// something that the API will only 403 after the fact.
//
// The decision lives on the server (page.tsx reads venture.status +
// archivedAt and computes the flag once per request) so the client
// never has to repeat the same logic — and the API-layer
// assertVentureWritable stays as defense-in-depth.

import { createContext, useContext, type ReactNode } from 'react';

export type ReadOnlyReason = 'paused' | 'completed' | 'archived';

export interface RoadmapWritability {
  /** True when the founder can submit check-ins, run tools, etc. */
  writable: boolean;
  /** When NOT writable, the specific reason — drives the banner copy. */
  readOnlyReason: ReadOnlyReason | null;
}

const RoadmapWritabilityContext = createContext<RoadmapWritability>({
  writable: true,
  readOnlyReason: null,
});

export function RoadmapWritabilityProvider({
  writable,
  readOnlyReason,
  children,
}: RoadmapWritability & { children: ReactNode }) {
  return (
    <RoadmapWritabilityContext.Provider value={{ writable, readOnlyReason }}>
      {children}
    </RoadmapWritabilityContext.Provider>
  );
}

/**
 * Hook for write-side leaf components. Default is writable=true so a
 * component used outside the provider (e.g. standalone tool view from
 * /tools/*) keeps working unchanged. Inside the roadmap provider the
 * value reflects the venture's actual state.
 */
export function useRoadmapWritability(): RoadmapWritability {
  return useContext(RoadmapWritabilityContext);
}

/**
 * One-line message rendered in disabled tooltips and aria-disabled
 * controls so the founder always understands *why* a button is
 * disabled. Returns null when writable.
 */
export function readOnlyMessage(reason: ReadOnlyReason | null): string | null {
  if (reason === 'paused')    return 'This venture is paused. Resume it from the Sessions tab to continue.';
  if (reason === 'completed') return 'This venture is complete. The roadmap is read-only.';
  if (reason === 'archived')  return 'This venture is archived. Restore it from the Sessions tab to continue.';
  return null;
}
