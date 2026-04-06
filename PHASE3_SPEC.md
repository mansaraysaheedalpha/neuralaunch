# NeuraLaunch — Phase 3 Technical Specification
### The Landing Page Builder & Validation Engine

**Branch:** `feature/phase-3-validation-engine`
**Status:** Specification complete — not yet built
**Authors:** Saheed Alpha Mansaray
**Last updated:** 2026-04-05

---

## 1. What Phase 3 Is

Phase 3 is where NeuraLaunch stops being an advisor and becomes an active participant in the market.

Phases 1 and 2 produce text — a recommendation and a roadmap. The user reads them and then goes and does things in the world alone. Phase 3 deploys something real, measures how real people respond to it, and tells the user what to build based on what the market actually said. That closed loop is what no general-purpose AI tool can replicate.

```
Interview → Recommend → Plan → Deploy → Measure → Interpret → Build brief
```

ChatGPT exits after "Recommend." NeuraLaunch owns the entire arc.

---

## 2. Who Phase 3 Applies To

**Not everyone.** This is the most important design constraint in the phase.

Phase 3 activates only when the recommendation path is **technical** — a software product, a digital platform, a SaaS idea. The discovery engine already classifies audience type and knows the recommended path. That signal is the trigger.

For non-technical recommendations — the freelancer in Freetown, the pharmacist launching clinical services, the banking professional building a productised consulting offer — Phase 3 does not activate. Their roadmap already contains inline validation steps: customer conversations, outreach experiments, pricing tests. No separate Phase 3 surface is shown to them.

**The UI entry point:** A "Build Validation Page" button appears at the bottom of the recommendation page, below the roadmap link, only when the recommendation path is technical. It does not appear for non-technical recommendations.

---

## 3. Core Design Decisions (Locked In)

These decisions were made explicitly during planning and must not be revisited without documented reason.

### 3.1 Platform-served, not Vercel-deployed

The public validation page is served by the existing Next.js application at `startupvalidator.app/lp/[slug]`. Publishing is a database status change — `DRAFT → LIVE`. It is not a separate Vercel deployment.

**Why:** The route `src/app/lp/[slug]/page.tsx` already exists. Every page in the app is already on Vercel. There is no architectural reason to treat the validation page differently. Separate deployments would add: Vercel API credentials, deployment failure handling, 30–60 second publish latency, additional cost per user, and a second codebase surface to maintain. None of those serve the user.

**Future domain flexibility:** If a custom domain (`validate.neuralaunch.app`) is ever needed, it is a Next.js `rewrites` config change — not a separate deployment.

### 3.2 Content dynamic, structure controlled

Claude generates the **content** — headline, value proposition, problem statement, feature descriptions, CTA copy, survey questions — all derived from the recommendation and belief state. The content is specific to this person's exact path. No two pages read the same.

The **layout and structure** uses controlled templates (three variants). This is not a limitation — it is the engineering discipline that makes analytics reliable. If Claude generates raw HTML, PostHog event tracking breaks because class names and data attributes vary. Consistent structure means consistent measurement.

### 3.3 Draft → Preview → Publish flow

The page is never deployed directly to a public URL without the user seeing it first.

```
Generate (15s) → DRAFT status → In-app iframe preview → Approve or Regenerate → LIVE
```

DRAFT pages are accessible only to the authenticated owner. The auth gate is removed when status changes to LIVE.

### 3.4 Two-tier interpretation agent (Sonnet + Opus)

The interpretation agent runs in two distinct steps:

- **Step 1 — Data interpretation (Sonnet 4.6):** Reads PostHog snapshot. Produces structured intermediate object — feature click ranking, conversion rate assessment, survey theme extraction, signal strength score. Runs every scheduled cycle and on every threshold check.

- **Step 2 — Build brief synthesis (Opus 4.6):** Triggered only when minimum signal thresholds are crossed. Takes the Step 1 intermediate object as input. Produces the committed build brief. This is the call the user reads and acts on.

Most scheduled runs never reach Step 2. The Opus call fires only when there is enough signal to justify a real recommendation. This reduces Opus usage by 70–80% per page without compromising output quality at the moment that matters.

### 3.5 Configurable thresholds — never hardcoded

