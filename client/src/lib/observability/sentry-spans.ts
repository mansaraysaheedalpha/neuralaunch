// src/lib/observability/sentry-spans.ts
//
// Centralised Sentry span vocabulary for NeuraLaunch.
//
// Source-of-truth refs:
//   - client/SENTRY_RESEARCH_DOC.txt § "Distributed Tracing and Custom
//     Instrumentation Masterclass"
//   - docs/migrations/turbopack-migration-log.md § "Sentry Integration"
//
// Why this file exists
// --------------------
// Every span emitted by NeuraLaunch must come through one of the helpers
// below. Centralising the vocabulary means:
//   - Phase 4 has a single grep target for the PII audit.
//   - Phase 6 has a single mock target for tests.
//   - Sentry's UI groups and filters by attribute key, so a typo
//     (`agent.tier` vs `agent_tier`) silently breaks dashboards. The
//     exported string constants below are the only correct source for
//     attribute keys — never inline a literal at a callsite.
//   - Future contributors adding instrumentation use an existing wrapper
//     rather than inventing a new pattern.
//
// Operational rules baked into this file
// --------------------------------------
// 1. ATTRIBUTE CONTENT RULE — "If you wouldn't put it on a Slack
//    message to the team, don't put it on a span." Span attributes are
//    indexed and queryable in Sentry; raw user text, prompt content,
//    customer IDs, and anything that looks like a credential never go
//    on attributes. Use lengths, types, and enum labels.
//
//    Sub-rule — LATENCY CAPTURE CONSISTENCY: every callsite that
//    measures latency (latency.first_token_ms, latency.total_ms) uses
//    `Date.now()` as the clock — not `performance.now()`, not
//    `new Date()`, not Inngest's step clock. Mixing clocks across
//    callsites makes Sentry's per-attribute aggregations meaningless
//    because the unit ambiguity (ms vs hi-res-ms vs ISO date diff)
//    is invisible at the dashboard layer.
//
// 2. STAGE-MUTATION OVER SUB-SPANS — Prefer mutating one span's
//    attributes over creating sibling spans for sequential stages of
//    one logical operation. `synthesis.stage` advances through
//    "summarising" → "eliminating" → "finalising" via setAttr() on
//    the active span. If an error fires during stage 3, the span
//    carries `synthesis.stage = "finalising"` at the moment of error,
//    which is enough to localise the failure without trace-tree
//    clutter. Same pattern for response.type and generation.type
//    (set early in the dispatcher, before the LLM call fires).
//
// 3. MODEL FALLBACK RECORDS BUT DOES NOT ERROR — `withModelFallback`
//    transparently falls through to a smaller model on Anthropic
//    overload. From the user's perspective and the system's
//    perspective, that's a successful call, just on a degraded path.
//    The span emits `model.fallback_used = true` plus
//    `model.fallback_reason` but is NOT marked as errored. Use
//    `recordModelFallback(reason)` from inside the factory closure
//    after a fallback has fired.
//
//    Sub-rule — REQUESTED-VS-FIRED MODEL DOUBLE-SET IS INTENTIONAL:
//    when a callsite uses `withModelFallback`, the agent.model
//    attribute is set TWICE on purpose. The initial `withAgentSpan`
//    attributes carry the REQUESTED model (the primary that the call
//    was authored against). The inner `setAttr(ATTR_AGENT_MODEL, ...)`
//    inside the factory closure captures the FIRED model (whatever
//    the fallback chain actually resolved to — could be primary,
//    could be a smaller fallback). The final span value is the fired
//    model; combined with `model.fallback_used`, you can answer
//    "which model did we ask for vs. which one ran" in any single
//    Sentry event. Do not "fix" the double-set by removing the
//    initial value — that loses the diagnostic signal.
//
// 4. INNGEST STEP RETRIES DON'T MULTIPLY SPANS — Inngest retries
//    individual `step.run` blocks under the hood. Wrap `withQueueSpan`
//    at the function-level (around the whole worker handler), NOT
//    inside step.run. Otherwise a step retry produces N spans for one
//    logical execution and the queue.task duration becomes
//    meaningless.
//
// 5. PII GUARD IS DEV-ONLY — `assertNoPII` runs only when
//    NODE_ENV !== 'production'. It catches obvious patterns (email,
//    key prefixes, JWT, long digit runs) at the point of authoring,
//    not at the point of submission. Phase 4's beforeSend scrub is
//    the production line of defence. This guard exists so a
//    contributor adding a new attribute sees the failure during local
//    testing rather than discovering it weeks later in a Sentry
//    privacy audit.
//
// 6. STREAMING ENGINES CAPTURE AT THE CONSUMPTION SITE — first-token
//    latency and total latency on streaming calls (the
//    `streamQuestionWithFallback` chain) are observed only by the
//    code that iterates the stream — typically the route handler
//    that hosts the `withAgentSpan`. Do NOT push observability into
//    `streamQuestionWithFallback` itself; same separation-of-concerns
//    rationale that justified the `withModelFallback` resolution.
//    `latency.first_token_ms` is meaningful only on streaming
//    callsites and will be absent on `generateObject` /
//    `generateText` ones — Sentry filters cleanly on attribute
//    presence, so this asymmetry is fine. Token counts on streaming
//    come from the stream's terminal usage resolution (a Promise
//    that resolves after the last chunk); if the AI SDK doesn't
//    expose it, capture first-token latency only and document the
//    skip — first-token latency is the most diagnostically valuable
//    streaming attribute regardless.

