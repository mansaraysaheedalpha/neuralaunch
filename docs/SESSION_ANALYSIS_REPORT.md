# NeuraLaunch — Session Analysis Report

> Close reading of 34 complete discovery sessions from April 3–9, 2026.
> Produced by Claude Opus 4.6 via batch-by-batch transcript analysis.
> Purpose: inform Phase 3 toolkit decisions and agent behavior fixes.

---

## Dataset Overview

| Metric | Value |
|---|---|
| Total complete sessions analyzed | 34 |
| Sessions with recommendation | 34 |
| Sessions with pushback | 3 (Sessions 20, 33, 34) |
| Sessions with roadmap | 32 |
| Sessions with validation page | 1 |
| Duplicate question bug instances | 6 of 34 (18%) |
| Sessions rated 9-10/10 | 12 of 34 (35%) |
| Sessions rated 7-8/10 | 16 of 34 (47%) |
| Sessions rated 5-6/10 | 6 of 34 (18%) |
| Date range | April 3–9, 2026 |
| Tester | Saheed Alpha Mansaray (25+ sessions), remainder organic |

---

## Recommendation Type Distribution

### Typed sessions only (20-34, post-schema)

| Type | Count | % |
|---|---|---|
| build_service | 5 | 33% |
| sales_motion | 3 | 20% |
| process_change | 3 | 20% |
| further_research | 2 | 13% |
| build_software | 1 | 7% |
| hire_or_outsource | 1 | 7% |

### All 34 sessions (including inferred types for pre-schema sessions)

| Type | Count | % |
|---|---|---|
| **build_service** | **14** | **41%** |
| **further_research** | **7** | **21%** |
| **sales_motion** | **6** | **18%** |
| **process_change** | **4** | **12%** |
| build_software | 2 | 6% |
| hire_or_outsource | 1 | 3% |

### Key finding

`build_software` — the only recommendation type currently served by
Phase 3's validation landing page — appears in **6% of sessions**.
The top three types (`build_service`, `further_research`,
`sales_motion`) collectively represent **80% of sessions** and have
zero Phase 3 tooling.

---

## Audience Type Distribution

| Type | Count | % |
|---|---|---|
| ASPIRING_BUILDER | 10 | 29% |
| ESTABLISHED_OWNER | 9 | 26% |
| MID_JOURNEY_PROFESSIONAL | 5 | 15% |
| STUCK_FOUNDER | 2 | 6% |
| Pre-detection (early sessions) | 8 | 24% |

---

## Five Major Themes

### Theme 1: Avoidance Pattern Detection (29% of sessions)

**Sessions:** 14, 19, 22, 23, 24, 25, 26, 29, 30, 33

The engine's most distinctive and valuable behavior. It identifies
when a founder knows what to do and is systematically avoiding the
one action that would make progress real. The avoidance takes forms:

- **Pricing avoidance** (22, 30): product works, users exist,
  founder won't ask for money
- **Outreach avoidance** (14, 19, 24, 25): skills exist, network
  exists, founder won't make the call
- **Accountability avoidance** (23, 29): staff dysfunction is clear,
  founder won't have the conversation
- **Delegation avoidance** (26): capacity is maxed, founder won't
  hire because of past failure
- **Validation avoidance** (33): vision exists, founder won't do
  the basic manual test

In every case the engine names the pattern without judgment and
structures the recommendation around breaking it — usually by
introducing an accountability mechanism or a social commitment that
makes retreat more costly than action.

**Best example — Session 22 (fleet management SaaS):**
The founder built a working dashboard, has 2 companies using it for
FREE for 14 months, both say it saves time. Zero revenue. Every
time he tries to bring up pricing, the client changes the subject
and he backs off. The engine's closing line: *"You have named the
pattern clearly — avoidance dressed as responsibility, builder mode
as a substitute for sales."* Recommendation: force the pricing
conversation using pre-committed social accountability.

### Theme 2: Scope Reduction (26% of sessions)

**Sessions:** 15, 16, 17, 18, 19, 28, 32, 33, 34

The engine consistently strips ambitious plans down to the smallest
executable version:

- $50K fundraise → Le 1M manual validation (Session 33)
- Full marketplace app → WhatsApp + Google Forms (Sessions 16, 28)
- Restaurant reservation SaaS → static listings + WhatsApp (Session 15)
- Bookkeeping app → manual WhatsApp service (Sessions 18, 34)
- Consumer laundry app → B2B hotel cleaning contract (Session 32)

This is the engine at its most valuable for non-technical or
resource-constrained founders. The pattern: the engine does NOT tell
non-technical founders to build apps. It tells them to run the
service manually first, prove demand, then build.

### Theme 3: Genuine Strategic Insight Beyond Reflection (15% of sessions)

**Sessions:** 11, 12, 18, 26, 27

