# Mobile–Web Parity (round 2) — Delivery Report

**Date:** 2026-04-23
**Branch:** `feat/mobile-web-parity-2` (cut from latest `main`, which
includes web commits that landed while the first parity sprint was in
flight)
**Predecessor:** [docs/mobile-web-parity-delivery-report-2026-04-23.md](mobile-web-parity-delivery-report-2026-04-23.md)

---

## Why this branch exists

While the first parity branch (`feat/mobile-web-parity`) was under
review, four web commits landed on `main`:

- `58c2761` — `feat(tools): recent-session sidebars for Composer + Coach — survive nav-away`
- `b7d987e` — `fix(roadmap): stop nudging tasks whose wall-clock bound is a week, not an hour`
- `78184b9` — `feat(composer→coach): handoff the drafted message into Coach setup`
- `dfb4084` — `fix(coach): thread sessionId through standalone setup → prepare → roleplay → debrief + refresh-restore`

Plus a handful of earlier fixes (`1891f9e`, `00b1b02`, `71e5706`,
`9f61d41`). Audited for mobile-parity impact — report below.

---

## Per-commit verdicts

| Commit | Type | Mobile action | Status |
|---|---|---|---|
| `78184b9` | Feature (Composer→Coach) | MIRROR — handoff on mobile | **Landed** (`73984f2`) |
| `dfb4084` | Backend + web refactor | Verify mobile body shapes | **Verified clean** |
| `00b1b02` | Composer field-name fix | Verify mobile body field | **Verified clean** |
| `1891f9e` | Refresh-restore (web-only) | None | N/A on mobile |
| `58c2761` | Session sidebars | MIRROR, needs state-restore | **Deferred — follow-up** |
| `b7d987e` | Nudge cron fix (backend) | None | N/A |
| `71e5706` | Textarea visual fix (web) | None | N/A |
| `9f61d41` | Timeout bump (backend) | None | N/A |

---

## What landed

### `73984f2` — Composer → Coach handoff on mobile

Web commit 78184b9 added a "Prepare for this conversation" action on
composer message cards that lands the founder in Coach setup with
their outreach context already populated. Mobile now mirrors that
behaviour.

**New helper:** `mobile/src/components/outreach/buildCoachSeed.ts` —
direct mirror of `buildCoachSeedFromComposerMessage` in
`client/src/app/(app)/tools/composer-handoff.ts`. Builds the seed
client-side from data mobile's Composer already holds (message +
channel + goal + targetDescription) so mobile does not need a
standalone-sessions endpoint round-trip for the handoff.

**Flow update:**
- `outreach.tsx`'s `handleCoachHandoff` now constructs the seed and
  passes it as a URL-encoded `coachSeed` query param.
- `coach.tsx` reads `coachSeed` from `useLocalSearchParams` and hands
  it to `SetupChat` as `initialDraft`.
- `SetupChat` gained the `initialDraft` prop and seeds its ChatInput
  via the controlled `value`/`onChangeText` contract that landed in
  the voice-input sprint. The founder can edit the seed before
  submitting.

### `73984f2` — Bonus: latent debrief URL typo fixed

`coach.tsx:123` had `"/api/discovery/roadmapId/${roadmapId}/coach/debrief"`
(note `roadmapId` instead of `roadmaps`). Pre-existing; not reached
today because mobile always enters Coach through a task card. One-
character fix while the file was open.

### Verifications — no mobile changes needed

**`00b1b02` (Composer regenerate field rename):** mobile's
`outreach.tsx:129` already posts `body: { messageId, instruction }`
— matches the current backend shape. The `variationInstruction`
field name only appears on mobile's `ComposerVariation` response
type (display), never on request bodies. **Clean.**

**`dfb4084` (Coach task-scoped route body shapes):**
- Task-scoped `coach/prepare` reads from the task's `coachSession`,
  no body expected. Mobile sends `{ setup: data }` — superfluous,
  not rejected (route never calls `request.json()`).
- Task-scoped `coach/debrief` similarly reads from the session,
  no body expected. Mobile sends `{ history }` — same deal.
- Task-scoped `coach/roleplay` has `BodySchema = z.object({ message })`.
  Mobile sends `{ message, history }` — extra `history` is stripped by
  Zod's default-strip behaviour on `.object()`. No error.

All three continue to function. The task-scoped routes were not
touched by `dfb4084` — that commit threaded sessionId through the
**standalone** flow, which mobile does not use yet. If mobile ever
adds a standalone coach entry point, those calls would need updates.

**`b7d987e` (nudge cron):** pure backend change to the Inngest
scheduler. Mobile receives the same push notifications the cron
fires, only at better-chosen times. **No mobile change.**

---

## Why session sidebars (`58c2761`) were deferred

The web feature adds persistent "recent sessions" panels on the
Coach and Composer standalone pages. Clicking a session restores
state by:
1. Fetching the session via the new `GET /coach/sessions/[sessionId]`
   or `GET /composer/sessions/[sessionId]` endpoint,
2. Reading its current stage (setup / preparation / roleplay /
   debrief), and
3. Re-hydrating the state machine so the user lands where they left
   off.

On mobile, the equivalent needs:
1. A BottomSheet or dedicated screen to list sessions (not a sidebar —
   the mobile form-factor rules out that pattern),
2. The same session-read endpoints (already exist server-side),
3. A **state re-hydration** layer in `coach.tsx` / `outreach.tsx` that
   reads a persisted session and rebuilds the multi-stage local state
   correctly (currently both screens only build state forward from an
   empty setup — there's no "load from existing session" path).

Step 3 is the real work; it's essentially a state-machine refactor,
not a UI addition. Implementing the list without step 3 would show
sessions the founder cannot actually resume on mobile — which is
worse than no sidebar at all.

**Follow-up sprint** will design the re-hydration layer properly
(what state lives in a persisted coach session, how mobile's
stage flags map, behaviour when a restored session is mid-stream).
Tracking as a separate scoped piece of work rather than rushing a
half-complete version in this branch.

---

## Verification

**`pnpm exec tsc --noEmit` on mobile — PASS.** Only the three
pre-existing `@neuralaunch/constants` resolution errors appear,
documented in every prior delivery report.

**No new dependencies** added in this branch.

---

## Files touched (commit `73984f2`)

```
mobile/src/app/roadmap/[id]/coach.tsx
mobile/src/app/roadmap/[id]/outreach.tsx
mobile/src/components/coach/SetupChat.tsx
mobile/src/components/outreach/buildCoachSeed.ts   (new)
```

---

*Report prepared 2026-04-23. Commit `73984f2` carries the Co-Authored-By
trailer per repository convention. Session-sidebar work deferred to a
named follow-up sprint.*