All threshold values live in `src/lib/validation/constants.ts`. They are starting assumptions that will need adjustment after the first real pages produce data. Hardcoded values require a code change. Configurable constants require a config change.

### 3.6 Traffic is Phase 3's responsibility, not the user's

A validation engine with no traffic produces nothing. The engine must address distribution at the moment of publish — not as documentation or advice, but as a specific three-channel distribution brief generated from the user's belief state. If the engine does not close the traffic gap, the validation loop never closes.

---

## 4. The Five Components

### Component 1 — Page Generation Engine

**Input:** `recommendationId`

**Process:**
1. Load `Recommendation`, linked `DiscoverySession` belief state, `Roadmap` phases and tasks
2. Claude Sonnet 4.6 generates page content as a structured object validated against `ValidationPageContentSchema`
3. Template selector picks one of three layout variants based on recommendation path category
4. Content + variant written to `ValidationPage` DB record with `status: DRAFT`
5. Draft URL immediately accessible to owner for preview

**What the page contains:**
- Hero section: headline, subheadline, value proposition — derived from recommendation summary and path
- Problem statement: in the user's own language from the interview belief state
- Solution statement: scoped to the recommended path, not generic
- Feature interest panel: one card per roadmap task, each with a "Notify me when this is ready" button — every click is a tracked data point
- Email capture / waitlist CTA
- Entry survey: "What made you sign up?" (3 optional radio options + free text)
- Exit intent survey: "What almost stopped you?" (triggered on scroll-away behaviour)

**The three layout variants** (auto-selected, not user-chosen):
- **Product** — for software products and platforms. Feature-heavy, prominent smoke test panel, technical credibility signals.
- **Service** — for consulting, agencies, productised services. Outcome-focused, social proof placeholder, contact/calendar CTA.
- **Marketplace/Community** — for two-sided products, communities, directories. Social proof emphasis, dual CTA.

**Regeneration:** User can request a new version with optional notes. Each regeneration creates a new Claude call and overwrites the content. Page remains in DRAFT until the user publishes.

---

### Component 2 — Analytics Layer

**Provider:** PostHog. Open source, strong programmatic API, no third-party data sharing concerns. Each validation page gets a distinct PostHog property — data is isolated per user and per recommendation.

**What is tracked:**
- Page views with session deduplication
- Scroll depth (percentage milestones: 25%, 50%, 75%, 100%)
- Time on page
- CTA click and conversion (visitor → signup)
- Feature interest button clicks — per roadmap task, with task ID, timestamp, session ID
- Entry survey responses
- Exit intent survey responses
- Traffic source — referrer bucketed into: direct, social, email, search, other

**What the user does not see directly:** Raw event streams, funnels, retention curves, session recordings. NeuraLaunch reads the data. The only live metrics shown to the user are visitor count and CTA conversion rate. Everything else is synthesised by the interpretation agent.

---

### Component 3 — Distribution Brief Generator

**Trigger:** Fires once at publish time (`DRAFT → LIVE`).

**Input:** Belief state (audience type, geographic market, technical ability, available time, target customer, what they have tried before) + recommendation + validation page content.

**Process:** Claude Sonnet 4.6 produces a `DistributionBrief` — three specific channels with exact message copy and realistic yield estimates. Stored on the `ValidationPage` record. Shown to the user immediately after publish.

**Each channel entry contains:**
- The channel — specific, not a category ("Freetown Business Network WhatsApp group", not "WhatsApp groups")
- The exact message to send — written in the user's voice, referencing their specific product
- Expected yield — honest and realistic ("typically 5–15 clicks in an active group of 100+")
- Audience reason — one sentence explaining why this channel for this person specifically

**Channel selection by audience type and market:**

| Audience Type | Primary channels |
|---|---|
| Lost Graduate | University alumni networks, graduate WhatsApp groups, LinkedIn (first-degree), student Facebook groups |
| Stuck Founder | Founder communities (Slack, Discord), local startup WhatsApp groups, previous customers from prior attempt |
| Established Owner | Existing customer base (direct message), supplier/partner networks, local business associations |
| Aspiring Builder | Developer communities, Product Hunt, IndieHackers, local tech meetup channels |
| Mid-Journey Professional | LinkedIn (colleagues and industry peers), professional association forums, industry Slack communities |