The best sessions contain recommendations that see something the
founder described but didn't explicitly name:

- Session 11: pharmacist says "money on the table" → engine
  recommends fee-based clinical services (the pharmacist never
  said "I should offer clinical services")
- Session 12: banker says "I need a defined thing to offer" →
  engine produces "Fundraising Readiness and Credit Preparation
  Specialist" (the banker never said "credit preparation")
- Session 18: bookkeeper says "I want the shoebox to disappear" →
  engine recommends co-designing a daily capture protocol with an
  anchor client (not a tech solution)
- Session 26: writer says "I can't trust junior writers" → engine
  recommends hiring coordination first to rebuild delegation trust,
  THEN attempting the writer hire (sequencing insight)
- Session 27: data analyst references his uncle as the user → engine
  reframes: uncle is NOT the target user, pivot from B2C farmers
  to B2B agricultural price intelligence (user reframe)

This is the difference between a chatbot and a strategic advisor.

### Theme 4: Interview Quality Correlates with Founder Articulateness

Sessions where founders gave detailed, specific, multi-sentence
answers (3, 7, 12, 22, 26, 29, 33) consistently produced better
recommendations than sessions with short, vague answers (2, 21).

The engine needs a **thin-signal adaptation**: when answers are
consistently short, it should switch to more concrete, fill-in-the-
blank style questions rather than open-ended ones.

### Theme 5: The Duplicate Question Bug

**Sessions:** 4, 8, 9, 17, 32, 34 (18%)

The agent re-asks a field question after receiving a clear answer.
Every instance was caught and called out by the founder. The bug
rate decreased over time — 4 of 6 instances were in early sessions
(1-17), only 2 in later sessions (18-34).

**Root cause hypothesis:** the `selectNextField` logic or the
`askedFields` tracking doesn't correctly mark a field as covered
after a successful extraction when the field's confidence is below
`MIN_FIELD_CONFIDENCE`.

---

## Session Quality Ratings

### 10/10 Sessions (the quality ceiling)

| Session | Founder | Key quality marker |
|---|---|---|
| 12 | Banking professional → advisory | Productized the founder's vague "consulting" into a specific, closeable offer |
| 18 | Bookkeeper — receipt capture | Best non-technical recommendation: behavior change protocol, not an app |
| 22 | Fleet management SaaS | Avoidance-as-responsibility pattern caught perfectly |
| 29 | School owner — accountability | Surgically identified one unresolved relationship as the whole bottleneck |
| 33 | Fresh graduate — tutoring | Best pushback exchange in the dataset; most emotionally honest session |

### 9/10 Sessions

| Session | Founder | Key quality marker |
|---|---|---|
| 3 | Tailor shop owner | Gold standard short interview — every question built on the last answer |
| 7 | Portfolio platform | Sophisticated pivot recommendation grounded in the signup data |
| 9 | Online tutoring platform | Best diagnostic recommendation ("stop growing into a leaky bucket") |
| 14 | Fintech marketing leader | Same caliber productization as Session 12 |
| 15 | Sports facility booking | Correct descoping of an aspiring builder |
| 16 | African internship marketplace | Non-technical adaptation — Google Forms + Airtable, not an app |
| 19 | Church management app | "As long as you haven't called them, the idea is still intact" |
| 20 | Lagos pregnancy app | The full pushback → replace → build_software flow |
| 24 | Procurement consultant | Income reframe (KES 90K survival vs KES 180K salary replacement) |
| 25 | Graphic designer — upmarket | "Drop the bottom 30%" — structural, not motivational |
| 27 | Agritech data analyst | User reframe — uncle is not the target user |
| 28 | Tutoring platform — Dar es Salaam | Formalize the existing manual operation, don't build an app |
| 30 | Payroll SaaS — Ghana | Structural twin of Session 22 — correct consistency |

### 5-6/10 Sessions

| Session | Issue |
|---|---|
| 1 | No transcript (0 messages but 7 questions — data anomaly) |
| 2 | Too-short interview (7 questions), recommendation disconnected from stated goal |
| 4 | Triple duplicate question, founder frustrated |
| 21 | Short answers, thin data, generic recommendation |

---

## Toolkit Decision — Data-Driven Priority Ranking

### Final ranking by session coverage

| Rank | Tool | Sessions | Count | % |
|---|---|---|---|---|
| **1** | **Pitch / pricing / sales conversation generator** | 5, 6, 8, 12, 15, 19, 22, 25, 30 | 9 | 26% |
| **2** | **Service packaging template** (name, scope, price, one-pager) | 2, 4, 11, 12, 14, 24, 27, 34 | 8 | 24% |
| **3** | **Accountability + commitment structure** | 19, 22, 23, 24, 25, 26, 29, 30 | 8 | 24% |
| **4** | **Customer research sprint guide** | 7, 9, 10, 13, 20, 31, 33 | 7 | 21% |
| **5** | **Weekly progress / experiment tracker** | 3, 5, 6, 8, 23, 28 | 6 | 18% |
| **6** | **Scope reduction / MVP advisor** | 15, 16, 17, 18, 28, 33 | 6 | 18% |
| **7** | **Operations formalization template** | 23, 26, 28, 29 | 4 | 12% |
| **8** | **Validation landing page** (existing) | 17, 20 | **2** | **6%** |

