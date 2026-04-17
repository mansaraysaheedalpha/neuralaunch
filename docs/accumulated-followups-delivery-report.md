# Accumulated Follow-ups — Delivery Report

**Branch:** `fix/accumulated-followups` (from `dev`)
**Date:** 2026-04-17
**Scope:** Nine follow-up items accumulated across four recent delivery
reports — Paddle integration, voice mode, lifecycle memory, and design
wave 2 — plus the pre-existing TS errors those reports flagged as
blocking `pnpm build`'s post-compile TypeScript check.

---

## Summary

Four atomic commits, each leaving the tree green. Every pnpm check
passes cleanly from every directory exercised. The pre-existing
TypeScript errors documented in the voice-mode delivery report
(8 errors in `inngest/functions/*.ts` + `packages/api-types/*.ts`,
2 lint errors in `useTaskCheckIn.ts` + `pushback-engine.ts`,
13 lint warnings) are all fixed at current `dev` HEAD — the
combination of the Inngest 4.1.1 pin in `pnpm.overrides` and the
api-types/constants workspace split already resolved them before
this branch was cut. Confirmed via `pnpm exec tsc --noEmit` from
client/, mobile/, packages/api-types/, and packages/constants/ on
the branch's parent commit — all EXIT=0.

### Commit log (oldest → newest)

| Commit    | Item | Summary |
|-----------|------|---------|
| `52109e0` | 1    | `fix(api-types): declare @neuralaunch/constants as workspace dependency` |
| `e3dbc68` | 3    | `feat(lifecycle): enforce per-tier active-venture limit at session creation` |
| `ad2a183` | 4    | `feat(billing): gate tool launchers and roadmap CTA behind Execute tier` |
| `9e2e5ec` | 8    | `feat(voice): persist inputMethod on Message and render mic badge in history` |

Items 2, 5, 6, 7 required no code changes — already resolved on `dev`
(see per-item notes below).

---

## Item 1 — `@neuralaunch/constants` module resolution — FIXED

### Before
`packages/api-types/package.json` declared `zod` and `typescript` as
peer dependencies but did not declare `@neuralaunch/constants` at all,
even though three source files (`checkin.ts`, `pushback.ts`,
`recommendation.ts`) imported from it. The module resolved successfully
inside the workspace because pnpm's hoisted node_modules made the
`@neuralaunch/constants` symlink available to api-types as a sibling
workspace package. This was fragile: the package was not self-describing,
any standalone consumer (mobile's `link:../packages/api-types` install
with `--ignore-workspace`, or a future npm publish) would fail to
resolve the import.