Geographic market narrows this further. A recommendation for someone in Freetown surfaces local WhatsApp networks and physical business networks first — not Product Hunt. A recommendation for someone in London surfaces LinkedIn and Slack communities. The engine knows the market from the belief state.

**In-app distribution tracker:** Below the preview, a simple checklist of the three channels. User ticks each when they have shared. When all three ticked: "Good — come back in 48 hours. If you have followed through, you should have meaningful data by then."

**What this does not do:** Does not automate posting. No WhatsApp, Twitter, or LinkedIn API integrations. The value is in the specificity of channel and message copy, not in automation.

---

### Component 4 — Scheduled Reporting Function (Inngest)

**Triggers:**
1. Scheduled: every 24 hours for each `ValidationPage` with `status: LIVE`
2. Threshold: immediately when page crosses meaningful milestones (configurable — see Section 6)
3. Manual: user can request a report refresh from the dashboard

**Process per run:**
1. Read PostHog snapshot via API — visitor counts, feature click distribution, survey responses, conversion rate
2. Run **Step 1 — Data interpretation** (Sonnet 4.6): produce structured `ValidationSnapshot` intermediate object
3. Write `ValidationSnapshot` to DB
4. Check against synthesis thresholds — if not crossed, store snapshot, end run
5. If thresholds crossed, run **Step 2 — Build brief synthesis** (Opus 4.6): produce `ValidationReport`
6. Write `ValidationReport` to DB
7. Mark `ValidationPage` as having new insights — triggers in-app notification

**Failure handling:** If PostHog API call fails, log and retry next cycle. If Sonnet call fails, Inngest retries (configured for 2 retries). If Opus call fails, snapshot is preserved — report is deferred to next cycle. No data is lost on failure.

**Archival logic:** Pages that exceed `MAX_ACTIVE_DAYS` without producing a build brief are flagged for archival. Draft pages not published within `DRAFT_EXPIRY_HOURS` are automatically archived.

---

### Component 5 — Interpretation Agent

This is the moat. No other tool does this.

**Step 1 — Data Interpretation (Sonnet 4.6)**

Input: raw `ValidationSnapshot` (PostHog data + survey responses)

Output: structured `ValidationInterpretation` object:
- `signalStrength`: 'strong' | 'moderate' | 'weak' | 'insufficient'
- `signalReason`: one sentence explaining the score
- `featureRanking`: roadmap tasks sorted by click volume, with percentage of total clicks
- `conversionAssessment`: how the CTA rate compares to baseline expectations
- `surveyThemes`: extracted themes from survey responses, not paraphrased
- `trafficAssessment`: visitor count vs time elapsed vs distribution brief completion
- `nextAction`: specific instruction for what the user should do next

When visitor count is below `MIN_VISITORS_FOR_BRIEF`, `nextAction` is always a distribution recommendation — not a product recommendation. The engine tells the person exactly what to do to generate the traffic that makes the validation work.

**Step 2 — Build Brief Synthesis (Opus 4.6)**

Triggered only when `MIN_VISITORS_FOR_BRIEF` and `MIN_FEATURE_CLICKS_FOR_BRIEF` are both crossed.

Input: `ValidationInterpretation` from Step 1 + full `ValidationSnapshot`

Output: structured `ValidationReport` — the committed recommendation:
- `signalStrength`: inherited and confirmed from Step 1
- `confirmedFeatures`: features the market expressed clear interest in — ranked, with evidence
- `rejectedFeatures`: features with low or zero interest — with plain-language explanation
- `surveyInsights`: what people said in their own words — not paraphrased into corporate language
- `buildBrief`: one committed recommendation. What to build first. What to defer. What to cut entirely. Same commitment principle as Phase 1: one answer, not a list of things to consider.
- `nextAction`: the single most important thing to do in the next 48 hours

**The standard the build brief must meet:**