import * as Sentry from "@sentry/nextjs";

// ─── Attribute key constants ──────────────────────────────────────────────
// All Sentry attribute keys flow through these constants. Never inline a
// string literal at a callsite — typos silently break Sentry's filtering.

// Agent / LLM call attributes
export const ATTR_AGENT_TIER = "agent.tier";
export const ATTR_AGENT_MODEL = "agent.model";
export const ATTR_AGENT_AUDIENCE_TYPE = "agent.audience_type";
export const ATTR_TOKENS_INPUT = "tokens.input";
export const ATTR_TOKENS_OUTPUT = "tokens.output";
export const ATTR_LATENCY_FIRST_TOKEN_MS = "latency.first_token_ms";
export const ATTR_LATENCY_TOTAL_MS = "latency.total_ms";

// Model-fallback attributes (set via recordModelFallback)
export const ATTR_MODEL_FALLBACK_USED = "model.fallback_used";
export const ATTR_MODEL_FALLBACK_REASON = "model.fallback_reason";

// Dispatcher-collapse attributes (set early, before the LLM call)
export const ATTR_RESPONSE_TYPE = "response.type";
export const ATTR_GENERATION_TYPE = "generation.type";
export const ATTR_SYNTHESIS_STAGE = "synthesis.stage";

// Tool UI surface attributes (Tier-1 tool route handlers)
export const ATTR_TOOL_INPUT_LENGTH = "tool.input_length";
export const ATTR_USER_TIER = "user.tier";

// Inngest queue.task attributes
export const ATTR_INNGEST_FUNCTION_ID = "inngest.function_id";
export const ATTR_INNGEST_EVENT_NAME = "inngest.event_name";
export const ATTR_INNGEST_RUN_ID = "inngest.run_id";

// External-API attributes (Exa, Paddle)
export const ATTR_EXA_QUERY_LENGTH = "exa.query_length";
export const ATTR_EXA_AUDIENCE_TYPE = "exa.audience_type";
export const ATTR_PADDLE_EVENT_TYPE = "paddle.event_type";

// ─── Type-safe attribute bag ──────────────────────────────────────────────
// Sentry accepts string | number | boolean | string[] | number[] | boolean[].
// We narrow to scalars because every attribute in NeuraLaunch is scalar.
export type SpanAttrValue = string | number | boolean;
export type SpanAttrs = Record<string, SpanAttrValue>;

