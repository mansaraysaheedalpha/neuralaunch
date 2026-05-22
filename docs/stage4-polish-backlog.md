# Stage 4 — Polish Backlog

Items deferred from the Stage 4 build to land after the core flow
ships. Each is documented here so a future engineer (or future you)
picks them up from a clear starting point rather than rediscovering
the context.

**Status:** NOT BLOCKING the Stage 4 release. Open these tickets
once Stage 4 hits prod and the screenshot pipeline is in real use.

---

## 1. Privacy policy — document the screenshot → S3 → vision flow

**File to update:** `neuralaunch-privacy-policy.md` (or wherever the
canonical policy lives — find via grep, not memory).

**What needs to land in the policy:**

- Founders may upload screenshots of community engagement to validate
  pain points.
- Screenshots are stored in AWS S3 under our control, encrypted at
  rest (SSE-S3), with a 30-day auto-expiration lifecycle rule.
- Author handles visible in screenshots are preserved verbatim in
  the extracted-text artifact (no PII redaction). Founders are
  responsible for capturing public posts they have personally
  engaged with; we do not scrape.
- Vision extraction runs on Anthropic Claude (Sonnet) and produces
  a structured summary (comments, sentiment, key quotes) persisted
  on the NeuraLaunch artifact alongside the image's storage key.
- Extracted text persists indefinitely on the artifact today; see
  item 2 below for the planned retention decision.
- A moderation gate (Claude Haiku) screens uploads before
  extraction; explicit / unrelated images are rejected without
  being extracted.

**Why deferred:** the policy update is a copywriting + legal-review
task that can happen in parallel with Stage 4 dev. Stage 4 itself
needs ship signal — the policy can follow within a sprint.

---

## 2. Decide on extracted-text retention

**Context:** the S3 lifecycle rule expires the original screenshot
image after 30 days. The vision-extracted text (`extractedSignal` —
comments, sentiment, key quotes, contradictions) persists indefinitely
on the `IdeationStageRun.output` JSON column. Today this is
defensible: the extracted text is part of the founder's evaluation
artifact; deleting it would orphan the verdict reasoning that
references it.

**The question to answer:** should `extractedSignal` auto-clear
after N days mirroring the image lifecycle? Options:

- **A. Status quo** — extracted text persists for the life of the
  IdeationStageRun. Defensible (the text IS the validation work);
  highest founder utility (can re-read screenshots-by-proxy years
  later); higher data-retention exposure.
- **B. Mirror the image lifecycle** — clear `extractedSignal` after
  30 days too, leaving only the sentiment counts + the `keyQuotes`
  bucket. Lower exposure; founder loses the comment-level detail
  after the window.
- **C. Hybrid — clear comments[] after 30 days, retain aggregate** —
  the per-comment `comments[]` array (with author handles + verbatim
  text) clears at 30 days; the `LayerBExtractedSignal` aggregate
  (validationStrength + sentimentBreakdown counts + keyQuotes +
  contradictionsRaised) persists. Best balance: founders keep the
  decision-relevant summary; the high-PII detail expires with the
  image.

**Recommendation when this gets picked up:** option C. The per-
comment array is the highest-PII surface (author handles + full
verbatim text); the aggregate is the decision artifact. Both can
live in the same JSON field with a deterministic clean-up pass run
by an Inngest cron.

**Why deferred:** needs the privacy-policy decision (item 1) as
prerequisite + an Inngest cron function with the right cadence.
Real founder feedback after Stage 4 ships may also reshape the
right cutoff (30 vs 90 days, full clear vs aggregate-only).

**Inngest sketch when implemented:**

```ts
// src/inngest/functions/stage4/clear-stale-extractions.ts
inngest.createFunction(
  { id: 'stage4.clear-stale-extractions', schedule: '0 4 * * *' },
  async () => {
    // For each Stage4AuthoringState older than N days, clear the
    // comments[] from every CommunityResponse.extractedSignal,
    // preserving the LayerBExtractedSignal aggregate.
  },
);
```

---

## 3. Idempotency on community-response submissions (partial-failure dedup)

