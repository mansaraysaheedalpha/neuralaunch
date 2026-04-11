// src/inngest/client.ts
//
// Inngest client + the canonical event payload type map for NeuraLaunch.
//
// Every event the system fires is declared here with its full payload
// shape. The map is the SINGLE source of truth for what an Inngest
// event looks like at runtime — adding a new event is a two-step
// change: declare it here, then send it from the call site.
//
// Each event ALSO has a string constant declared next to its consumer
// (validation events live in `lib/validation/constants.ts`, the
// roadmap event lives in `lib/roadmap/constants.ts`, etc.). The
// constants are the source of truth for the literal strings that
// appear in `inngest.send({ name: ... })` calls; this file is the
// source of truth for the typed payload shapes.

import { Inngest } from 'inngest';

/**
 * NeuraLaunch's event payload type map.
 *
 * Inngest accepts arbitrary event names at runtime, but typing the
 * map gives us autocomplete and lets the compiler catch payload-shape
 * drift between the call site and the function handler.
 */
export type NeuraLaunchEvents = {
  /**
   * Fired when the discovery interview engine determines the belief
   * state is ready for synthesis (either the user explicitly asks for
   * a recommendation OR enough fields have been captured for
   * canSynthesise() to return true).
   *
   * Consumer: `discoverySessionFunction` in
   * `src/inngest/functions/discovery-session-function.ts`
   *
   * Pipeline: load belief state → summarise context → eliminate
   * alternatives → run targeted research → final synthesis → persist
   * Recommendation → warm up roadmap generation.
   */
  'discovery/synthesis.requested': {
    data: {
      sessionId: string;
      userId:    string;
    };
  };

  /**
   * Fired when a founder accepts a recommendation and the system
   * needs to generate the phased execution roadmap. Also fired
   * automatically by the discovery synthesis function as a warm-up
   * step so the roadmap is often ready by the time the founder clicks
   * "build my roadmap".
   *
   * Consumer: `roadmapGenerationFunction` in
   * `src/inngest/functions/roadmap-generation-function.ts`
   *
   * The literal name is exported as `ROADMAP_EVENT` from
   * `src/lib/roadmap/constants.ts` so call sites and the function
   * declaration share one constant.
   */
  'discovery/roadmap.requested': {
    data: {
      recommendationId: string;
      userId:           string;
    };
  };

  /**
   * Fired on the founder's HARD_CAP_ROUND pushback turn — the closing
   * move. The route persists the closing message and queues this
   * event; the worker generates a constrained alternative
   * recommendation built from the pushback transcript.
   *
   * Consumer: `pushbackAlternativeFunction` in
   * `src/inngest/functions/pushback-alternative-function.ts`
   *
   * The literal name is exported as `PUSHBACK_ALTERNATIVE_EVENT`
   * from `src/lib/discovery/constants.ts`.
   */
  'discovery/pushback.alternative.requested': {
    data: {
      recommendationId: string;
      userId:           string;
    };
  };

  /**
   * Fired by the validation reporting scheduler (cron) to enqueue
   * one report run per LIVE validation page, OR by an on-demand
   * trigger to force a report cycle for a specific page.
   *
   * Consumer: `validationReportingFunction` in
   * `src/inngest/functions/validation-reporting-function.ts`
   *
   * The literal name is exported as `VALIDATION_REPORTING_EVENT`
   * from `src/lib/validation/constants.ts`.
   */
  'validation/report.requested': {
    data: {
      pageId?: string; // undefined => process every LIVE page
    };
  };

  /**
   * Manual trigger for the validation lifecycle sweep (archive
   * stale drafts, archive expired live pages, purge old archived
   * events). The function ALSO runs on a daily cron — this event
   * is only used for ad-hoc admin runs.
   *
   * Consumer: `validationLifecycleFunction` in
   * `src/inngest/functions/validation-lifecycle-function.ts`
   *
   * The literal name is exported as `VALIDATION_LIFECYCLE_EVENT`
   * from `src/lib/validation/constants.ts`.
   */
  'validation/lifecycle.check': {
    data: Record<string, never>;
  };

  /**
   * Fired when the founder hits "What's Next?" on a roadmap that
   * either matches Scenario C or D directly OR has been released
   * from the diagnostic chat (Scenarios A/B). The worker reads the
   * full execution evidence base, runs speed calibration, and
   * generates the five-section continuation brief via Opus.
   *
   * Consumer: `continuationBriefFunction` in
   * `src/inngest/functions/continuation-brief-function.ts`
   *
   * The literal name is exported as `CONTINUATION_BRIEF_EVENT`
   * from `src/lib/continuation/constants.ts`.
   */
  'discovery/continuation.requested': {
    data: {
      roadmapId: string;
      userId:    string;
    };
  };
};

/**
 * The Inngest client.
 *
 * Reads INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY from the environment
 * automatically. The schema generic gives every `inngest.send()` call
 * site type-checking against the NeuraLaunchEvents map above.
 */
export const inngest = new Inngest({
  id: 'neuralaunch-agent',
});