"47 people visited. 12 clicked the CTA. The automated invoicing feature was clicked 31 times. The team collaboration feature was clicked 4 times. Build invoicing first — it is the only feature with sufficient interest to justify immediate development. Defer team collaboration until invoicing is live and has its own validated demand. Cut the AI suggestions feature — nobody clicked it and three survey respondents specifically said they do not trust AI with their finances. Your next action: write the invoicing feature spec this week and share it with the 12 people who signed up for feedback before building."

Anything less specific than that is not a build brief. It is commentary.

---

## 5. The Validation Dashboard (In-App UI)

**Sidebar addition:** "Validation Pages" section, below "Past Recommendations."

**Validation page list:** Each entry shows:
- Page title (derived from recommendation path)
- Live visitor count + CTA conversion rate
- Status indicator: Collecting data / Insights ready / Build brief ready
- Quick-share button (copies URL to clipboard)

**Page detail view:** Four panels:

**Panel 1 — Live page preview**
Iframe rendering the live URL. Refresh button. "Edit page" link (goes back to draft mode for regeneration).

**Panel 2 — Distribution tracker**
The three-channel checklist. Channels not yet ticked highlighted. When all complete: the 48-hour return message.

**Panel 3 — Current snapshot**
Visitor count, CTA conversion rate, feature interest bar chart (simple, horizontal, no libraries — pure Tailwind). Survey response count. Last updated timestamp. "Refresh data" button.

**Panel 4 — Interpretation report**
Shown when a report exists. The five-section structured output from the interpretation agent rendered in the same prose style as the recommendation — no charts, no tables. Data is summarised because the user came here to be told what to do, not to become an analyst.

At the bottom of Panel 4: "Mark validation complete and generate build brief" — a button that records the validation as complete and attaches the `ValidationReport` to the `Recommendation` record as the confirmed feature set for Phase 5.

---

## 6. Configurable Constants

```typescript
// src/lib/validation/constants.ts

/**
 * VALIDATION_SYNTHESIS_THRESHOLDS
 *
 * Controls when the interpretation agent escalates from data collection
 * to build brief synthesis (the Opus-tier call). These are starting assumptions
 * based on pre-launch reasoning — adjust after first real pages produce data.
 *
 * MIN_VISITORS_FOR_BRIEF: below this, sample size is too small to commit to a
 * build direction. Lowering increases false confidence. Raising delays insight.
 *
 * MIN_FEATURE_CLICKS_FOR_BRIEF: below this, feature interest data is noise.
 * A single person clicking all features skews the ranking. Needs distribution
 * across at least this many clicks before the ranking is meaningful.
 *
 * MIN_SURVEY_RESPONSES_FOR_SYNTHESIS: below this, qualitative synthesis is
 * anecdote not signal. The agent should note survey themes but not weight them
 * heavily until this threshold is crossed.
 *
 * DAYS_BEFORE_LOW_TRAFFIC_WARNING: if MIN_VISITORS_FOR_BRIEF is not reached
 * within this window, the next action recommendation switches from "wait for
 * data" to "your traffic strategy needs attention — here is what to do."
 *
 * THRESHOLD_CHECK_INTERVAL_HOURS: how often Inngest polls for threshold
 * crossing between scheduled 24-hour runs. Lower = faster insight surfacing,
 * higher = fewer unnecessary DB reads.
 */
export const VALIDATION_SYNTHESIS_THRESHOLDS = {
  MIN_VISITORS_FOR_BRIEF:             50,
  MIN_FEATURE_CLICKS_FOR_BRIEF:        5,
  MIN_SURVEY_RESPONSES_FOR_SYNTHESIS:  3,
  DAYS_BEFORE_LOW_TRAFFIC_WARNING:     4,
  THRESHOLD_CHECK_INTERVAL_HOURS:      6,
} as const;

/**
 * DISTRIBUTION_BRIEF_CONFIG
 *
 * Controls the distribution brief generated at publish time.
 *
 * CHANNEL_COUNT: number of channels surfaced. Three is the assumption —
 * enough to give options, few enough to be actionable. More than four
 * becomes a list the user ignores.
 *
 * MIN_GROUP_SIZE_FOR_RECOMMENDATION: do not recommend a channel unless it
 * is likely to have at least this many members. Prevents recommending dead
 * channels.
 */
export const DISTRIBUTION_BRIEF_CONFIG = {
  CHANNEL_COUNT:                       3,
  MIN_GROUP_SIZE_FOR_RECOMMENDATION:  25,
} as const;

/**
 * VALIDATION_PAGE_CONFIG
 *
 * Controls page lifecycle behaviour.
 *
 * MAX_ACTIVE_DAYS: after this many days without a build brief generated,
 * the page is flagged for archival. Prevents indefinitely active pages with
 * no meaningful data consuming scheduled function runs.
 *
 * DRAFT_EXPIRY_HOURS: a draft page not published within this window is
 * automatically archived. Prevents ghost drafts accumulating in the DB.
 */
export const VALIDATION_PAGE_CONFIG = {
  MAX_ACTIVE_DAYS:     30,
  DRAFT_EXPIRY_HOURS:  72,
} as const;
```