### Recommended build order

**Tier 1 — Build immediately (serves 74% of sessions):**

1. **Pitch & Pricing Generator** — personalized pitch script,
   pricing structure, objection-handling guide based on the
   recommendation + belief state. For `sales_motion` and
   `build_service` types.

2. **Service Packaging Template** — one-page service brief with
   name, scope, deliverables, pricing, and positioning. For
   `build_service` and `hire_or_outsource` types.

3. **Accountability Commitment Tool** — specific, time-bound
   commitment with a named witness and check-in structure. For ALL
   types — avoidance appears in 29% of sessions regardless of type.

**Tier 2 — Build next (serves 39% of sessions):**

4. **Customer Research Sprint Guide** — interview questions, signal
   tracker, synthesis framework. For `further_research` type.

5. **Weekly Progress Tracker** — structured check-in integrating
   with roadmap tasks.

**Tier 3 — Build later (serves 30% of sessions):**

6. **Operations Formalization Template** — SOPs, role definitions,
   accountability protocols. For `process_change` type.

7. **MVP Scope Advisor** — interactive feature-list reduction. For
   `build_software` type.

**Keep but deprioritize:**

8. **Validation Landing Page** — existing Phase 3 tool. Still
   useful for the 6% that are `build_software`, but not priority.

---

## Agent Behavior Fixes

| Fix | Priority | Sessions affected | % |
|---|---|---|---|
| **Duplicate question bug** in `selectNextField` / `askedFields` | **P0** | 4, 8, 9, 17, 32, 34 | 18% |
| **Thin-signal adaptation** — concrete questions when answers are short | **P1** | 2, 21 | 6% |
| **Competitive intelligence integration** — capture and reflect competitor mentions in recommendation | **P2** | 34 | 3% |
| **Commitment question earlier** for analysis-paralysis founders | **P2** | 13 (compare with 12) | 3% |

---

## Pushback Analysis

Only 3 of 34 sessions used the pushback system. All three produced
high-quality exchanges:

**Session 20** — UX designer pushed back with new evidence (Figma
prototype testing data). Agent correctly replaced `further_research`
with `build_software`. The canonical "replace" formula was used
verbatim. Two rounds.

**Session 33** — Fresh graduate argued for a landing page tool
instead of manual validation. Agent defended: "200 email signups
versus 5 confirmed sessions — which proves demand?" The founder
self-diagnosed: "the landing page is for me, not for them." Three
rounds. Best pushback exchange in the dataset.

**Session 34** — Senior accountant pushed back because competitive
intelligence from the interview wasn't reflected in the
recommendation. Agent acknowledged the gap and refined. One round.
The only instance of a justified founder pushback on recommendation
completeness.

---

## Methodology

**Approach:** Braun & Clarke's Reflexive Thematic Analysis (adapted),
compressed into a single-pass batch reading. Six batches of 5-6
sessions each, read chronologically (oldest first) so the engine's
evolution over time was visible. Each session received a structured
"session card" with: founder profile, agent behavior observations,
recommendation quality assessment, quality score, and coding tags.

**Coding tags used:**
- `duplicate_question` — agent re-asked a covered field
- `belief_state_complete` — all relevant fields captured
- `recommendation_type_correct` — type matches the situation
- `insight_beyond_stated` — recommendation sees something the
  founder described but didn't name
- `emotional_calibration_high/exceptional` — agent adapted tone
  to founder's emotional state
- `avoidance_pattern_identified` — agent caught a systematic
  avoidance behavior
- `scope_reduction_appropriate` — agent correctly descoped an
  ambitious plan
- `non_technical_adaptation` — agent correctly avoided recommending
  tech solutions to non-technical founders
- `thin_signal_adaptation_weak` — agent didn't adapt to short answers
- `pushback_quality_exceptional` — pushback exchange produced
  genuine insight shift

**Limitations:**
- Single analyst (Claude), no inter-rater reliability
- 25+ sessions were tested by the same person (Saheed), which
  creates a testing-bias floor: the founder was always articulate,
  always engaged, always knew the product. Real founders may give
  shorter answers, abandon sessions, or misunderstand questions.
- No LLM-as-judge scoring layer applied yet (would add quantitative
  confidence behind qualitative themes).

---

*Analysis produced: April 9, 2026*
*Analyst: Claude Opus 4.6 (1M context)*
*Dataset: 34 complete sessions from NeuraLaunch production database*
