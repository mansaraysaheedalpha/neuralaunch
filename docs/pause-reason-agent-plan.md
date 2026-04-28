# Pause-Reason Agent — Plan

**Status:** Draft, awaiting sign-off before any code.
**Author:** Claude (Opus 4.7) for Saheed.
**Started:** 2026-04-27.

---

## What this is

Today, clicking **Pause venture** in `VentureCard` opens a confirm dialog with **static** motivational copy keyed off task-progress buckets — see `pauseGroundedCopy` in [`VentureCard.tsx:217-231`](../client/src/app/(app)/discovery/recommendations/VentureCard.tsx#L217-L231). The four buckets (no progress / <30% / <70% / ≥70%) cover the basic cases honestly, but they treat every pause the same way regardless of the founder's actual reason.

This plan replaces that single-step confirm with a **brief, conversational mid-step** between the click and the actual pause. The founder types why they're pausing, an agent reads the reason against their venture history, and responds in one of three modes:

1. **Acknowledge & encourage** — reason is substantive (life event, market signal, financial pressure). Tone: "That makes sense. Pause it cleanly, the work survives, come back when you can."
2. **Reframe gently** — reason might be a flinch but could be real ("losing motivation," "this is harder than I thought"). Tone: data-grounded reflection, never moralising. *"A lot of founders feel this around week 4. Your data shows X% progress. Consider one more check-in. But your call."*
3. **Mirror the pattern** — evidence in the founder's history of a serial-pause loop. Tone: "I notice this is your 3rd pause in 6 weeks. Each previous venture had under 20% of tasks done. I'm not saying don't pause — I'm saying you deserve to know that pattern."

**Critical constraint** (locked in earlier): the agent **never says "your reason isn't legitimate."** It supports, gently reframes, or holds up the mirror. The founder always has the same final action — close the dialog, pause takes effect.

---

## What's already in place that I'm extending

- `VentureCard` has the `confirming-pause` action state (line 71) and the inline dialog block (line 448).
- `pauseGroundedCopy` produces the static fallback. Stays as a fallback if the LLM call fails.
- `pausedCount`, `pausedCap`, `tier`, `progress`, `venture.cycles` are already props.
- The existing `mutateStatus('paused')` PATCH stays as the final commit step.

---

## What's NEW (out of scope for the cross-venture-memory agent)

- One new API route: `POST /api/discovery/ventures/[ventureId]/pause-reason`
- One new engine: `lib/ventures/pause-reason-engine.ts`
- One small Prisma read aggregate for the "mirror" mode (count paused ventures, completion ratios)
- VentureCard changes inside the existing `confirming-pause` block — no new top-level surface

**Zero overlap** with the cross-venture memory agent's surface (`lib/lifecycle/`, `inngest/functions/`).

---

## Open decisions — please pick one in each before I write code

### [D1] Model

**Pick:** **Sonnet 4.6** (`MODELS.INTERVIEW`).

Rationale: this is a single-turn, low-stakes classification + tone-adjusted reply, not a deep synthesis. Cost matters because every pause attempt fires it. Opus would be ~10× the price for marginal quality gain. Sonnet handles three-mode classification + a 2-3-sentence reply trivially.

Use `withModelFallback` per CLAUDE.md.

**Confirm or redirect.**

### [D2] Multi-turn vs single-turn

**Pick:** **Single-turn.** Founder types one reason → agent replies once → founder either confirms pause, types more (NEW reason, replaces the previous one — not a chat thread), or cancels.

Rationale: a multi-turn chat would be a different product feature. The point of this agent is a **once-pass mirror**, not a conversation. Multi-turn would also tempt the model toward a debate posture, which violates the "always defers to founder" constraint.

If the founder wants to type another reason after seeing the reply, the previous reason and reply are dropped and the engine fires fresh against the new reason. No conversation history is sent to the model.

**Confirm or redirect.**

### [D3] Persistence of the dialog

**Pick:** **Don't persist the transcript. Persist only the final mode + reason on Venture.**

Add three nullable fields to `Venture`:
```
pauseReason         String?   @db.Text   // founder's last typed reason at pause time, capped at ~1KB
pauseReasonMode     String?              // 'acknowledge' | 'reframe' | 'mirror' | 'no_reason' (clicked through without typing)
pausedAt            DateTime?            // when the most recent active→paused transition fired
```

These power:
- Resume UX later — *"You paused 12 days ago because [reason]. Welcome back."*
- Operator analytics — *which modes fire most? do mirror-mode founders unpause faster?*
- The "mirror the pattern" mode itself — reads other ventures' `pauseReasonMode` to spot serial-flinch patterns

Migration is additive (three nullable columns). No data backfill needed; pre-existing paused ventures show no reason and that's fine.

**Confirm, redirect, or skip the migration entirely (don't store anything).**

### [D4] When does "mirror the pattern" fire?

**Pick:** When AT LEAST TWO of the following are true:
- Founder has 2+ paused ventures with `pauseReasonMode IN ('reframe', 'mirror')` already
- Average completion ratio across paused ventures is < 25%
- Most recent paused venture was paused < 30 days ago
- Total ventures paused in the last 90 days ≥ 3

The engine receives these aggregates as part of its input prompt (not just a flag). The model decides whether the *current* reason qualifies as a pattern instance — but it CAN'T fire mirror mode without the data thresholds being met. A first-time Pauser triggers acknowledge or reframe only.

Rationale: hard-gating prevents mirror mode from misfiring on someone whose first pause is genuine (life event). The thresholds are conservative on purpose; tune later from production data.

**Confirm or redirect on the threshold logic.**

### [D5] Tier gate

**Pick:** **All paid tiers (Execute and Compound).** Free can't pause (no ventures).

Skipping this would mean Execute founders see the static copy while Compound founders get the agent — that asymmetry would be weird. The engine itself is cheap enough that Sonnet on every pause attempt is fine.

**Confirm or redirect.**

### [D6] Fallback behaviour

**Pick:** **If the LLM call fails or times out (5 second cap), fall back to the existing static `pauseGroundedCopy`.** The dialog renders the same way, but with the pre-existing copy. Founder still has their action buttons. They never see a "could not load" error during a pause attempt.

The fallback is silent — no banner, no log-noise to the founder. Operator logs capture the failure for debugging.

**Confirm or redirect.**

---

## Architecture (assuming defaults above)

### `POST /api/discovery/ventures/[ventureId]/pause-reason`

Body:
```
{
  reason: string  // 1..1000 chars, founder-typed, wrapped via renderUserContent in the prompt
}
```

Response:
```
{
  mode:    'acknowledge' | 'reframe' | 'mirror'
  message: string   // the agent's 2-3-sentence reply, addressed to the founder in second person
}
```

Pipeline (synchronous, ~2-3s p50, 5s timeout):

1. Auth + same-origin + rate limit (`AI_GENERATION` tier).
2. Tier check — Free returns 403 (Free can't pause anyway).
3. Ownership check — `prisma.venture.findFirst({ where: { id, userId } })` with the venture's current state for the engine prompt.
4. **Aggregate cross-venture history** for mirror-mode gating:
   - Count of paused ventures (currently and over the last 90 days)
   - Average completion ratio across paused ventures
   - Days since most recent pause
   - Existing `pauseReasonMode` counts in `('reframe', 'mirror')`
5. Run engine via `withModelFallback`:
   - Primary: Sonnet 4.6
   - Fallback: Haiku
   - Schema-validated structured output (PauseAgentResponseSchema)
6. Return mode + message. Do NOT persist anything yet — persistence happens on the actual pause click.
7. On error or timeout (>5s): return the static fallback shape `{ mode: 'static', message: <pauseGroundedCopy from current logic> }`. Client renders the same way.

### Engine: `lib/ventures/pause-reason-engine.ts`

Pure server function. Inputs:
- `reason` (founder-typed, wrapped via `renderUserContent`)
- `ventureContext` (name, status, current cycle progress %, days since started)
- `crossVentureAggregates` (the 4 mirror-mode signals above)
- `pausedSlotInfo` (founder is going from N to N+1 paused, with cap M)

Output (Zod-validated):
```
PauseAgentResponseSchema = z.object({
  mode:    z.enum(['acknowledge', 'reframe', 'mirror']),
  message: z.string()  // 1-3 sentences, second person, never moralising
});
```

System prompt (cached, stable across all founders) explicitly enumerates the three modes with examples and the hard constraint *"Never tell the founder their reason isn't legitimate. Never use the word 'legitimate.' Never use the word 'flinch.' Always end with the founder's autonomy."*

User content (cached prefix = aggregates + venture context, volatile suffix = the reason itself with triple-bracket delimiters).

### VentureCard changes

Inside the existing `confirming-pause` block:

1. **First state:** small textarea `"Why are you pausing?"` + buttons `[Continue without saying]` and `[Submit]`. The "continue without saying" button skips the agent and proceeds straight to the static fallback copy + Confirm pause.
2. **Loading state:** spinner with copy *"Reading your reason against your venture history…"* (~2-3s typical).
3. **Reply state:** the agent's `message` rendered inline. Buttons: `[Confirm pause]` (fires existing PATCH), `[Type a different reason]` (back to first state), `[Keep working]` (cancel).

Storage: when `Confirm pause` fires, the existing PATCH route receives an extended body `{ status: 'paused', pauseReason, pauseReasonMode }`. The PATCH route persists those alongside the status flip. **No new write endpoint** — augmenting the existing one.

Static fallback is wired so a failed/timed-out engine call renders the existing `pauseGroundedCopy` exactly as it does today. No regression.

### Schema migration

```prisma
model Venture {
  // ... existing fields
  pauseReason         String?   @db.Text
  pauseReasonMode     String?
  pausedAt            DateTime?
}
```

Migration name: `add_venture_pause_reason`. Pure additive, all nullable.

---

## Tests (per CLAUDE.md priorities)

- **Tier boundary:** POST /pause-reason returns 403 for Free.
- **Ownership boundary:** POST /pause-reason for someone else's venture returns 404.
- **Mirror-gate:** with `crossVentureAggregates` failing the 2-of-4 threshold, the engine prompt is told mirror mode is NOT eligible — the response always returns acknowledge or reframe. (Verified by mocking the LLM to return mirror; engine post-validates and either rejects or coerces.)
- **Fallback:** force a 6-second timeout in the engine — route returns `{ mode: 'static', message: <fallback copy> }` not a 500.
- **Transcript NOT persisted:** confirm `pauseReason` is null until Confirm pause is actually clicked.
- **PII delimiter:** the founder-typed reason MUST be wrapped via `renderUserContent` before reaching the prompt — unit test the engine builder.

Use Vitest + `MockLanguageModelV2`.

---

## Self-review checklist (before staging)

- CSRF: new route calls `enforceSameOrigin` ✓
- Rate limit: `AI_GENERATION` tier ✓
- Ownership scope: `findFirst({ id: ventureId, userId })` ✓
- Prompt injection: `renderUserContent` on the reason string ✓
- No race conditions: synchronous, single read + single LLM call, no DB writes
- No dead imports
- Engine uses `withModelFallback`, no bare `generateObject`
- Zod schema for LLM output: no `.max()`, no `.int()` (per CLAUDE.md Anthropic-output rules) ✓
- The PATCH route's pause path remains backward-compatible with old clients that don't send `pauseReason`/`pauseReasonMode` (both fields optional)

---

## Estimated work

- Schema migration: 15 min
- Engine + system prompt + Zod schema: 1.5 - 2h (the prompt is the feature; expect 2-3 iteration passes)
- POST /pause-reason route: 1h
- VentureCard dialog rework: 1.5h
- PATCH /ventures/[ventureId] extension to persist mode+reason: 30 min
- Tests: 1 - 1.5h
- Self-review + tsc + lint: 30 min

Total: roughly **5 - 7h** of focused work, single commit.

---

## What I want from you to proceed

Confirm or redirect each of D1 — D6 above. Once you answer, I'll:

1. Run the migration sql + Prisma generate.
2. Build the engine + route.
3. Wire VentureCard.
4. Write the tests.
5. tsc + lint.
6. Show you the diff before staging.

If anything looks off in the architecture above — particularly the **single-turn / no transcript** design or the **mirror-mode gating** — flag now. Easier to redesign before code than after.