---

## 7. Data Model — New Prisma Models

### `ValidationPage`
```
id                String          @id @default(cuid())
userId            String
user              User            @relation(...)
recommendationId  String          @unique
recommendation    Recommendation  @relation(...)
slug              String          @unique   // readable, derived from path
status            ValidationStatus @default(DRAFT)  // DRAFT | LIVE | ARCHIVED
layoutVariant     String          // 'product' | 'service' | 'marketplace'
content           Json            // ValidationPageContent (generated by Claude)
distributionBrief Json            // DistributionBrief[] (generated at publish)
channelsCompleted String[]        // which distribution channels user has ticked
posthogPropertyId String?         // PostHog property for this page's analytics
createdAt         DateTime        @default(now())
publishedAt       DateTime?
archivedAt        DateTime?
snapshots         ValidationSnapshot[]
report            ValidationReport?

@@index([userId])
@@index([slug])
@@index([status])
```

### `ValidationSnapshot`
```
id                String         @id @default(cuid())
validationPageId  String
validationPage    ValidationPage @relation(...)
takenAt           DateTime       @default(now())
visitorCount      Int
uniqueVisitorCount Int
ctaConversionRate Float          // 0.0–1.0
featureClicks     Json           // { taskId: string, clicks: number }[]
surveyResponses   Json           // { question: string, answer: string }[]
trafficSources    Json           // { source: string, count: number }[]
scrollDepthData   Json           // { depth: number, percentage: number }[]
interpretation    Json?          // ValidationInterpretation from Sonnet Step 1
```

### `ValidationReport`
```
id                String         @id @default(cuid())
validationPageId  String         @unique
validationPage    ValidationPage @relation(...)
snapshotId        String
snapshot          ValidationSnapshot @relation(...)
generatedAt       DateTime       @default(now())
signalStrength    String         // 'strong' | 'moderate' | 'weak'
confirmedFeatures Json           // { taskId, title, clicks, percentage, evidence }[]
rejectedFeatures  Json           // { taskId, title, clicks, reason }[]
surveyInsights    String         @db.Text
buildBrief        String         @db.Text
nextAction        String         @db.Text
usedForMvp        Boolean        @default(false)
```

### Updated `Recommendation` model
```
// Add relation:
validationPage    ValidationPage?
```

---

## 8. New Zod Schemas

```typescript
// src/lib/validation/schemas.ts

ValidationPageContentSchema     // What Claude generates: hero, features, CTA, surveys
DistributionChannelSchema       // Single channel: name, message, yield, reason
DistributionBriefSchema         // Array of 3 DistributionChannel
ValidationInterpretationSchema  // Step 1 Sonnet output: signal, ranking, next action
ValidationReportSchema          // Step 2 Opus output: build brief, confirmed/rejected features
```

---

## 9. New API Routes

```
POST   /api/discovery/recommendations/[id]/validation-page
       — generate draft validation page from recommendationId

GET    /api/discovery/validation-pages/[id]
       — get validation page status, content, distribution brief

PATCH  /api/discovery/validation-pages/[id]
       — update status (DRAFT→LIVE, LIVE→ARCHIVED), tick distribution channels

POST   /api/discovery/validation-pages/[id]/regenerate
       — regenerate page content with optional user notes

GET    /api/discovery/validation-pages/[id]/report
       — get current interpretation report and latest snapshot

POST   /api/discovery/validation-pages/[id]/complete
       — mark validation complete, attach report to recommendation for Phase 5

GET    /api/lp/[slug]/analytics
       — server-side PostHog event ingestion (feature clicks, survey responses)
       — called from the public lp/[slug] page, no auth required
```

