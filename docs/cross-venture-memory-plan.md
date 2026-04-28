# Cross-Venture Memory — Implementation Plan

Status: in progress (2026-04-28)
Owner: Saheed
Scope: Phase 7 lifecycle memory — cross-venture extension. Compound tier only.

---

## 1. The promise we're making true

`PricingSection.tsx:88` advertises Compound as "Cross-venture memory across all
3 of your ventures". Today this claim is false. `loadVentureSummaries` in
`lib/lifecycle/context-loaders.ts` is hard-scoped to one ventureId, every
caller passes a single ventureId, and `FounderProfile.journeyOverview` only
carries the most-recent venture *name* — no actual signal from the other arcs.

This document specifies the minimum change that makes the claim true: when a
Compound founder is operating in Venture B, the agents that run for them
(interview, recommendation synthesis, roadmap, continuation brief, per-task
tools) read a bounded, prompt-injection-safe context block summarising what
happened in Ventures A and C.

---

## 2. What "cross-venture memory" means in practice

A NEW context block, separate from the existing within-venture summaries,
that sits in the prompt directly after the within-venture cycle block.
Contents:

- The N most-recent COMPLETED cycles across all OTHER ventures owned by
  the same user.
- Each cycle rendered as: `[Venture: <name>] Cycle <N> (<recType>) —
  completed <ISO date>` followed by a compressed summary line set
  (recommendation summary, validated assumptions, invalidated assumptions,
  key learnings).

Tier gate: Compound only. Free + Execute receive the empty string. The
block is invisible to non-Compound users at every level (loader returns
`[]`, renderer returns `''`, prompt assembly drops empty blocks via
existing `.filter(b => b.length > 0)` patterns).

---

## 3. Token budget (N = 6, compressed)

- N = 6 cycles total across all OTHER ventures. Justification: Compound
  caps at 3 ventures, average ~2 completed cycles per venture before a
  founder pivots, ⇒ 6 is the realistic ceiling.
- Per-cycle string fields (validated / invalidated / key learnings) are
  joined with `·` and EACH string is hard-clipped to 200 chars in the
  renderer. Caps the per-cycle render at ~120 tokens regardless of how
  verbose the founder is.
- Total block target: ~720 tokens at N=6, ~1200 worst-case.
- Block lives in the cacheable stable prefix (changes only on cycle
  close, not on the per-turn volatile suffix), so Anthropic prompt
  caching pays the 0.1× cache hit rate for repeat reads inside the
  5-minute warm window.

Query bounded by tier (3 ventures max) × cycle count per venture; trivial
under realistic load. Revisit if a Compound power-user crosses 30+
cross-venture rows.

---

## 4. Schema decision: compute fresh per call

No `FounderProfile` schema change. No migration.

- Compute path: one Prisma query per agent call —
  `prisma.cycle.findMany({ where: { status: 'completed', venture: { userId, id: { not: currentVentureId }, archivedAt: null, status: { in: ['active','paused','completed'] } } }, orderBy: [{ completedAt: 'desc' }, { cycleNumber: 'desc' }], take: 6, select: { ... } })`.
- The relational filter chains through `Venture @@index([userId, status])`
  and `Cycle @@index([ventureId])`. The explicit `ORDER BY completedAt`
  may force a small sort step but row count is bounded; trivially cheap.
- Cache-on-profile alternative was considered and rejected: introduces
  invalidation hazard on every cycle close, requires the Lifecycle
  Transition Engine to write an aggregated digest, adds a new schema
  field — for a query that's already O(milliseconds) and bounded.

---

## 5. Edge-case rules (locked in)

1. **Forks**: include only the *terminal* cycle of each other venture's
   arc (the most recent completed cycle), not branch-point cycles. The
   founder's lesson is the venture outcome, not its mid-arc branches —
   and the terminal cycle's `forkSelected` already references the chain.
   Rule is enforced by the global N=6 cap + `completedAt DESC` ordering;
   if a venture has 3 completed cycles its terminal cycle wins the most
   recent slot before older cycles from the same venture do.
2. **Archived ventures excluded**: the `Venture.archivedAt = null` filter
   keeps tier-downgrade overflow ventures out of the context block. A
   founder cannot reach those ventures until they upgrade, so surfacing
   memories from them would be UX dead-ends.
3. **Status filter**: `Venture.status IN ('active','paused','completed')`
   — pretty much every non-deleted venture, but defensively explicit
   so a future status enum (e.g. `deleted`) doesn't silently leak.
4. **Cycle status**: `'completed'` only. `'in_progress'` cycles have no
   `summary` JSON and `'abandoned'` arcs aren't memory we want to
   over-weight.

---

## 6. The block label is the guardrail

The model has a documented tendency to over-import patterns from prior
ventures into the current one ("you did X in your hotel SaaS, do X here"
even when the current venture is wedding photography). The block is
prefixed with an explicit constraint:

```
## CROSS-VENTURE CONTEXT (other ventures the founder has run, NOT the current one)
Reference these only when relevant — patterns that recur across ventures,
lessons that compound, conviction that's been earned. Do not pull tactics
from these into the current venture without a real bridge.
```