// ─── Dev-only PII guard ───────────────────────────────────────────────────
// Patterns chosen to catch obvious, high-confidence PII shapes. We do NOT
// try to be clever (no NER, no length-based "looks like a name" guessing) —
// false positives on creative attribute values would block valid
// instrumentation, which is worse than the asymmetric prod-side scrub
// catching what slips through.
const PII_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "email", pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/ },
  { name: "key-prefix", pattern: /\b(sk|pk|exa|sntr)_[A-Za-z0-9_-]{8,}\b/ },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "long-digit-run", pattern: /\b\d{13,19}\b/ },
];

/**
 * Throws in dev (and only in dev) if any string-valued attribute matches a
 * PII pattern. Production callsites pay zero cost — the early return is
 * the first instruction. Phase 4's beforeSend scrub is the production
 * line of defence.
 */
export function assertNoPII(attrs: SpanAttrs): void {
  if (process.env.NODE_ENV === "production") return;
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value !== "string") continue;
    for (const { name, pattern } of PII_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(
          `[sentry-spans] PII pattern "${name}" detected on attribute "${key}". ` +
          `Strip or hash the value before attaching. This guard runs only in ` +
          `development — if it fires here, it would silently leak in production.`,
        );
      }
    }
  }
}

// ─── Setter exposed to span runners ───────────────────────────────────────
/**
 * Mutate the currently-active span's attributes. The factory passed to
 * any `withXxxSpan` helper receives this as its sole argument, so it can
 * advance `synthesis.stage`, record `tokens.input` after the LLM
 * resolves, etc. Dev-only PII guard runs on every call.
 */
export type SetSpanAttr = (key: string, value: SpanAttrValue) => void;

function makeSetAttr(span: Sentry.Span | undefined): SetSpanAttr {
  return (key, value) => {
    if (process.env.NODE_ENV !== "production" && typeof value === "string") {
      assertNoPII({ [key]: value });
    }
    span?.setAttribute(key, value);
  };
}

/**
 * Set an attribute on whichever span is currently active in the
 * AsyncLocalStorage context. Useful for mutation from deep in a call
 * stack where the closure-captured `setAttr` from the wrapping helper
 * isn't reachable. Returns silently if no span is active (e.g. in unit
 * tests with no Sentry mock).
 */
export function setActiveSpanAttribute(key: string, value: SpanAttrValue): void {
  const span = Sentry.getActiveSpan();
  if (!span) return;
  if (process.env.NODE_ENV !== "production" && typeof value === "string") {
    assertNoPII({ [key]: value });
  }
  span.setAttribute(key, value);
}

/**
 * Mark the active span as having used the model-fallback path.
 * Per operational rule #3, this records but does NOT error the span.
 * Call from inside the `withModelFallback` factory after a fallback fires.
 */
export function recordModelFallback(reason: string): void {
  const span = Sentry.getActiveSpan();
  if (!span) return;
  span.setAttribute(ATTR_MODEL_FALLBACK_USED, true);
  span.setAttribute(ATTR_MODEL_FALLBACK_REASON, reason);
}

// ─── Span runners ─────────────────────────────────────────────────────────
// Every helper takes a name + attribute bag and a factory that runs the
// real work. The factory receives a `setAttr` it can call to mutate the
// span's attributes mid-flight (per stage-mutation rule). Errors thrown
// inside the factory auto-bind to the span via Sentry's AsyncLocalStorage.

export type SpanRunner<T> = (setAttr: SetSpanAttr) => Promise<T>;

interface BaseSpanOptions {
  name: string;
  attributes?: SpanAttrs;
}

async function runSpan<T>(
  op: string,
  options: BaseSpanOptions,
  run: SpanRunner<T>,
): Promise<T> {
  if (options.attributes) assertNoPII(options.attributes);
  return Sentry.startSpan(
    { op, name: options.name, attributes: options.attributes },
    async (span) => run(makeSetAttr(span)),
  );
}

/**
 * `op: "ai.agent"` — wraps a top-level engine entry function. One LLM
 * call (or one logical user-facing intent, in the dispatcher-collapse
 * case) = one span. Sub-calls inside the engine do NOT get their own
 * spans; advance `synthesis.stage` / `response.type` / `generation.type`
 * via setAttr instead.
 *
 * Nested calls: `withAgentSpan(parent, () => withAgentSpan(child, ...))`
 * produces a clean parent → child trace tree because Sentry's
 * AsyncLocalStorage tracks the active span through awaits. This is how
 * the synthesis sequential-stages pattern is wired (parent
 * `discovery.synthesis` + 3 children).
 */