---

## 10. New Inngest Functions

```
validation-page-reporting          — scheduled 24h + threshold-triggered
  Steps:
    load-validation-page           — fetch page + latest PostHog data
    interpret-snapshot             — Sonnet Step 1: produce ValidationInterpretation
    store-snapshot                 — write ValidationSnapshot to DB
    check-thresholds               — compare against VALIDATION_SYNTHESIS_THRESHOLDS
    synthesise-build-brief         — Opus Step 2: produce ValidationReport (gated)
    store-report                   — write ValidationReport to DB
    notify-user                    — mark page as having new insights

validation-page-lifecycle          — scheduled daily
  Steps:
    archive-stale-drafts           — DRAFT pages past DRAFT_EXPIRY_HOURS
    flag-low-traffic-pages         — LIVE pages past DAYS_BEFORE_LOW_TRAFFIC_WARNING
    archive-expired-pages          — LIVE pages past MAX_ACTIVE_DAYS
```

---

## 11. Build Sequence

Each step must be working before the next begins. No exceptions.

| Step | What | Key output |
|---|---|---|
| 1 | Prisma schema — 3 new models + migration | DB tables live |
| 2 | `src/lib/validation/constants.ts` | Configurable thresholds |
| 3 | `src/lib/validation/schemas.ts` | Zod schemas for all validation types |
| 4 | `src/lib/validation/index.ts` | Public module barrel |
| 5 | Page generation engine | Claude call → content schema → DB record |
| 6 | Public page renderer update | `lp/[slug]` renders dynamic content + 3 variants + auth gate |
| 7 | In-app preview + publish flow | Iframe preview, Regenerate, Publish button |
| 8 | PostHog analytics on public page | Feature clicks, CTA, scroll, surveys tracked |
| 9 | Distribution brief generator | Fires at publish, stored on ValidationPage |
| 10 | Distribution tracker UI | Checklist, completion state, 48h message |
| 11 | Scheduled Inngest function | Reporting cycle live, snapshots stored |
| 12 | Interpretation agent — Step 1 (Sonnet) | Snapshot → ValidationInterpretation |
| 13 | Interpretation agent — Step 2 (Opus) | Threshold-gated → ValidationReport |
| 14 | Validation dashboard | Sidebar section, page list, report view |
| 15 | Sidebar rewrite | Replace conversations with Phase 3 navigation |
| 16 | Build brief completion flow | Mark complete, attach to Recommendation |

---

## 12. What Phase 3 Feeds Into

The `ValidationReport` produced by the interpretation agent is the direct input to Phase 5 — the MVP builder. Phase 5 does not decide what features to build. Phase 3 decides that. Phase 5 executes it.

When the user clicks "Mark validation complete and generate build brief," the `ValidationReport` is attached to the `Recommendation` record with `usedForMvp: true`. The Phase 5 build system reads this as its feature specification. Every feature in the MVP has a data-backed reason to exist.

That sequencing is deliberate. It is the design decision that makes the entire arc from interview to shipped product coherent and defensible.

---

## 13. What Makes This Category-Defining

The test at every decision point: could the user do this with a Wix template and a PostHog account?

- Page generation: technically yes, but two hours of work and the result is generic. Phase 3 takes 30 seconds and the result is specific to their exact recommended path.
- Analytics: yes, with manual PostHog setup. But they would have to configure events, read dashboards, and draw their own conclusions.
- Distribution brief: no. The engine knows their audience type, their market, what they have tried before. No tool generates a specific three-channel brief with exact message copy derived from a person's interview context.
- Interpretation: no. This does not exist anywhere. No landing page builder reads your analytics, compares them against the specific features your roadmap said to build, synthesises what 47 strangers said in a survey, and produces a single committed recommendation about what to build. This is the moat.

The landing page is the means. The interpretation report is the product.

---

## 14. Decisions Still Open

None. Every architectural decision raised during planning has been resolved and documented above:

