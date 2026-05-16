# Stage 3 — Opportunity Identification: Handoff Brief

**Status at session close (2026-05-16, third update):** Commit #3 of 4 ready to stage. Commits #1 + #2 already landed locally on 2026-05-15 (not pushed; full Stage 3 batch pushes after commit #4 lands). Local main relative to `origin/main`:
- `db7b49c` — `fix(ideation): edit-mode dead-end + synth paragraph headroom` (prior session)
- `d1952af` — `feat(research): cache layer + Tavily/Exa retrofit` (commit #1)
- `f84d646` — `feat(research): free-composite pain-scout (9 clients + orchestrator)` (commit #2)
- **PENDING** — `feat(ideation): Stage 3 backend (schema, state, agent, pushback, composer, handler, routes) + cross-stage cascade` (commit #3 — uncommitted in working tree as of this update)

**Test suite at last verification: 303/303 passing across 19 files.** tsc clean. lint 0 errors (6 pre-existing warnings in untouched files; the two original Stage 3 warnings — unused `i` in score-pushback render-helper and unused `PainPointSchema` import in state.ts — were cleaned up during the audit pass).

Commit #3 surface inventory (working tree, ready to stage):
- `packages/constants/src/ideation.ts` (extended): `FOUNDER_CONTEXT_TAGS`, `PAIN_POINT_STATUSES`, `PAIN_SCORE_PUSHBACK_ACTIONS`, `PAIN_SCORE_PUSHBACK_MODES`
- `client/src/lib/ideation/stage3-opportunities/` (10 files): `constants.ts`, `schema.ts`, `state.ts`, `calibration-prompts.ts`, `extractor.ts`, `pain-scout-agent.ts`, `score-pushback.ts`, `composer.ts`, `agent.ts` (streaming), `index.ts`, plus 4 colocated `*.test.ts` files
- `client/src/lib/ideation/stage-run-store/stage3-transitions.ts` (new): markStage3OutputReady, markStage3Committed, persistFounderPainPoint, persistReplacePainPoint, persistRemovePainPoint, persistStage3RecommendedAction, persistPainPointPushbackRound, persistPainScoutRunResult
- `client/src/lib/ideation/stage-run-store/cross-stage-cascades.ts` (extended): cascadeStage1OrStage2EditToStage3, restoreStage3FromCascadeSnapshot, clearStage3CascadeSnapshot
- `client/src/lib/ideation/stage-run-store/cascade-stage3.test.ts` (new): 15 tests pinning the 3-rule state machine across the 7 scenarios
- `client/src/lib/ideation/stage-run-store/index.ts` (extended): new exports
- `client/src/lib/ideation/index.ts` (extended): `export * from './stage3-opportunities'`
- `client/src/app/api/discovery/sessions/[sessionId]/turn/stage3-handler.ts` (new): mirrors stage2-handler pattern (load upstream → extract+plan → persist founder pain points → apply recommendedAction → dispatch synthesis/soft_close/compose/stream)
- `client/src/app/api/discovery/sessions/[sessionId]/turn/no-idea-dispatcher.ts` (extended): Stage 3 case added; default 501 now covers only stages 0/4/5
- `client/src/app/api/ideation/stage-runs/[id]/commit/route.ts` (extended): Stage 3 commit allowed; Stage 1 commit clears Stage 2 + Stage 3 cascade snapshots; Stage 2 commit clears Stage 3 cascade snapshot
- `client/src/app/api/ideation/stage-runs/[id]/edit/route.ts` (extended): fires cascadeStage1OrStage2EditToStage3(..., 'stage1') after the Stage 2 cascade
- `client/src/app/api/ideation/stage-runs/[id]/discard-edit/route.ts` (extended): fires restoreStage3FromCascadeSnapshot(..., 'stage1') after the Stage 2 restore
- `client/src/app/api/ideation/stage-runs/[id]/pain-scout-run/route.ts` (new): AI_GENERATION rate-limit, MAX_SCOUT_RUNS cap, maxDuration=90
- `client/src/app/api/ideation/stage-runs/[id]/founder-pain-point/route.ts` (new): POST add / PATCH edit-or-score / DELETE remove, API_AUTHENTICATED rate-limit (no LLM)
- `client/src/app/api/ideation/stage-runs/[id]/pain-point-pushback/route.ts` (new): AI_GENERATION rate-limit, optimistic-lock via scorePushbackVersion, maxDuration=90, MAX_PAIN_SCORE_PUSHBACK_ROUNDS cap

Audit passes verified pre-commit: CSRF (`enforceSameOrigin` on every state-changing route), rate limits (AI_GENERATION on LLM-firing routes, API_AUTHENTICATED on plain writes), ownership scope (every read via `requireOwnedStageRun` / single-query `findFirst` with session relation filter), Zod body validation, `withModelFallback` on every `generateText`/`generateObject` call, `renderUserContent` + SECURITY NOTE in every prompt, `httpErrorToResponse` for every catch, no `console.log` / TODO / FIXME / `as unknown as` in production paths (composer test fixture is the only exception, fine since it's not a JSON-column read).

**Pre-existing gap NOT addressed in this commit:** there is no path in the codebase that creates the Stage 2 row (and by extension the Stage 3 row) lazily after Stage 1 commits. `createInitialStageRunsForNoIdea` only creates Stages 0 + 1, and `markStage1Committed` does not seed a Stage 2 row. This is a pre-existing issue that Stage 2 batch shipped with — Stage 3 inherits the same shape (all cascade helpers no-op cleanly when the Stage 3 row is absent). Out of scope for commit #3; flag separately to fix as a small follow-up — likely the right shape is to extend `markStage1Committed` (and `markStage2Committed`) inside a `prisma.$transaction` to upsert the next-stage row in 'authoring' state. Until that lands, the end-to-end flow (Stage 1 commit → Stage 2 chat) can't actually reach Stage 2 in the product, so Stage 3 routes will be reachable only in manual / scripted setups.

This brief is self-contained. The next session should be able to pick up commit #4 (Stage 3 UI surfaces) without re-reading the original Stage 3 brief or re-litigating any approved decisions.

---

## 1. Project context

NeuraLaunch's **No Idea** archetype runs a 6-stage ideation pipeline. **Stages 0, 1, 2 are shipped.** Stage 3 — Opportunity Identification — produces a ranked shortlist of pain points the founder can pursue in Stage 4.

Stage 3 reads two upstream artifacts:
- Stage 1's `OutcomeDocument` (timeHorizon / financialGoal / riskTolerance / lifestylePreference)
- Stage 2's `RequirementsDocument` (skill inventory + expected profile + constraints)

It writes `IdeationStageRun(stageNumber=3).output` as a status-discriminated JSON (`authoring` / `output_ready` / `committed`). The shape is `Stage3AuthoringStateSchema` (authoring) or `PainInventoryDocumentSchema` (output_ready / committed).

---

## 2. Approved architectural decisions (locked, do not re-litigate)

### 2.1 Cross-stage cascade — three-rule state machine

Stage 3 has **two** upstream cascade sources (Stage 1 + Stage 2). The state machine handles both via a single `cascadeSnapshot.triggeringStages: ('stage1' | 'stage2')[]` array.

Schema on `Stage3AuthoringState`:
```ts
cascadeSnapshot: {
  document:         PainInventoryDocument,
  triggeringStages: ('stage1' | 'stage2')[],
  snapshottedAt:    string,
} | null
requiresRederivation: boolean
```

Three rules — apply for any upstream `X ∈ {stage1, stage2}`:

| Event | Action |
|---|---|
| `X /edit` on committed Stage 3 | If snapshot null: revert Stage 3 to authoring, create snapshot with `triggeringStages=[X]`. If snapshot exists: add `X` to `triggeringStages`. Set `requiresRederivation=true`. |
| `X /discard-edit` | Remove `X` from `triggeringStages`. If list empties AND snapshot exists: restore (status→prior, output→snapshot doc, clear flag). If list empties AND snapshot null (cleared by prior commit): no-op. |
| `X /commit` (recommit after edit) | If snapshot exists and contains `X`: NULL the entire snapshot AND clear `triggeringStages`. `requiresRederivation` stays true. |

**Cascade test must pin all 7 brief-specified scenarios** in `cascade-stage3.test.ts`: S1 only edit, S2 only edit, both at once, only-S1 discard, only-S2 discard, both discard, recommit after one but not the other.

### 2.2 UI directory split — establish per-stage pattern now

Stage 3's 5 new components land in **`components/ideation/stage3/`** subdirectory. This:
- Honors CLAUDE.md's "group by feature into subdirectory" for component dirs at cap
- Establishes the pattern Stages 4 + 5 will follow
- Leaves Stage 1 and Stage 2 components where they are; retro-migrate to `stage1/` and `stage2/` in a **separate small follow-up commit** after Stage 3 ships, not as part of this batch

### 2.3 Pain Scout vendor stack — all 9 clients in commit #2

Build all 9 free-composite clients in one commit. Same shape per client (~60-120 LOC each), single orchestrator with fan-out + dedupe + fail-open. Phasing creates two surfaces to maintain (orchestrator lands twice, partial then complete). Tests cover the full set in one go.

Vendor list (no paid vendors, no Reddit-direct, no Stack Exchange — see permanent non-goals in §6):

| Source | Auth | Notes |
|---|---|---|
| HN Algolia | none | full-text search across HN stories + comments |
| HN Firebase | none | real-time enrichment for HN items by ID |
| Bluesky AppView (`public.api.bsky.app/xrpc/app.bsky.feed.searchPosts`) | none | anchor source — high founder/dev density |
| Lemmy (`programming.dev` only) | optional | dev-niche only; skip `lemmy.world` / `lemmy.ml` for now |
| Mastodon hashtag timelines | unauth | hashtag timelines only — never `type=statuses` (mastodon.social ToS bars scrapers post-July-2025) |
| GitHub Issues + Discussions | PAT | "people complaining about a tool" source |
| Dev.to | optional api-key | `articles[]` with `body_markdown` |
| Hashnode | none | GraphQL feed |
| Lobste.rs | none | RSS preferred over JSON; polite ~1 req/s |

Tavily + Exa stay as their existing peer tools (already retrofitted in commit #1). Pain Scout uses all three families during a scout-run.

### 2.4 free-composite/ directory structure

```
lib/research/free-composite/
├── index.ts                 — community_pulse tool() export
├── types.ts                 — Mention, SourceClient
├── normalize.ts             — vendor → Mention; URL canonicalize; dedupe
├── relevance.ts             — keyword + semantic re-rank via Exa embeddings
├── README.md                — module-internal docs (TOS notes, runbook, permanent-non-goals)
└── clients/
    ├── hn-algolia.ts
    ├── hn-firebase.ts
    ├── bluesky.ts
    ├── lemmy.ts             — programming.dev only
    ├── mastodon-hashtags.ts — hashtag timelines only
    ├── github-issues.ts     — PAT
    ├── devto.ts
    ├── hashnode.ts          — GraphQL
    └── lobsters.ts          — RSS preferred
```

Root has 5 files + 1 subfolder = **6 entries**, well under the 12-file cap. README stays in the module per Saheed's co-location override on the original plan question.

---

## 3. Commit #1 — DONE

**SHA: `d1952af` — `feat(research): cache layer + Tavily/Exa retrofit`**

File inventory:
- `client/src/lib/research/cache.ts` — new, 211 lines. `cachedFetch<T>` wrapper with sha256 keys, exhaustively-typed TTL table, read-timeout-fallthrough, fire-and-forget writes, span attributes for `research.cache.{provider, result, latency_ms}`.
- `client/src/lib/research/cache.test.ts` — new, 235 lines. 15 tests pinning all invariants (hit/miss/bypass paths, TTL respected, timeout/error fallthrough, Redis-unavailable, write-failure non-fatal, key stability, prefix isolation).
- `client/src/lib/research/tavily-client.ts` — modified. `searchOnce(query, log, { bypassCache? })` wraps `liveSearchOnce` via `cachedFetch`. Normalized queryKey (lowercase + trim + whitespace collapse).
- `client/src/lib/research/exa-client.ts` — modified. `exaSearchOnce(query, numResults, log, { bypassCache? })` wraps `liveExaSearchOnce`. `numResults` folded into queryKey (`n=N|q=...`). `withExaSearchSpan` stays inside the live path so cache hits don't open spurious search spans.

Verification at commit time: tsc 0 errors, 222/222 tests passing across 13 files, lint 0 errors.

---

## 4. Commit roadmap — #1 done, #2 next

| # | Title | Status |
|---|---|---|
| 1 | `feat(research): cache layer + Tavily/Exa retrofit` | **DONE** (`d1952af`, local, unpushed) |
| 2 | `feat(research): free-composite pain-scout (9 clients + orchestrator)` | **DONE** (`f84d646`, local, unpushed) |
| 3 | `feat(ideation): Stage 3 backend (schema, state, agent, pushback, composer, handler, routes) + cross-stage cascade` | NEXT — start of next session |
| 4 | `feat(ideation): Stage 3 UI surfaces` | After #3 — **PAUSE** for product-voice copy approval before this one |

**Push only after #4 completes** (commits 1-4 batch together).

## Commit #2 file inventory (for reference when wiring commit #3)

```
lib/research/
├── env.ts                                — GITHUB_PAT + DEVTO_API_KEY added (optional)
├── research/types.ts                     — RESEARCH_AGENTS gains 'stage3-pain-scout'; RESEARCH_TOOLS gains 'community_pulse'
├── research/constants.ts                 — RESEARCH_BUDGETS.stage3-pain-scout = 8 steps
├── research/tools.ts                     — buildResearchTools spreads buildCommunityPulseTool
└── research/free-composite/
    ├── README.md                         — permanent non-goals + TOS notes + runbook
    ├── types.ts                          — Mention, SourceClient, FanOutResult
    ├── normalize.ts                      — clampExcerpt(280), canonicaliseUrl, dedupeByContentHash
    ├── relevance.ts                      — combinedRelevance, rankByRelevance
    ├── index.ts                          — searchAll() + buildCommunityPulseTool()
    ├── free-composite.test.ts            — 21 tests covering fan-out + dedupe + URL canonical + fail-open + tool gating
    └── clients/
        ├── hn-algolia.ts
        ├── hn-firebase.ts
        ├── bluesky.ts
        ├── lemmy.ts                      — programming.dev only
        ├── mastodon-hashtags.ts          — hashtag timelines only
        ├── github-issues.ts              — PAT-gated
        ├── devto.ts
        ├── hashnode.ts                   — GraphQL
        └── lobsters.ts                   — RSS
```

**Important wire-points commit #3 must consume:**
- Import `buildCommunityPulseTool` from `@/lib/research/free-composite` (or it gets included automatically because tools.ts already spreads it — the Stage 3 agent's `buildResearchTools` call gets all 3 tools when `agent: 'stage3-pain-scout'`).
- Stage 3 agent's system prompt needs guidance for community_pulse. The existing `RESEARCH_TOOL_USAGE_GUIDANCE` in `tools.ts` only describes exa_search + tavily_search — write a new `RESEARCH_TOOL_USAGE_GUIDANCE_STAGE3` that includes all three OR craft the guidance inline in Stage 3's `pain-scout-agent.ts`. The community_pulse description in the tool definition is already explicit about Reddit/Stack Exchange exclusions and what the agent should nudge the founder toward.

---

## 5. Commit #2 — full plan

### 5.1 File inventory

```
lib/research/free-composite/
├── index.ts                 ~200 lines — community_pulse tool() export, fan-out + dedupe + re-rank
├── types.ts                  ~80 lines — Mention, SourceClient
├── normalize.ts             ~200 lines — vendor → Mention, URL canonicalize, cross-source dedupe by content hash
├── relevance.ts             ~150 lines — keyword + semantic re-rank using Exa embeddings
├── README.md                       — TOS notes per source, on-call runbook, permanent-non-goals
└── clients/
    ├── hn-algolia.ts        ~120
    ├── hn-firebase.ts       ~100
    ├── bluesky.ts           ~150
    ├── lemmy.ts             ~100  programming.dev only
    ├── mastodon-hashtags.ts ~120  hashtag timelines only
    ├── github-issues.ts     ~150  PAT
    ├── devto.ts             ~100
    ├── hashnode.ts          ~150  GraphQL
    └── lobsters.ts          ~120  RSS preferred
```

### 5.2 Each client wraps `cachedFetch` from commit #1

Every client passes its `CacheProvider` literal (`'community-pulse-bluesky'`, etc.) and a normalised queryKey. Default TTL = 10 min from the table in `cache.ts`.

Each client also needs to register its own `CacheProvider` in the existing union in `cache.ts` — **already done in commit #1** (all 9 community-pulse literals are typed).

### 5.3 Cross-source dedupe by content hash

`normalize.ts` produces a unified `Mention` shape:
```ts
type Mention = {
  source:      'hn' | 'bluesky' | 'lemmy' | 'mastodon' | 'github' | 'devto' | 'hashnode' | 'lobsters';
  url:         string;          // canonicalised (strip utm_*, trailing slash, fragment)
  authorHandle: string | null;
  excerpt:     string;          // ≤280 chars, post-clamped for PII handling (see §5.6)
  postedAt:    string;          // ISO
  score?:      number;          // upvote count / engagement, where available
  contentHash: string;          // sha256(normalised excerpt) — dedupe key
};
```

Dedupe: keep the first occurrence by `contentHash`. URL canonicalization first so the same Lemmy post via two URL variants collapses to one row.

### 5.4 Fail-open semantics

- `Promise.allSettled` across all 9 clients
- Per-client wall-clock timeout (8s proposed)
- Failed clients log a warn + return `[]` to the merger
- Cross-source dedupe + re-rank runs on the union of successful results
- If ALL clients fail → return empty array + log critical error

### 5.5 community_pulse tool — Stage 3 only

Register via `buildResearchTools({ agent: 'stage3-pain-scout', ... })`. The agent's tool list shrinks for non-stage3 agents (they don't see `community_pulse`). Reason: Stage 1/2 agents don't need pain-finding; budget eaten by community fan-out when it should be spent on outcome / skill research.

### 5.6 PII handling — bake into normalize.ts

- `evidenceExcerpt` truncated to 280 chars at normalize time (server-side, not later in the agent)
- Source URLs and author handles surfaced as metadata
- **Never persist full post bodies on our side** — the founder clicks through to read the source themselves
- We are a search-result router, not a content redistributor

### 5.7 Tests for commit #2

`lib/research/__tests__/free-composite.test.ts`:
- Fan-out parallelism (all 9 clients invoked, not sequential)
- Dedupe by content hash (two clients return the same content → one row in output)
- URL canonicalization (utm_* stripped, trailing slash normalised)
- One-source-failure doesn't collapse the result (mock one client to throw, others succeed)
- Per-client timeout enforced
- `community_pulse` tool only registered when `agent === 'stage3-pain-scout'`
- Cache wrapping confirmed (each client calls `cachedFetch` with the correct provider literal)

---

## 6. PERMANENT NON-GOALS — bake into commit #2's `free-composite/README.md` AND into the orchestrator's top-comment

These stay non-goals at any future scale. Document the reasoning so future contributors don't accidentally undo:

- **No Reddit via any direct path.** No subreddit RSS, no Reddit Data API at any tier, no scraping. Reddit's commercial terms aren't accessible to a self-serve consumer; the GummySearch shutdown (Nov 2025) and Reddit v. Perplexity suit (Oct 2025) make this a permanent operational risk.

- **No third-party data brokers that pass legal exposure back to us.** Apify Reddit actors specifically banned. Apify's terms leave target-site ToS compliance with the customer; Apify cannot indemnify a Reddit C&D. Same logic for any future "we scrape X for you" service.

- **No Stack Exchange.** Their ToS explicitly bars use of Site Content for AI/LLM purposes. Even though we'd love their content, we don't touch it.

- **No Mastodon full-text search.** Hashtag timelines only, per mastodon.social's July-2025 ToS update. The agent must not call `type=statuses`.

- **No Indie Hackers scraping.** No public API, no official RSS, ToS bans automated access.

- **No Pushshift.** Commercially closed.

**What IS allowed and should NOT be confused with the above:** Tavily and Exa search results that surface URLs from any platform (Reddit, X, LinkedIn, Stack Overflow, etc.). We're consuming a downstream search index those vendors already maintain — we never make a request to the underlying platform ourselves, never bypass any access control, never aggregate content from a single platform as a primary purpose. If Tavily returns a Reddit URL with a snippet, the agent surfaces the URL + snippet attributed to the source, the founder clicks through to read on Reddit themselves. We are a search-result router; we are not the redistributor.

---

## 7. Follow-up flags carried from commit #1

These are NOT blockers; they're TODOs to revisit when the symptom appears. Both are documented in `cache.ts` already:

1. **Vercel serverless fire-and-forget reality check.** `writeFireAndForget` attaches `.catch()` but doesn't extend the function execution context past response-send. On Vercel the instance can be torn down immediately after response, killing the in-flight `redis.set()`. If we ever observe lower-than-expected cache hit rates in production, the fix is `waitUntil(redis.set(...))` from `@vercel/functions`. TODO comment is in `cache.ts` near `writeFireAndForget`. Threshold for action: hit rate < ~30%.

2. **Composite cache-key separator on Exa.** `n=${numResults}|q=${normalised}` relies on `|` not appearing in normalised queries. sha256 makes collisions astronomically unlikely either way, but a future provider with pipe characters in the query side would warrant switching to `JSON.stringify({n, q})`. Cosmetic; not blocking.

---

## 8. Engineering standards (mandatory — re-read before starting)

Same as Stage 0/1/2 — read CLAUDE.md. Highlights:

- pnpm only (never npm, never yarn)
- File caps as specified per file (Stage 2's `expected-profile-pushback.ts` accepted-with-note at 424 lines is precedent for the Stage 3 score-pushback engine; otherwise hold the line)
- Tokenized Tailwind utilities only — no raw hex
- All `generateObject` / `generateText` calls wrap `withModelFallback`
- All `streamText` calls go through `streamQuestionWithFallback` with `maxRetries: 0`
- `renderUserContent` + SECURITY NOTE on every embedded user-content interpolation — including `community_pulse` mention excerpts
- Canonical route handler shape (CSRF, auth, rate limit, ownership scope, `httpErrorToResponse`)
- Zod LLM output rules: **no `.max()` on strings, no `.int()/.min()/.max()` on numeric fields**. Post-clamp via state.ts helpers.
- JSON column reads via safeParse helpers; writes via `toJsonValue`
- No `console.log` — use `src/lib/logger.ts`
- No `// @ts-ignore` or `as unknown as` JSON casts

### Client-side imports of @/lib/ideation

**Hard rule** (learned from commit `8000e1f`): client components must NEVER import from the `@/lib/ideation` barrel. The barrel transitively pulls server-only modules even via wildcard re-exports. Use specific paths:

| What you need | Path |
|---|---|
| Stage 2 types | `@/lib/ideation/stage2-requirements/schema` |
| Stage 1 types | `@/lib/ideation/stage1-outcome/schema` |
| Stage 2 constants | `@/lib/ideation/stage2-requirements/constants` |
| Stage 1 constants | `@/lib/ideation/constants` |

Stage 3 will need: `@/lib/ideation/stage3-opportunities/schema` and `@/lib/ideation/stage3-opportunities/constants` once that module exists in commit #3.

---

## 9. Workflow

Per Saheed's saved review-before-commit feedback:

1. Before staging each commit: focused audit pass (CSRF, rate limits, ownership scope, dead imports, race conditions, plus anything domain-specific for the commit).
2. **Ping Saheed for review BEFORE staging commit #2.** Do not stage without his green light. He wants to read the orchestrator + at least one client (probably Bluesky as the anchor) before the rest land.
3. After his approval: stage + commit (no push).
4. Push only after commit #4 completes.

---

## 10. Out of scope — DO NOT touch

- Stages 4 and 5 (not built)
- The existing 5 archetypes' Discovery flow
- Pushback engine, roadmap generation, validation, transformation reports, continuation briefs
- Mobile app
- Any paid vendor for community monitoring (Octolens, Syften, Brand24, Mention, F5Bot, Apify) — feature-flagged for future, not built in this batch
- Stage 1 + Stage 2 retro-migration to subdirectories (separate small commit after Stage 3 ships)

---

## 11. Commit #3 — full plan

### 11.1 File inventory for `lib/ideation/stage3-opportunities/`

```
stage3-opportunities/
├── index.ts                  barrel
├── constants.ts              MIN_PAIN_POINTS_FOR_COMMIT=3, SHORTLIST_TARGET=5, SHORTLIST_CAP=5,
│                              MAX_SCORE_PUSHBACK_ROUNDS=5, MAX_SCOUT_RUNS=5,
│                              EVIDENCE_EXCERPT_MAX_CHARS=280, MAX_RECOMMENDED_ACTIONS_STAGE3=25
├── schema.ts                 PainPointSchema, PainInventoryDocumentSchema,
│                              Stage3AuthoringStateSchema, ScorePushbackHistoryEntrySchema
├── state.ts                  createEmpty*, safeParse*, applyExtractions, appendPainPoint (id via
│                              crypto.randomUUID), appendRecommendedAction (FIFO), computeCombinedScore
│                              (= intensity × frequency × nicheSpecificity), computeStage3Readiness
├── extractor.ts              classify + extract founder-side pain points + plan agent move
├── pain-scout-agent.ts       generateText tool-loop with community_pulse + tavily + exa,
│                              stopWhen: stepCountIs(RESEARCH_BUDGETS['stage3-pain-scout'].steps)
├── calibration-prompts.ts    per-move prompts: challenge intensity, challenge niche specificity,
│                              validate founder additions, recommend homework
├── score-pushback.ts         per-pain-point score pushback (5 rounds), mirrors Stage 2's
│                              expected-profile-pushback.ts almost exactly — two-phase
│                              Opus-reasoning → Sonnet-emit; same defend/refine/replace pattern
├── composer.ts               selects shortlist (top-N by combinedScore from founderFinalScores),
│                              writes rulesOut prose, snapshots full pain inventory
└── __tests__/
    ├── extractor.test.ts
    ├── pain-scout-agent.test.ts
    ├── score-pushback.test.ts
    ├── composer.test.ts
    └── state.test.ts
```

### 11.2 Schema details (from §2.1 + the original Stage 3 brief)

`Stage3AuthoringStateSchema`:
```ts
{
  agentPainPoints:    PainPoint[],
  founderPainPoints:  PainPoint[],
  recommendedActions: RecommendedAction[],
  researchLog:        ResearchLogEntry[],
  scoutRunCount:      z.number(),
  cascadeSnapshot: z.object({
    document:         PainInventoryDocumentSchema,
    triggeringStages: z.array(z.enum(['stage1', 'stage2'])),
    snapshottedAt:    z.string(),
  }).nullable(),
  requiresRederivation: z.boolean(),
}
```

`PainPointSchema`:
```ts
{
  id:                   z.string(),           // crypto.randomUUID() at creation
  description:          z.string(),
  source:               z.enum(['agent', 'founder']),
  // agent-side fields (null when source='founder')
  evidenceUrl:          z.string().nullable(),
  evidenceExcerpt:      z.string().nullable(),    // ≤280 chars, post-clamped (mirrors normalize.ts clamp)
  communityOrigin:      z.string().nullable(),    // "Hacker News thread", "Bluesky", "GitHub issue"
  agentRelevanceNote:   z.string().nullable(),
  // founder-side fields
  founderContext:       z.enum(FOUNDER_CONTEXT_TAGS).nullable(),
  founderNotes:         z.string().nullable(),
  // shared
  agentSuggestedScores: z.object({
    intensity:         z.number(),
    frequency:         z.number(),
    nicheSpecificity:  z.number(),
    reasoningPerMetric: z.string(),
  }).nullable(),
  founderFinalScores:   z.object({
    intensity:         z.number(),
    frequency:         z.number(),
    nicheSpecificity:  z.number(),
  }).nullable(),
  combinedScore:        z.number().nullable(),    // computed from founderFinalScores via state.ts helper
  scorePushbackHistory: z.array(ScorePushbackHistoryEntrySchema),
  scorePushbackVersion: z.number(),                // optimistic lock per pain point
  status:               z.enum(PAIN_POINT_STATUSES),
}
```

`PainInventoryDocumentSchema`:
```ts
{
  painPointsSnapshot: z.array(PainPointSchema),
  shortlist:          z.array(z.string()),     // ordered top-N painPoint ids
  shortlistFloor:     z.literal(3),
  shortlistTarget:    z.literal(5),
  shortlistCap:       z.literal(5),
  rulesOut:           z.string(),               // "why these 5 and not others"
  recommendedActions: z.array(RecommendedActionSchema),
  researchLog:        z.array(ResearchLogEntrySchema),
  composedAt:         z.string(),
}
```

**CLAUDE.md schema rules apply throughout:** no `.max()` on strings, no `.int()/.min()/.max()` on numbers in LLM-output schemas. Clamps live in `state.ts` (see Stage 1's `state.ts` for the canonical pattern: `clamp()`, `clampConfidence()`, `clampExcerpt`-style helpers).

### 11.3 Constants extension (`packages/constants/src/ideation.ts`)

```ts
export const FOUNDER_CONTEXT_TAGS = [
  'own_life', 'close_relationship', 'industry_observation', 'existing_solution_gap',
] as const;

export const PAIN_POINT_STATUSES = [
  'pending_rating', 'rated', 'rejected_by_founder',
] as const;
```

### 11.4 Cross-stage cascade extension

`lib/ideation/stage-run-store/cross-stage-cascades.ts` — extend with:
- `cascadeStage1OrStage2EditToStage3(sessionId, userId, triggeringStage: 'stage1'|'stage2')` — called by both Stage 1's `/edit` route AND Stage 2's `/edit` route
- `restoreStage3FromCascadeSnapshot(sessionId, userId, dischargingStage: 'stage1'|'stage2')` — called by both `/discard-edit` routes
- `clearStage3CascadeSnapshot(sessionId, userId, triggeringStage: 'stage1'|'stage2')` — called by both `/commit` routes

Update Stage 1 + Stage 2 `/edit`, `/commit`, `/discard-edit` handlers to fire the Stage 3 cascade helpers as appropriate.

**Test surface** (`cascade-stage3.test.ts`) — pin all 7 brief scenarios in one file:
1. Stage 1 only edit → revert + snap['stage1']
2. Stage 2 only edit → revert + snap['stage2']
3. Both edit at once → snap['stage1','stage2']
4. Only Stage 1 discard → keep snap if 'stage2' still in list
5. Only Stage 2 discard → restore when list empties
6. Both discard → restore
7. Recommit after one but not the other → snap cleared, founder must re-derive

### 11.5 Turn route + handler

- Extend `no-idea-dispatcher.ts` (built in Stage 2) with a `case 3:` branch
- New `stage3-handler.ts` mirrors `stage2-handler.ts` shape: extract → apply → optional pain-scout-rerun → optional compose-fire-on-readiness → stream-move

### 11.6 Narrow API routes (`app/api/ideation/stage-runs/[id]/`)

- `pain-scout-run/route.ts` — re-fires the agent's Pain Scout. Rate limit `AI_GENERATION`. Counts against `scoutRunCount` (max 5/session).
- `founder-pain-point/route.ts` — POST add, PATCH edit, DELETE remove (the Human Scout layer). Rate limit `API_AUTHENTICATED`.
- `pain-point-pushback/route.ts` — one round of per-score pushback, optimistic-locked via `scorePushbackVersion`. Rate limit `AI_GENERATION`. `export const maxDuration = 90`.
- Extend existing `commit`, `edit`, `discard-edit` routes to handle Stage 3.

### 11.7 PAUSE for copy approval BEFORE commit #4

Same pattern as Stage 2. Items needing product-voice approval before UI lands:
- Stage 3 banner copy
- Calibration prompts per move
- "Reddit is not covered, here's why" UI nudge
- Composer's `rulesOut` prompt (share drafts with example outputs)
- Cascade UI wording for the "Stage 1 / Stage 2 changed beneath you" notice

---

## 12. Commit #4 — UI surfaces

`components/ideation/stage3/`:
- `PainInventoryCanvas.tsx` — two-column UI; **founder column primary** (left, larger), agent column secondary (right). Explicit framing: "This is your inventory; the agent's findings are a check."
- `PainPointCard.tsx` — per-pain-point with scores, evidence URL + 280-char excerpt, "discuss this" affordance, score-edit affordance
- `FounderPainPointForm.tsx` — quick-add for the Human Scout layer
- `ShortlistView.tsx` — top-5 ranked output
- `PainInventoryDocumentView.tsx` — review-mode renderer
- `PainPointPushbackDrawer.tsx` — mirrors Stage 2's `PushbackDrawer.tsx` exactly

Plus chat surface under `[sessionId]/stage3/` (or `[sessionId]/`):
- `Stage3ChatClient.tsx`, `Stage3Chat.tsx`, `Stage3Banner.tsx`, `useStage3Session.ts`

Page dispatch: extend `[sessionId]/page.tsx` with Stage 3 branches (`active.stageNumber === 3`). Bump `StageBeyondPlaceholder` threshold to `>= 4`.

**Client-component import discipline reminder** (from commit `8000e1f`): client components NEVER import from `@/lib/ideation` barrel. Use:
- `@/lib/ideation/stage3-opportunities/schema` for types
- `@/lib/ideation/stage3-opportunities/constants` for values

---

## 13. Session-open checklist for the next session

1. Read this brief end-to-end.
2. `git log --oneline origin/main..HEAD` — confirm 3 local-unpushed commits.
3. If origin has new commits, rebase before starting.
4. Start commit #3 with the `packages/constants/src/ideation.ts` extension (FOUNDER_CONTEXT_TAGS + PAIN_POINT_STATUSES), then schema.ts, then state.ts. Each subsequent file has a target type to write to.
5. Mirror Stage 2's `expected-profile-pushback.ts` directly when writing `score-pushback.ts` — same two-phase shape, same optimistic-lock pattern.
6. Build pain-scout-agent.ts last in commit #3, since it consumes everything else.
7. Cascade test (`cascade-stage3.test.ts`) lands with the cascade helpers, NOT with the routes — keep the unit-level invariants pinned independently from the route plumbing.
8. PAUSE before commit #4 for product-voice copy approval (Saheed will reply with finalized copy).
9. Final push happens only after commit #4 completes successfully and Saheed approves the full batch.

Good luck.
