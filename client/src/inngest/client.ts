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
 *
 * Distributed-trace stitching: seven event types (the 6 Tier-1 tool
 * events + `discovery/transformation.requested`) carry optional
 * `sentryTrace?` and `baggage?` fields. Routes that send these
 * events propagate trace headers via `lib/tool-jobs/queue.ts`'s
 * helper (Tier-1 tools) or inline (transformation). Workers gate on
 * presence via `withDistributedTrace` — absent headers cleanly
 * make the worker a trace root. The deferred event types
 * (`discovery/synthesis.requested`, `discovery/roadmap.requested`,
 * `discovery/pushback.alternative.requested`,
 * `discovery/continuation.requested`,
 * `discovery/conversation.title.requested`, account-deletion) do
 * NOT carry these fields today; their workers stay trace roots
 * until route-side propagation lands in a follow-up ticket. Worker
 * code requires zero changes when that happens.
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
   * Optional `parentRoadmapId` is set when the new roadmap is the
   * downstream cycle of a continuation fork pick. The roadmap
   * generation function reads the parent's executionMetrics and
   * passes the speed calibration into the engine prompt so the
   * calibrated next roadmap honours the founder's actual pace,
   * not their stated pace.
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
      parentRoadmapId?: string;
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

  /**
   * Fired when a founder kicks off a standalone or task-launched
   * research execution. The route returns 202 immediately; this
   * event drives the Inngest worker that runs the Opus tool loop +
   * Sonnet structured emission, persists the report into
   * roadmap.toolSessions, and fires a push notification on
   * completion.
   *
   * Consumer: `researchExecuteJobFunction` in
   * `src/inngest/functions/tools/research-execute-job.ts`
   */
  'tool/research-execute.requested': {
    data: {
      jobId:        string;
      userId:       string;
      roadmapId:    string;
      sessionId:    string;
      taskId:       string | null;
      planText:     string;
      query:        string;
      // Optional Sentry distributed-trace headers. See type-map docstring
      // for the architectural rationale.
      sentryTrace?: string;
      baggage?:     string;
    };
  };

  /**
   * Fired when a founder asks a follow-up question on an existing
   * research report. Same pattern as research-execute — the route
   * returns 202 immediately, the Inngest worker runs the targeted
   * Sonnet tool loop, appends new findings to the session, and
   * pushes on completion.
   *
   * Consumer: `researchFollowupJobFunction` in
   * `src/inngest/functions/tools/research-followup-job.ts`
   */
  'tool/research-followup.requested': {
    data: {
      jobId:     string;
      userId:    string;
      roadmapId: string;
      sessionId: string;
      taskId:    string | null;
      query:     string;
      sentryTrace?: string;
      baggage?:     string;
    };
  };

  /**
   * Fired when a founder confirms the packager context and triggers
   * package generation. The route returns 202 immediately; this event
   * drives the Inngest worker that runs the Opus tool loop, persists
   * the package into roadmap.toolSessions (standalone) or
   * task.packagerSession (task-launched), and pushes on completion.
   *
   * Consumer: `packagerGenerateJobFunction` in
   * `src/inngest/functions/tools/packager-generate-job.ts`
   */
  'tool/packager-generate.requested': {
    data: {
      jobId:     string;
      userId:    string;
      roadmapId: string;
      sessionId: string;
      taskId:    string | null;
      // Stringified ServiceContext — the worker zod-parses it before
      // passing it to runPackagerGeneration. Stringify keeps the event
      // payload schema flat (Inngest's TS map prefers primitive shapes).
      contextJson: string;
      sentryTrace?: string;
      baggage?:     string;
    };
  };

  /**
   * Fired when a founder asks the packager to adjust an existing
   * package. Same accept-and-queue pattern as generate.
   *
   * Consumer: `packagerAdjustJobFunction` in
   * `src/inngest/functions/tools/packager-adjust-job.ts`
   */
  'tool/packager-adjust.requested': {
    data: {
      jobId:             string;
      userId:            string;
      roadmapId:         string;
      sessionId:         string;
      taskId:            string | null;
      adjustmentRequest: string;
      sentryTrace?: string;
      baggage?:     string;
    };
  };

  /**
   * Fired when the founder confirms the composer context and triggers
   * full message generation. Same accept-and-queue pattern as packager.
   *
   * Consumer: `composerGenerateJobFunction` in
   * `src/inngest/functions/tools/composer-generate-job.ts`
   */
  'tool/composer-generate.requested': {
    data: {
      jobId:       string;
      userId:      string;
      roadmapId:   string;
      sessionId:   string;
      taskId:      string | null;
      // Stringified ComposerContext + the chosen mode + channel. The
      // worker zod-parses contextJson before passing to the engine.
      contextJson: string;
      mode:        string;
      channel:     string;
      sentryTrace?: string;
      baggage?:     string;
    };
  };

  /**
   * Fired when the founder kicks off conversation preparation. The
   * Opus call (with exa/tavily research tools, 30-90s) is the longest
   * single LLM call in the product after Research; durable execution
   * is the right fit.
   *
   * Consumer: `coachPrepareJobFunction` in
   * `src/inngest/functions/tools/coach-prepare-job.ts`
   */
  'tool/coach-prepare.requested': {
    data: {
      jobId:     string;
      userId:    string;
      roadmapId: string;
      sessionId: string;
      taskId:    string | null;
      sentryTrace?: string;
      baggage?:     string;
    };
  };

  /**
   * Fired when the founder transitions a venture from active|paused
   * to completed. The Mark Complete handler creates a
   * TransformationReport row with stage='queued' and fires this event
   * synchronously so the Opus narrative synthesis runs in the
   * background — the founder lands on the report viewer (which polls
   * the row's stage) immediately and sees step-progress updates.
   *
   * Tab-close survival is automatic: the row persists in Postgres
   * and the worker writes its result on completion regardless of
   * whether the founder is still on the page. A push notification
   * fires on completion if they're not.
   *
   * Consumer: `transformationReportFunction` in
   * `src/inngest/functions/transformation-report-function.ts`
   * (added in a later commit; this event is declared first so the
   * accept-and-queue route can reference it).
   *
   * The literal name is exported as `TRANSFORMATION_REPORT_EVENT`
   * from `src/lib/transformation/constants.ts`.
   */
  'discovery/transformation.requested': {
    data: {
      reportId:  string;
      ventureId: string;
      userId:    string;
      sentryTrace?: string;
      baggage?:     string;
    };
  };

  /**
   * Fired when a Conversation is created with a non-empty first
   * message. The worker generates a 3–5 word noun-phrase title from
   * the message (matches ChatGPT / Claude / Gemini behaviour) and
   * updates Conversation.title in place. Until the worker completes,
   * the sidebar renders the truncated-first-message fallback set at
   * session-create time, so the UX never shows an empty title.
   *
   * Fire-and-forget: failure leaves the truncated title in place,
   * which is the prior behaviour. The title is cosmetic — no retry
   * is required for correctness.
   *
   * Consumer: `conversationTitleFunction` in
   * `src/inngest/functions/conversation-title-function.ts`
   *
   * The literal name is exported as `CONVERSATION_TITLE_EVENT` from
   * `src/lib/discovery/constants.ts`.
   */
  'discovery/conversation.title.requested': {
    data: {
      conversationId: string;
      userId:         string;
      /** Founder's verbatim first message — the only signal needed
       *  for a 3–5 word noun-phrase title. Passed by value so the
       *  worker doesn't need a Prisma round-trip to read it. */
      firstMessage:   string;
    };
  };

  /**
   * Fired when a founder triggers Stage 5 synthesis on the No Idea
   * archetype's final review surface. The route returns 202
   * immediately with a jobId; this event drives the Inngest worker
   * that loads the committed Stage 1-4 documents, runs the two-phase
   * synthesis bridge (delegating to `runFinalSynthesis`), upserts the
   * Recommendation row keyed on sessionId, and flips the Stage 5
   * IdeationStageRun from 'authoring' to 'output_ready'.
   *
   * Sentry distributed-trace headers are propagated so the worker
   * resumes the parent trace from the synthesize route.
   *
   * Consumer: `stage5SynthesizeJobFunction` in
   * `src/inngest/functions/tools/stage5-synthesize-job.ts`
   */
  'ideation/stage5-synthesize.requested': {
    data: {
      jobId:        string;
      userId:       string;
      sessionId:    string;
      stageRunId:   string;
      sentryTrace?: string;
      baggage?:     string;
    };
  };

  /**
   * Fired when a founder confirms account deletion via Settings →
   * Danger zone. The route returns 202 immediately; this event drives
   * the durable saga that cancels Paddle subscriptions, revokes
   * sessions / push tokens, deletes the User row (cascades wipe every
   * downstream artefact), and invalidates the tier cache.
   *
   * Durable rather than synchronous because Paddle's cancel API is
   * an external dependency that can transiently fail — a half-applied
   * deletion (Paddle still billing, local row gone) is strictly worse
   * than no deletion at all. Inngest's retry semantics let the saga
   * resume from the failed step.
   *
   * Consumer: `accountDeletionFunction` in
   * `src/inngest/functions/account-deletion-function.ts`
   *
   * The literal name is exported as `ACCOUNT_DELETION_EVENT` from
   * `src/lib/auth/account-deletion-constants.ts`.
   */
  'user/account.delete.requested': {
    data: {
      userId: string;
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
