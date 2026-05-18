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

## 3. (Future, not formally added yet)

Anything else that surfaces during Stage 4 dev gets appended here
rather than landing in the brief inline. Keep this file as the
canonical Stage 4 post-launch checklist.