- ✅ Platform-served vs Vercel deployment → platform-served
- ✅ Dynamic content vs code-generated HTML → content dynamic, structure controlled
- ✅ Draft preview before publish → yes, iframe in-app
- ✅ Sonnet vs Opus for interpretation → split: Sonnet Step 1, Opus Step 2 gated by threshold
- ✅ Hardcoded vs configurable thresholds → configurable constants with documented reasoning
- ✅ Traffic gap → distribution brief generated at publish time, three channels, specific message copy
- ✅ Phase 3 scope (everyone vs technical only) → technical recommendations only

---

## Appendix A — Post-Build Addenda (2026-04-06)

These notes reflect decisions made during implementation that changed the
original spec. Future reviewers should treat them as authoritative over
the body of this document.

### A.1 PostHog removed

The spec called for per-page PostHog properties. During implementation this
was dropped in favour of a dedicated `ValidationEvent` Postgres table. At
the expected traffic volume (50–500 visitors per page), Postgres is cheaper,
simpler, and removes an external dependency. The `posthogPropertyId` column
has been dropped via migration. PostHog environment variables have been
removed from `env.ts`. See commit `50e0e9c` and `bc8a9f7`.

### A.2 Honest negative-signal path

The original `signalStrength` enum was `strong | moderate | weak | insufficient`.
A fourth tier `negative` has been added for the case where the market
actively says no (low conversion + contradicting surveys + wrong-feature
clicks). On negative signal:

- `ValidationReport` populates `disconfirmedAssumptions` and `pivotOptions`
- The UI replaces the MVP handoff button with "Start a new discovery session"
- The `/report` API refuses to set `usedForMvp = true` on a negative report
- A new negative report force-clears any prior `usedForMvp` flag

See commit `80a809c`.

### A.3 Market-aware thresholds (deferred)

`MIN_VISITORS_FOR_BRIEF = 50` is a starting assumption, not a universal
truth. The `ValidationSnapshot` table now stores a `market` column per
snapshot so future calibration work can aggregate threshold dynamics by
market segment without touching live `DiscoverySession` rows. Actual
per-market thresholds are deferred until we have data from at least 20
real pages across multiple markets.

### A.4 Phase 4 contract — website builder

The website builder (Phase 4) sits between Phase 3 and Phase 5 in the
vision document. Its relationship with validation data is:

**Preferred path (Option B):** when a `ValidationReport` exists for the
recommendation AND its `signalStrength` is `'strong'` or `'moderate'`,
Phase 4 reads `recommendation.validationPage.report` and generates the
marketing site from VALIDATED copy — headlines, features, and proof
points grounded in what actually resonated with visitors. No banner.

**Fallback path (Option A):** when no report exists yet, Phase 4 builds
from the recommendation alone and shows a banner:
*"This site was built before validation — regenerate after your page
collects visitor feedback for stronger copy."* Lets the founder keep
momentum without blocking on the 6-hour reporting cycle.

**Weak-signal path:** when a report exists but `signalStrength === 'weak'`,
Phase 4 treats it as equivalent to no report — builds from the raw
recommendation and shows a banner explaining that the validation data is
too thin to use yet. Using weak-signal copy is worse than no copy because
it would codify ambiguity.

**Negative-signal path:** when `signalStrength === 'negative'`, Phase 4
REFUSES to build or regenerate the site. The user is redirected to the
validation page's "Start a new discovery session" CTA. We do not ship
marketing sites for ideas the market has rejected.

**Data contract:** Phase 4 reads from Prisma — no new API surface needed
on Phase 3's side. The join is `recommendation → validationPage → report`.
Phase 4's generator should branch on `report?.signalStrength` exactly as
described above.

### A.5 Exit intent — mobile parity

The `PageViewTracker` now listens to `pagehide` and `visibilitychange` in
addition to desktop `mouseleave`. `pagehide` fires the exit-intent beacon
via `navigator.sendBeacon` (the only transport reliable during page
unload). `visibilitychange` to `hidden` starts a 30-second grace timer
that fires on expiry if the page is still hidden — catches mobile "swipe
to Chrome tabs and come back" without false-positives on tab switches.

---

*NeuraLaunch Phase 3 Specification*
*Built by Saheed Alpha Mansaray*