**Context:** `runCommunityResponsePipeline` persists the
CommunityResponse row in step 1, runs vision in step 2, recomputes
aggregate in step 3, synthesises a fresh verdict in step 4. If step
4 throws (Anthropic overload after the fallback chain exhausts, or
a stray exception), the row IS persisted but the route returns 500.
The founder retries → a SECOND row gets persisted with the same
content → both contribute to the next aggregate signal. The duplicate
is FIFO-evicted within `MAX_RESPONSES_PER_OPPORTUNITY = 12`, but
the signal temporarily double-counts.

**Why this isn't fixed in code today:** the right fix is structural,
not a guard. Three options:

- **A. Client-supplied idempotency key** — request body carries a
  `clientRequestId: string`. Server tracks recently-seen IDs per
  stage row (small LRU in the JSONB output OR a Redis set with a
  short TTL). Duplicate submissions return the existing response.
  Adds: client-side UUID generation + server cache eviction policy.

- **B. Content-hash dedup** — server computes SHA256 of the response
  content (`pastedText` or `s3Key`) and skips duplicate hashes in
  the same recent window. Works for text-paste retries; doesn't
  catch screenshot retries because each presign generates a new
  unique `s3Key`.

- **C. Inngest-backed durable pipeline (recommended)** — split the
  community-response flow into two Inngest steps:
  1. Synchronous: persist the response row + return success to the
     founder.
  2. Async durable: run vision + aggregate-recompute + verdict-
     synthesise in an Inngest function. The function is keyed by
     `(stageRunId, responseId)` so duplicate triggers naturally
     dedup. Retries become automatic + observable in the Inngest
     dashboard.

  This also solves the load problem (a 60s sync pipeline is
  expensive to keep on the Vercel hot path) and matches the pattern
  the codebase already uses for long-running tool jobs (see
  `src/inngest/functions/tools/research-execute-job.ts` for the
  canonical example).

**Recommendation when this gets picked up:** option C. The current
behavior (FIFO eviction caps the blast radius; founder sees an
honest 500 and retries) is acceptable until production usage
surfaces real complaints about double-counting. When that happens,
build the Inngest function rather than patching the synchronous
flow.

**Inngest sketch when implemented:**

```ts
// src/inngest/functions/stage4/process-community-response.ts
export const processCommunityResponse = inngest.createFunction(
  {
    id: 'stage4.process-community-response',
    // Idempotency: same (stageRunId, responseId) tuple is a no-op
    // on duplicate triggers.
    idempotency: 'event.data.stageRunId + "::" + event.data.responseId',
  },
  { event: 'stage4/community-response.captured' },
  async ({ event, step }) => {
    const { stageRunId, userId, responseId } = event.data;

    await step.run('vision-pipeline', async () => {
      // moderation + extraction + persist
    });

    await step.run('recompute-aggregate', async () => {
      // recomputeOpportunityAggregateSignal
    });

    await step.run('synthesize-verdict', async () => {
      // synthesizeVerdict + persistAgentVerdict
    });
  },
);
```

Route then becomes: persist row + `inngest.send({ name: 'stage4/community-response.captured', ... })` + return 202.

---

## 4. (Future, not formally added yet)

Anything else that surfaces during Stage 4 dev gets appended here
rather than landing in the brief inline. Keep this file as the
canonical Stage 4 post-launch checklist.

---

## Already resolved (audit findings folded into commits)

The audit pass that ran after the Stage 4 batch shipped surfaced
four findings. Three were folded into the code; one was added to
this backlog (item 3 above). For completeness:

- **Resolved — cross-tenant s3Key acceptance.** Added
  `isS3KeyOwnedBy(s3Key, userId)` in `lib/storage/s3.ts` + a route-
  level guard in `/community-response`. Tests in `s3.test.ts` pin
  the canonical pattern + the prefix-match smuggling defence.

- **Resolved — cascade silent in normal-authoring.** Extended
  `cascadeStage1EditToStage2`, `cascadeStage1OrStage2EditToStage3`,
  and `cascadeStage1Or2Or3EditToStage4` to flip
  `requiresRederivation=true` when the downstream is in normal-
  authoring without a snapshot. Tests added to all three cascade
  test files.

- **Resolved — pushback race window.** `transformAuthoring` in
  Stage 3 + Stage 4 transitions now wraps findFirst + updateMany
  in `prisma.$transaction` under `Serializable` isolation. P2034
  serialization_failure errors get caught and re-thrown as
  HttpError 409 so the route surfaces a clean "concurrent write"
  message.