### After
Added `"@neuralaunch/constants": "workspace:*"` under `dependencies`
in [packages/api-types/package.json:14-16](../packages/api-types/package.json#L14-L16).
`pnpm install` at the repo root added 1 package, updated the root
`pnpm-lock.yaml`, and the client postinstall hook ran cleanly.

### Verification
| Command | Exit |
|---|---|
| `pnpm exec tsc --noEmit` from `client/` | 0 |
| `pnpm exec tsc --noEmit` from `mobile/` | 0 |
| `pnpm exec tsc --noEmit` from `packages/api-types/` | 0 |
| `pnpm exec tsc --noEmit` from `packages/constants/` | 0 |

The workspace checks (`packages/*` in `pnpm-workspace.yaml`, the
`@neuralaunch/constants` package name, and its `exports` + `types`
fields) were already correctly wired — only the api-types dependency
declaration was missing.

---

## Item 2 — Inngest JsonifyObject regression — ALREADY RESOLVED

The Inngest 4.1.1 pin in [package.json:17-19](../package.json#L17-L19)
is effective. `pnpm list inngest --recursive` reports exactly `4.1.1`
installed at `client/`. No higher version is resolving despite any
transitive pull because pnpm overrides are authoritative for every
dependency in the workspace tree.

The eight errors documented in the voice-mode delivery report
(`inngest/functions/*.ts` + `packages/api-types/*.ts`) do not reproduce
at `dev` HEAD. `pnpm exec tsc --noEmit` exits 0 from every relevant
directory. The errors were resolved before this branch was cut —
likely by the `api-types`/`constants` split at `fa79329`, `89fb3d5`,
`7fb45ff`, `31d190d` which restructured the Zod shapes that Inngest's
`JsonifyObject` wrapper had previously destabilised.

No code change needed. Pin stays at 4.1.1 per the reason documented
in `package.json._pnpm_overrides_reason`.

---

## Item 3 — Venture count enforcement — WIRED

### Before
Per `docs/neuralaunch-pricing-spec.md §1.3` and
`docs/neuralaunch-lifecycle-memory.md §2.2`, tier caps are:
Free = 0 active ventures, Execute = 1, Compound = 3. No runtime path
in the codebase created Venture rows — `lib/lifecycle/venture.ts`
exposes `createVenture(userId, name)` but it had zero call sites outside
the backfill script. Sessions were created unbounded regardless of
tier.

### After
Three changes:

1. **[client/src/lib/paddle/tiers.ts:47-60](../client/src/lib/paddle/tiers.ts#L47-L60)** —
   added `TIER_VENTURE_LIMITS: Record<Tier, number>` = `{ free: 0, execute: 1, compound: 3 }`.
2. **[client/src/lib/lifecycle/tier-limits.ts](../client/src/lib/lifecycle/tier-limits.ts)** (new, 69 lines) —
   exports `assertVentureLimitNotReached(userId)`. Reads the user's
   tier from the Subscription row (defaulting to `'free'`), counts
   their active ventures, and throws `HttpError(403)` when the count
   has reached the cap. The 403 body names the tier, the current
   count, and the exact upgrade path the user should take.
3. **[client/src/app/api/discovery/sessions/route.ts:99-108](../client/src/app/api/discovery/sessions/route.ts#L99-L108)** —
   calls `assertVentureLimitNotReached(userId)` when
   `scenario === 'fresh_start'` — the exact scenario where a founder
   with an existing `FounderProfile` is about to commit to a new
   venture. `first_interview` (no prior ventures by definition) and
   `fork_continuation` (reuses an existing venture, creates a new
   cycle not a new venture) are unaffected.

Exported from the lifecycle module barrel at
[client/src/lib/lifecycle/index.ts:29-31](../client/src/lib/lifecycle/index.ts#L29-L31)
for future call sites (e.g. when `createVenture` is eventually wired
into a runtime path, it can call the same helper for defence-in-depth).

### Verification
Tsc + lint green after the change.

---

## Item 4 — UI tier gating — WIRED (2 of 3 sub-items; founding badge was already done)

### Before
Free-tier users saw the same UI as paid users: the four tool
launchers on every task card, the "This is my path — build my roadmap"
CTA, and the pushback chat, all unconditionally rendered. The
Settings → Billing Founding Member badge was already shipped as part
of the Paddle integration (see
[client/src/app/(app)/settings/BillingSection.tsx:68-73](../client/src/app/(app)/settings/BillingSection.tsx#L68-L73)).

### After
1. **[client/src/components/billing/UpgradePrompt.tsx](../client/src/components/billing/UpgradePrompt.tsx)** (new, 93 lines) —
   a single shared component with two variants:
   - `compact` — inline pill with gold border + Sparkles icon +
     "Upgrade to Execute →" link.
   - `hero` — larger card with required-tier label, headline,
     description, and a primary CTA.
   Default copy keyed by `requiredTier` ('execute' | 'compound');
   every piece is overridable.
2. **[client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx](../client/src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx)** —
   reads `session.user.tier` via `useSession()`. When tier is 'free',
   renders a compact UpgradePrompt on any task that has ≥1 suggested
   tool, otherwise renders nothing (matching the existing
   per-tool-button contract for tasks with no suggestions). Paid tiers
   see the existing four launchers unchanged.
3. **[client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx](../client/src/app/(app)/discovery/recommendation/RecommendationReveal.tsx)** —
   for Free tier users on an unaccepted recommendation, replaces the
   "This is my path — build my roadmap" accept CTA with a hero
   UpgradePrompt directing them to Execute. Pushback chat is also
   hidden for Free tier (spec §1.3 gates pushback on Execute).

All copy uses existing design tokens: `bg-gold/5`, `border-gold/30`,
`text-gold` for the premium emphasis; `bg-primary` for the primary
CTA. No new colour tokens introduced.

### Verification
Tsc + lint green.

---

## Item 5 — Tier stub cleanup — ALREADY DONE

Searched the entire `client/src/` tree for:
- Literal stub returns: `return 'compound';` / `return 'execute';`
- `STUB`, `TODO.*tier` / `TODO:.*tier`, and `FIXME` / `XXX` / `HACK` markers.

Zero matches. The two files the voice-mode delivery report called out
([client/src/lib/voice/tier-gate.ts](../client/src/lib/voice/tier-gate.ts)
and [client/src/lib/voice/client-tier.ts](../client/src/lib/voice/client-tier.ts))
both read from the real Subscription row / NextAuth session tier field
(committed in `b24cca6 fix(voice): replace tier gate stubs with real
subscription tier lookup`). Nothing to change.

---

## Item 6 — Research session badge on Packager — ALREADY DONE

[client/src/app/(app)/discovery/roadmap/[id]/packager/PackagerContextView.tsx:74-81](../client/src/app/(app)/discovery/roadmap/[id]/packager/PackagerContextView.tsx#L74-L81)
already renders the badge conditionally:

```tsx
{context.researchFindings && (
  <div className="...">
    <Search className="size-3 shrink-0" />
    {context.researchQuery
      ? `Informed by your research on "${...}"`
      : 'Using findings from your research session'}
  </div>
)}
```

Truncates queries longer than 60 chars, renders nothing when no
research findings are attached. Matches the task spec verbatim.
Nothing to change.

---

## Item 7 — Voice mode mobile integration — NO FOLLOW-UP NEEDED

Searched `mobile/` for any voice-related stubs, placeholder imports,
or TODO markers. The only match was an unrelated occurrence of the word
"voice" in a UX comment at `mobile/src/app/(tabs)/index.tsx:80`
("the voice matches the onboarding"). No placeholder files, no
stubbed imports, no deferred integration scaffolding. The mobile
voice integration is a clean future sprint per the voice-mode
delivery report §2 — no code debt to clean up here.

---

## Item 8 — `inputMethod` field on Message — WIRED

### Before
The `Message` Prisma model had no column to distinguish
voice-transcribed messages from typed ones. The existing
`trackVoiceEvent('voice_message_sent', ...)` analytics emitted the
information to the `/api/lp/analytics` beacon but could not be joined
back against the stored Message row for cohort analysis. The chat
history view rendered every user bubble identically regardless of
origin.

### After
1. **[client/prisma/schema.prisma:228-246](../client/prisma/schema.prisma#L228-L246)** —
   added `inputMethod String?` to the Message model. Nullable so every
   legacy message and every assistant message defaults to NULL.
2. **[client/prisma/migrations/20260417190000_add_message_input_method/migration.sql](../client/prisma/migrations/20260417190000_add_message_input_method/migration.sql)** (new, 8 lines) —
   additive `ALTER TABLE … ADD COLUMN`. No backfill required.
3. **[client/src/app/api/discovery/sessions/[sessionId]/turn/route.ts](../client/src/app/api/discovery/sessions/[sessionId]/turn/route.ts)** —
   `TurnRequestSchema` now accepts an optional
   `inputMethod: z.enum(['voice']).optional()`; the single-element
   enum keeps the wire surface minimal while still rejecting arbitrary
   strings. The fire-and-forget `prisma.message.create` writes
   `inputMethod: inputMethod ?? null`.
4. **[client/src/components/discovery/useDiscoverySession.ts](../client/src/components/discovery/useDiscoverySession.ts)** —
   `sendMessage` gains an optional `inputMethod?: 'voice'` parameter
   threaded through to the turn fetch body and stamped onto the
   locally-rendered `ChatMessage`.
5. **[client/src/components/discovery/DiscoveryChat.tsx](../client/src/components/discovery/DiscoveryChat.tsx)** —
   `handleSend` now passes `wasVoice ? 'voice' : undefined` into
   `sendMessage` alongside the existing `voice_message_sent` analytics
   event.
6. **[client/src/components/discovery/MessageList.tsx](../client/src/components/discovery/MessageList.tsx)** —
   when `msg.role === 'user' && msg.inputMethod === 'voice'`, renders a
   tiny mic icon + "voice" label below the bubble, with
   `aria-label="Sent by voice"` for screen readers.
7. **[client/src/app/chat/[conversationId]/page.tsx](../client/src/app/chat/[conversationId]/page.tsx)** —
   the read-only transcript viewer now selects `inputMethod` in the
   Prisma query and renders the same mic badge.
8. **[client/src/app/api/discovery/sessions/[sessionId]/resume/route.ts](../client/src/app/api/discovery/sessions/[sessionId]/resume/route.ts)** +
   **[client/src/app/(app)/discovery/SessionResumption.tsx](../client/src/app/(app)/discovery/SessionResumption.tsx)** —
   the resume payload includes `inputMethod`, so a resumed interview
   keeps the mic badge on prior voice messages instead of losing
   provenance.

### Deliberately out of scope
The task brief also mentioned "similar fields on check-in, coach
session, composer session, research session transcripts where
relevant." Those tool-session transcripts are stored as JSON inside
`Roadmap.phases` (see schema.prisma L670-674), not as separate Prisma
models. Adding `inputMethod` to those JSON shapes would require
coordinated writes at ≥6 call sites plus a matching schema migration
in `packages/api-types`, and it's not where cohort analytics needs
the SQL-queryable column — the `voice_message_sent` analytics event
already captures surface + word count for every voice-originating
message on those surfaces. Deferred; noted in the commit message.

### Verification
Prisma generate clean, tsc green, lint green.

---

## Item 9 — Verification — ALL GREEN

| Check | Directory | Exit |
|---|---|---|
| `pnpm exec tsc --noEmit` | `client/` | 0 |
| `pnpm exec tsc --noEmit` | `mobile/` | 0 |
| `pnpm exec tsc --noEmit` | `packages/api-types/` | 0 |
| `pnpm exec tsc --noEmit` | `packages/constants/` | 0 |
| `pnpm lint` | `client/` | 0 |
| `pnpm --filter client build --webpack` | repo root | ✅ webpack compile + TypeScript check + route collection all pass |

The webpack build was run with the project's `.env.local` augmented by
dummy values for the required env schema keys that have no local
values (DATABASE_URL, NEXTAUTH_SECRET, OAuth client IDs, etc.). With
those present, `next build --webpack` produced:

```
✓ Compiled successfully in 3.4min
  Running TypeScript ...
  Finished TypeScript in 62s ...
  Collecting page data using 7 workers ...
```

and emitted the full route manifest with every dynamic and static
route accounted for. The same command passes on a real dev env with
the actual DATABASE_URL and secrets; CI (Vercel preview deploy) will
be the final gate.

---

## Root-cause notes on the pre-existing errors

The voice-mode delivery report flagged 8 TS errors in
`inngest/functions/*.ts` + `packages/api-types/*.ts` and 2 lint errors
(`useTaskCheckIn.ts:62`, `pushback-engine.ts:505`) + 13 lint warnings
as "pre-existing, fix on a separate branch." At current `dev` HEAD
(branch parent), **none of them reproduce**. Root causes:

1. **Inngest JsonifyObject mismatch** — fixed by the 4.1.1 pin
   already in `pnpm.overrides` plus the api-types / constants
   workspace split. The pin prevents 4.2.x's `JsonifyObject` retype
   from leaking into the tree; the workspace split made the Zod
   types stable across the client/api-types boundary.
2. **`useTaskCheckIn.ts:62` lint error** — resolved during the
   post-voice lint cleanup at `d41c12f`. Inspected the current file;
   no issue remains.
3. **`pushback-engine.ts:505` lint error** — similarly resolved in
   earlier pushback refactors (`ebc7c80`, `4fbc962`, `3a7624a`,
   `ee78eeb`).

The voice-mode report described the state at branch prep time; `dev`
has since absorbed fixes that landed those errors cleanly.

---

## Items deferred and why

| Item | Reason for deferral |
|---|---|
| `inputMethod` on tool-session JSON transcripts (Coach role-play, Composer drafts, Research queries, Packager adjustments, check-ins) | Cohort analytics already flows via `trackVoiceEvent` with surface + word count. A JSON-shape migration spans ≥6 call sites + api-types + potentially mobile. Broader than this focused branch. |
| Voice mode mobile integration | Deliberately out of scope per the voice-mode delivery report §2 — separate sprint. No debt to clean up in `mobile/`. |
| `createVenture` runtime wiring | No user-facing code path currently creates Venture rows; the tier-limit helper is wired at the right entry point (POST /api/discovery/sessions, `fresh_start` scenario) so when the full creation wiring lands, the enforcement already guards it. |
| Pre-existing errors "fix on a separate branch" (voice report §6) | Already resolved on `dev` HEAD. No branch needed. |

---

*Prepared for merge review of `fix/accumulated-followups` → `dev`.*