export function withAgentSpan<T>(options: BaseSpanOptions, run: SpanRunner<T>): Promise<T> {
  return runSpan("ai.agent", options, run);
}

// ─── Streaming variant — manual lifetime ──────────────────────────────────
// Streaming engines (`streamQuestionWithFallback` callsites at
// `turn/route.ts`) cannot use `withAgentSpan` directly: the route
// returns its NextResponse synchronously, but the stream's controller
// fires asynchronously after the body is read by the runtime. By the
// time the first chunk arrives, a callback-shape span has already
// closed — `setAttr` after span end is a silent no-op.
//
// `withStreamingAgentSpan` solves this by starting an inactive span,
// wiring observers onto the stream + modelUsed + (optional) usage
// Promises so they fire WHILE the span is still alive, and ending the
// span when the consumer-side read of the wrapped stream terminates.
// Errors during consumption error the span before ending it.
//
// The lifetime management lives in this helper exactly once. Every
// future streaming engine (voice mode, agentic chat, etc.) consumes
// the same API.

export interface StreamingAgentSpanFactoryResult<T> {
  /** The producer-side stream emitted by the underlying AI helper. */
  stream: ReadableStream<T>;
  /** Resolves with a model identifier when the chain commits. */
  modelUsed: Promise<string>;
  /**
   * Optional terminal usage Promise. AI SDK v5's `streamText` exposes
   * `result.usage` which resolves after the stream completes. If the
   * underlying helper doesn't surface it (or if the AI SDK build in
   * use doesn't resolve it cleanly), pass undefined — the span omits
   * token attributes and ends on stream close as normal.
   */
  usage?: Promise<{ inputTokens?: number; outputTokens?: number } | undefined>;
}

export type StreamingAgentSpanFactory<T> = (
  setAttr: SetSpanAttr,
) => StreamingAgentSpanFactoryResult<T> | Promise<StreamingAgentSpanFactoryResult<T>>;

/**
 * Manual-lifetime streaming wrapper. The factory runs synchronously to
 * set initial attributes and obtain the underlying stream + observers.
 * The wrapper returns a NEW ReadableStream that the caller passes to
 * `new NextResponse(...)`. Span lifetime extends through the consumer's
 * read of that stream — closing on terminal flush, erroring on cancel.
 *
 * Pattern at the route handler:
 *
 *   return new NextResponse(
 *     await withStreamingAgentSpan(
 *       { name: "discovery.turn", attributes: { ... } },
 *       async (setAttr) => {
 *         setAttr(ATTR_GENERATION_TYPE, classifiedType);
 *         const result = streamQuestionWithFallback(...);
 *         return {
 *           stream:    result.textStream,
 *           modelUsed: result.modelUsed,
 *           usage:     result.usagePromise,
 *         };
 *       },
 *     ),
 *   );
 */