This prefix appears in every renderer output. It is non-negotiable.

---

## 7. Prompt-injection defence

Every user-supplied string in the cross-venture block runs through
`renderUserContent()` with an appropriate maxLen. That covers:

- Venture name (200)
- Recommendation summary (400)
- Each validated/invalidated/keyLearning string (200, joined with `·`)

The existing SECURITY NOTE in each consumer prompt is unchanged — the
triple-bracket delimiters mean the new block is treated as opaque data
exactly like the existing `renderCycleSummariesBlock` content.

---

## 8. Per-agent integration matrix

| Consumer | Loader function | Where the block goes |
|---|---|---|
| Interview (`POST /api/discovery/sessions/[id]/turn`) | `loadInterviewContext` | After `renderCycleSummariesBlock(cycleSummaries)` in the interview prompt's stable prefix |
| Recommendation synthesis (`discoverySessionFunction`) | `loadRecommendationContext` | Appended to the existing `lifecycleBlock` step output |
| Roadmap generation (`roadmapGenerationFunction`) | `loadRoadmapContext` (NEW wiring — currently this function loads no lifecycle context) | Passed via a new optional `lifecycleBlock` arg on `generateRoadmap` |
| Continuation brief (`continuationBriefFunction`) | `loadContinuationBriefContext` | Appended to the existing `lifecycleBlock` step output |
| Per-task tools (Coach / Composer / Research / Packager) | `loadPerTaskAgentContext` | Block added alongside `founderProfileBlock` and threaded into each engine's prompt |

The roadmap generator currently passes `founderProfile = null` and reads
no lifecycle context at all. Wiring it for cross-venture pulls double
duty: the Compound founder gets cross-venture memory AND the existing
single-venture context that should already have been there. The change
to `generateRoadmap` is additive (new optional arg `lifecycleBlock?:
string`) so non-lifecycle callers and tests are untouched.

---

## 9. Tier gate location

Inside `loadCrossVentureSummaries(userId, currentVentureId)` itself:
fetch tier via `getUserTier(userId)`; if not `'compound'`, return `[]`
without touching the database. This means every consumer's loader code
stays identical — they read the same shape from the loader, the only
difference is whether it's empty for non-Compound users.

This is the single source of truth for the gate. No callers do their
own tier check; if they did, drift would be inevitable.

---

## 10. Tests (Vitest)

Per CLAUDE.md priorities — hard data invariants and security boundaries
first.

1. **Tier gate**: stub `getUserTier` → `'free'` and `'execute'`. Loader
   returns `[]` even when there are 5 completed other-venture cycles in
   the mocked DB.
2. **Tier gate (compound)**: stub `getUserTier` → `'compound'`. Loader
   returns the seeded other-venture cycles.
3. **Ownership boundary**: seed a cycle owned by a different user and a
   cycle owned by the current user. Loader returns ONLY the current-user
   cycle.
4. **Current-venture exclusion**: seed cycles in the current venture and
   another venture. Loader returns ONLY the other-venture cycles.
5. **Status filter**: seed `'completed'`, `'in_progress'`, `'abandoned'`
   cycles in another venture. Loader returns only the `'completed'` one.
6. **Archived-venture exclusion**: seed an archived other venture with a
   completed cycle. Loader excludes it.
7. **Bound + ordering**: seed 8 completed other-venture cycles with
   varying `completedAt` timestamps. Loader returns the 6 most recent in
   `completedAt DESC` order.

Tests mock Prisma + `getUserTier`. No real DB or LLM calls.

---

## 11. Rollout plan

1. Land the loader + renderer + wiring + tests behind no flag — the
   tier gate IS the rollout gate. Free and Execute see no change.
2. Dogfood on the founder's own Compound account (only Compound user
   today). Verify the cross-venture block renders sensibly in the
   interview turn prompt by logging the rendered block at DEBUG.
3. After 48h of dogfood with no regression in the existing within-
   venture flow, the change is the public Compound behaviour. No
   feature flag needed: the tier check is the gate, and Compound is
   the only tier that benefits. Adding a flag would be ceremony.

---

## 12. Out of scope this round

- FounderProfile schema reshape (no `crossVenturePatterns` aggregate
  field). If we ever want a higher-order pattern digest ("the founder
  consistently undershoots time estimates on cold-outreach tasks across
  ventures"), that's a follow-up: a separate engine that reads
  CycleSummaries on cycle close and writes back to the profile.
- Validation tool changes. Validation pages are venture-scoped; the
  cross-venture cut is orthogonal.
- Mobile app — the lifecycle module is server-only, mobile gets the
  benefit transparently through the agents it already calls.

---

## 13. Honest acknowledgement of limitations

- The block is a flat list of summaries, not an aggregated insight
  ("across your ventures you keep validating offer X but invalidating
  pricing Y"). The model is left to do the pattern-matching itself.
  This is intentional for the first release — we ship the data and let
  the agent do the cognition rather than building an aggregator that
  might bake in a bad heuristic. If qualitative review of the rendered
  block shows the model isn't picking up patterns reliably, we can
  layer an aggregator on top later.
- Compound currently has one user (the founder). All claims about
  block usefulness are speculative until there's a wider beta cohort.
