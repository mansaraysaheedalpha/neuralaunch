// src/lib/observability/index.ts — barrel re-exports for the
// observability module. Per CLAUDE.md § "Mandatory module structure",
// every lib/ subdirectory exports its public interface through index.ts.
// Internal files are an implementation detail; never reach into
// `observability/sentry-spans` directly from outside this module.

export {
  // Span runners
  withAgentSpan,
  withStreamingAgentSpan,
  withQueueSpan,
  withInngestQueueSpan,
  withToolUiSpan,
  withExaSearchSpan,
  withPaddleWebhookSpan,
  // Distributed trace propagation
  captureTraceHeaders,
  withDistributedTrace,
  // Active-span helpers
  setActiveSpanAttribute,
  recordModelFallback,
  // Dev-only PII guard
  assertNoPII,
  // Attribute key constants
  ATTR_AGENT_TIER,
  ATTR_AGENT_MODEL,
  ATTR_AGENT_AUDIENCE_TYPE,
  ATTR_TOKENS_INPUT,
  ATTR_TOKENS_OUTPUT,
  ATTR_LATENCY_FIRST_TOKEN_MS,
  ATTR_LATENCY_TOTAL_MS,
  ATTR_MODEL_FALLBACK_USED,
  ATTR_MODEL_FALLBACK_REASON,
  ATTR_RESPONSE_TYPE,
  ATTR_GENERATION_TYPE,
  ATTR_SYNTHESIS_STAGE,
  ATTR_TOOL_INPUT_LENGTH,
  ATTR_USER_TIER,
  ATTR_INNGEST_FUNCTION_ID,
  ATTR_INNGEST_EVENT_NAME,
  ATTR_INNGEST_RUN_ID,
  ATTR_EXA_QUERY_LENGTH,
  ATTR_EXA_AUDIENCE_TYPE,
  ATTR_PADDLE_EVENT_TYPE,
} from "./sentry-spans";

export type {
  DistributedTraceHeaders,
  InngestQueueSpanOptions,
  SetSpanAttr,
  SpanAttrs,
  SpanAttrValue,
  SpanRunner,
  StreamingAgentSpanFactory,
  StreamingAgentSpanFactoryResult,
} from "./sentry-spans";
