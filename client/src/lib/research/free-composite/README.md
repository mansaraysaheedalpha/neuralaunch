# free-composite — community pain-signal aggregator

The `community_pulse` tool. Fans out across nine free public sources, normalises to a unified `Mention` shape, dedupes by content hash, re-ranks for relevance, and hands the result to the Stage 3 Pain Scout agent.

**Stage 3 only.** Registered in `lib/research/tools.ts` only when `agent === 'stage3-pain-scout'`. Stages 1/2 never see this tool — their jobs (outcome definition, expected-profile derivation) don't need pain-finding, and exposing it would let the agent burn the research budget on irrelevant fan-out.

---

## Permanent non-goals — DO NOT change these without a written decision

These are non-goals at any future scale, not just v1. Future contributors: if you're about to undo one of these, find the decision history first.

- **No Reddit via any direct path.** No subreddit RSS, no Reddit Data API at any tier, no scraping. Reddit's commercial terms are not accessible to a self-serve consumer; the GummySearch shutdown (November 2025) and the Reddit v. Perplexity suit (October 2025) make this a permanent operational risk.

- **No third-party data brokers that pass legal exposure back to us.** Apify Reddit actors specifically banned. Apify's terms leave target-site ToS compliance with the customer; Apify cannot indemnify a Reddit C&D. Same logic for any future "we scrape X for you" service.

- **No Stack Exchange.** Their ToS explicitly bars use of Site Content for AI/LLM purposes. Even though we'd love their content, we don't touch it.

- **No Mastodon full-text search.** Hashtag timelines only, per `mastodon.social`'s July-2025 ToS update. Calling `type=statuses` against any instance is forbidden.

- **No Indie Hackers scraping.** No public API, no official RSS, ToS bans automated access.

- **No Pushshift.** Commercially closed.

**What IS allowed and should NOT be confused with the above:** Tavily and Exa search results that surface URLs from any platform (Reddit, X, LinkedIn, Stack Overflow, etc.). We're consuming a downstream search index those vendors already maintain — we never make a request to the underlying platform ourselves, never bypass any access control, never aggregate content from a single platform as a primary purpose. If Tavily returns a Reddit URL with a snippet, the agent surfaces the URL + snippet attributed to the source, the founder clicks through to read on Reddit themselves. We are a search-result router; we are not the redistributor.

---

## Source list

| Source | Auth | Notes |
|---|---|---|
| HN Algolia (`hn.algolia.com/api/v1/search`) | none | Full-text search across HN stories + comments |
| HN Firebase (`hacker-news.firebaseio.com/v0`) | none | Real-time enrichment for HN items by ID |
| Bluesky AppView (`public.api.bsky.app/xrpc/app.bsky.feed.searchPosts`) | none | Anchor source — high founder/dev density |
| Lemmy (`programming.dev` only) | optional | Dev-niche only; skip `lemmy.world` / `lemmy.ml` for now |
| Mastodon hashtag timelines (`mastodon.social/api/v1/timelines/tag/{hashtag}`) | unauth | Hashtag timelines only — never `type=statuses` |
| GitHub Issues + Discussions (`api.github.com/search/issues`) | PAT (`GITHUB_PAT`) | "People complaining about a tool" source |
| Dev.to (`dev.to/api/articles`) | optional (`DEVTO_API_KEY`) | Articles with `body_markdown` |
| Hashnode (`gql.hashnode.com`) | none | GraphQL feed |
| Lobste.rs (`lobste.rs/search.rss`) | none | RSS preferred over JSON; polite ~1 req/s |

Each client wraps `cachedFetch` from `lib/research/cache.ts` with a 10-minute TTL (community signals move fast; cache long enough to dedupe within a scout-run, not so long that "current" content is stale).

---

## PII handling — load-bearing

- `excerpt` is hard-capped to **280 characters** at `normalize.ts` time, server-side.
- Source URLs and author handles are surfaced as metadata.
- **Full post bodies NEVER persist on our side.** The founder clicks through to read the source themselves.
- We are a search-result router, not a content redistributor.

Anything that loosens these rules requires a written decision and a coordinated update to the `PainPointSchema`'s `evidenceExcerpt` cap in `lib/ideation/stage3-opportunities/schema.ts`.

---

## Fail-open semantics

The orchestrator (`index.ts → searchAll`) uses `Promise.allSettled` across all nine clients. Per-client wall-clock timeout is 8 seconds. Failed clients log a warn + return `[]` to the merger; cross-source dedupe + re-rank runs on the union of successful results. If ALL clients fail, an empty array is returned and a critical-level error is logged.

The shape contract is in `types.ts → FanOutClientResult`. Every client's outcome — `ok` / `skipped` / `error` — is recorded in the researchLog entry so the audit log shows exactly which source went down for any given scout-run.

---

## On-call runbook — upstream breakage

When a single source starts erroring consistently:

1. Check the failing client's last successful call timestamp in Sentry (filter by `research.cache.provider = community-pulse-<source>`, look for the `cache.result = miss` spans that subsequently produced no hit).
2. Test the upstream endpoint manually (curl with the same params). Vendor-specific tips:
   - **HN Algolia:** rare outages; usually rate limit (~10k/hr). Tighten cache TTL temporarily if needed.
   - **Bluesky AppView:** cursor pagination occasionally breaks on long queries. Truncate query to <200 chars.
   - **GitHub Issues:** 403 means the PAT expired. Check `env.GITHUB_PAT` is set and has `public_repo` scope.
   - **Mastodon hashtag:** the instance may have moved to invite-only. Try a different public instance if the one we use has gone dark.
   - **Lobste.rs RSS:** politeness matters. We send ~1 req/s; if we breach this they'll temp-ban our IP.
3. If the upstream is genuinely down: the client's per-client try/catch returns `[]` and the fan-out continues with the other eight. No action needed at the application layer.
4. If two or more sources are down simultaneously: check the Bluesky / Hacker News status pages first (they're the anchors). Open a tracking issue.

The agent gracefully handles a low-mention-count result — it surfaces a "limited coverage" note to the founder and nudges them toward the Human Scout layer.

---

## Why this file lives inside the module

Saheed's directive (2026-05-15): per-module READMEs co-locate with the code they document. The `docs/` directory is reserved for canonical project-wide docs (ARCHITECTURE.md, RUNBOOK.md, vision docs). Engineers touching this module should find the ToS notes + runbook by reading the directory.