export async function withStreamingAgentSpan<T>(
  options: BaseSpanOptions,
  factory: StreamingAgentSpanFactory<T>,
): Promise<ReadableStream<T>> {
  if (options.attributes) assertNoPII(options.attributes);

  const span = Sentry.startInactiveSpan({
    op: "ai.agent",
    name: options.name,
    attributes: options.attributes,
  });
  const start = Date.now();
  const setAttr = makeSetAttr(span);

  let factoryResult: StreamingAgentSpanFactoryResult<T>;
  try {
    const maybe = factory(setAttr);
    factoryResult = maybe instanceof Promise ? await maybe : maybe;
  } catch (err) {
    span.setStatus({ code: 2, message: err instanceof Error ? err.message : "factory error" });
    span.end();
    throw err;
  }

  // Wire async observers BEFORE returning the wrapped stream so they
  // race the consumer naturally. Each observer's failure is swallowed
  // — never crash the request because of an instrumentation hiccup.
  factoryResult.modelUsed
    .then((id) => setAttr(ATTR_AGENT_MODEL, id))
    .catch(() => {});

  factoryResult.usage
    ?.then((usage) => {
      if (typeof usage?.inputTokens === "number") setAttr(ATTR_TOKENS_INPUT, usage.inputTokens);
      if (typeof usage?.outputTokens === "number") setAttr(ATTR_TOKENS_OUTPUT, usage.outputTokens);
    })
    .catch(() => {});

  // Wrap the producer stream so we can observe first-token latency
  // on the consumer side and end the span on terminal close, error,
  // or cancellation. A bare TransformStream's `Transformer` shape
  // doesn't expose a `cancel` callback — wrapping as a manual
  // ReadableStream gives us all three lifecycle hooks.
  const upstream = factoryResult.stream;
  let firstTokenSeen = false;
  let spanClosed = false;
  const closeSpanOnce = (status: "ok" | { code: 2; message: string }) => {
    if (spanClosed) return;
    spanClosed = true;
    if (status !== "ok") span.setStatus(status);
    setAttr(ATTR_LATENCY_TOTAL_MS, Date.now() - start);
    span.end();
  };

  const observed = new ReadableStream<T>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            closeSpanOnce("ok");
            return;
          }
          if (!firstTokenSeen) {
            firstTokenSeen = true;
            setAttr(ATTR_LATENCY_FIRST_TOKEN_MS, Date.now() - start);
          }
          controller.enqueue(value);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.error(err);
        closeSpanOnce({ code: 2, message });
      } finally {
        reader.releaseLock();
      }
    },
    cancel(reason) {
      const message = reason instanceof Error ? reason.message : String(reason ?? "stream cancelled");
      // Best-effort upstream cancel — never crash the consumer if
      // the underlying stream cannot be cancelled.
      upstream.cancel(reason).catch(() => {});
      closeSpanOnce({ code: 2, message });
    },
  });

  return observed;
}

/**
 * `op: "queue.task"` — wraps an Inngest worker function at the
 * function-level entry, NOT inside individual step.run blocks. Inngest's
 * own retry loop re-runs steps; wrapping at the function level means
 * those retries accumulate inside one span rather than multiplying spans.
 *
 * Generic variant. For Inngest workers, prefer `withInngestQueueSpan`,
 * which type-enforces the four standard correlation attributes
 * (`inngest.function_id`, `inngest.event_name`, `inngest.run_id`,
 * `inngest.attempt`).
 */
export function withQueueSpan<T>(options: BaseSpanOptions, run: SpanRunner<T>): Promise<T> {
  return runSpan("queue.task", options, run);
}

/**
 * Inngest-specific `queue.task` wrapper. The four correlation attributes
 * are required by-position so a contributor cannot accidentally omit
 * them. Inngest's serverless model invokes the function handler MULTIPLE
 * TIMES per logical run (once per step boundary, replaying earlier step
 * results). Each invocation opens a fresh `queue.task` span. Without
 * `inngest.run_id`, multiple sibling spans for one logical run cannot be
 * correlated in Sentry's UI — that's the whole reason these attributes
 * are mandatory rather than optional.
 *
 * The span name is derived from `functionId` so every Inngest function
 * has a stable, queryable name in Sentry. Override via `nameOverride`
 * only when the function id and the desired span name differ
 * meaningfully (rare).
 */
export interface InngestQueueSpanOptions {
  functionId:    string;
  eventName:     string;
  runId:         string;
  attempt:       number;
  /** Optional extra attributes — never overrides the four required ones. */
  extraAttributes?: SpanAttrs;
  /** Optional override for the span name. Defaults to `inngest.<functionId>`. */
  nameOverride?: string;
}

export function withInngestQueueSpan<T>(
  options: InngestQueueSpanOptions,
  run: SpanRunner<T>,
): Promise<T> {
  const attributes: SpanAttrs = {
    [ATTR_INNGEST_FUNCTION_ID]: options.functionId,
    [ATTR_INNGEST_EVENT_NAME]:  options.eventName,
    [ATTR_INNGEST_RUN_ID]:      options.runId,
    'inngest.attempt':          options.attempt,
    ...(options.extraAttributes ?? {}),
  };
  return runSpan(
    "queue.task",
    {
      name: options.nameOverride ?? `inngest.${options.functionId}`,
      attributes,
    },
    run,
  );
}

/**
 * `op: "ui.action"` — wraps a Tier-1 tool accept-and-queue route
 * handler (Coach / Composer / Research / Packager). The route validates
 * + creates a ToolJob + emits the Inngest event with the trace headers
 * captured via `captureTraceHeaders()`; the worker resumes the trace
 * via `withDistributedTrace`.
 */
export function withToolUiSpan<T>(options: BaseSpanOptions, run: SpanRunner<T>): Promise<T> {
  return runSpan("ui.action", options, run);
}

/**
 * `op: "http.client"`, `description: "exa.search"` — wraps the single
 * Exa search callsite. Per the "if you wouldn't put it on a Slack
 * message" rule, this helper accepts ONLY the query length and the
 * audience-type label. The raw query string is structurally unreachable
 * from this signature.
 */
export function withExaSearchSpan<T>(
  args: { queryLength: number; audienceType?: string },
  run: () => Promise<T>,
): Promise<T> {
  // audienceType is optional: low-level transport callsites
  // (`lib/research/exa-client.ts`) don't know the founder's audience
  // type — that's an agent-layer concept. The parent `ai.agent` span
  // already carries `agent.audience_type`; Sentry's UI joins via the
  // trace tree. When a higher-level callsite that does know the
  // audience type wraps directly, pass it for first-class filtering.
  const attributes: SpanAttrs = { [ATTR_EXA_QUERY_LENGTH]: args.queryLength };
  if (args.audienceType !== undefined) {
    attributes[ATTR_EXA_AUDIENCE_TYPE] = args.audienceType;
  }
  return Sentry.startSpan(
    {
      op: "http.client",
      name: "exa.search",
      attributes,
    },
    async () => run(),
  );
}

/**
 * `op: "queue.task"`, `name: "paddle.webhook"` — wraps the Paddle
 * webhook handler entry. Per the Slack-message rule, the only attribute
 * exposed is the event type. Customer IDs, transaction details, raw
 * payload — all forbidden on this span. Sub-handlers attach as natural
 * children via AsyncLocalStorage if they emit their own spans.
 */
export function withPaddleWebhookSpan<T>(
  args: { eventType: string },
  run: () => Promise<T>,
): Promise<T> {
  return Sentry.startSpan(
    {
      op: "queue.task",
      name: "paddle.webhook",
      attributes: { [ATTR_PADDLE_EVENT_TYPE]: args.eventType },
    },
    async () => run(),
  );
}

// ─── Distributed trace propagation (route → Inngest → engine) ─────────────

export interface DistributedTraceHeaders {
  sentryTrace?: string;
  baggage?: string;
}

/**
 * Capture the current trace context as serialisable headers. Called
 * from a Tier-1 route handler INSIDE its `withToolUiSpan` callback,
 * then attached to the Inngest event payload as
 * `data.sentryTrace` / `data.baggage`.
 */
export function captureTraceHeaders(): DistributedTraceHeaders {
  const data = Sentry.getTraceData();
  return {
    sentryTrace: data["sentry-trace"],
    baggage: data.baggage,
  };
}

/**
 * Resume a parent trace from headers carried in the Inngest event
 * payload. Wrap the worker's body in this BEFORE creating the
 * `withQueueSpan` — `Sentry.continueTrace` must establish the trace
 * context first, otherwise the worker's spans orphan into a separate
 * trace tree.
 *
 * If the headers are absent (e.g. an Inngest event scheduled from a
 * non-route surface like a cron sweep), the function still runs but
 * the worker becomes the trace root.
 */
export function withDistributedTrace<T>(
  headers: DistributedTraceHeaders,
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.continueTrace(
    {
      sentryTrace: headers.sentryTrace,
      baggage: headers.baggage,
    },
    fn,
  );
}
