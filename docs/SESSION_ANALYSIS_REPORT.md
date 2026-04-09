# NeuraLaunch — Session Analysis & Toolkit Decision

> Cross-analysis of 34 complete discovery sessions from April 3–9, 2026.
> Four independent analyses (Claude Opus close-reading, Claude API
> quantitative task analysis, Gemini, ChatGPT) converged on the same
> conclusion: the Phase 3 toolkit must be an execution layer, not a
> build layer. This document captures the converged findings and the
> locked build order.

---

## 1. Dataset Overview

| Metric | Value |
|---|---|
| Total sessions in database | 63 |
| Complete sessions with recommendations | 34 |
| Sessions with pushback | 3 |
| Sessions with roadmap | 32 |
| Total roadmap tasks generated | 529 |
| Date range | April 3–9, 2026 |

---

## 2. The Core Finding

**The validation landing page — currently the only Phase 3 tool —
serves 6% of sessions.** All four independent analyses agree.

The user base is overwhelmingly non-technical. Of typed
recommendations, `build_software` appears once (6.7%). The
remaining 93% are `build_service` (33%), `sales_motion` (20%),
`process_change` (20%), `further_research` (13%), and
`hire_or_outsource` (7%).

The execution tools must be designed for founders who operate
through WhatsApp, Google Docs, and face-to-face conversations —
not IDEs and deployment pipelines.

### Recommendation type distribution (all 34 sessions, including inferred)

| Type | Count | % |
|---|---|---|
| build_service | 14 | 41% |
| further_research | 7 | 21% |
| sales_motion | 6 | 18% |
| process_change | 4 | 12% |
| build_software | 2 | 6% |
| hire_or_outsource | 1 | 3% |

### Audience type distribution

| Type | Count | % |
|---|---|---|
| ASPIRING_BUILDER | 10–11 | 29–37% |
| ESTABLISHED_OWNER | 9 | 26–30% |
| MID_JOURNEY_PROFESSIONAL | 5–8 | 15–27% |
| STUCK_FOUNDER | 2 | 6–7% |

---

## 3. Four Analyses — Where They Agree

All four analyses independently reached the same conclusions on
these points:

1. **Validation landing page is low priority** — 6% of sessions,
   ranked last or near-last by every analysis.
2. **User base is overwhelmingly non-technical** — 80%+ need
   service/sales/process tools, not code/build tools.
3. **Outreach/messaging tool is Tier 1** — every analysis names
   this in the top 3.
4. **Pricing/packaging tool is Tier 1** — every analysis names
   this in the top 4.
5. **Tracking/pipeline tool is Tier 1-2** — every analysis includes
   this.
6. **Website/MVP builder should be deprioritized** — none of the
   four rank it in the top half.
7. **Tools should output to WhatsApp/Sheets/LinkedIn, not replace
   them** — the founder's existing workflow is the delivery channel.

---

## 4. The Key Divergence: The Conversation Coach

The most interesting finding across all four analyses is the
**Conversation Coach** tool — identified independently by two
analyses from completely different angles, and missed by the other
two:

| Analysis | How it was found | Rank |
|---|---|---|
| Claude close-reading | "Avoidance pattern detection" — 10 of 34 sessions (29%) have a founder avoiding one specific conversation | #3 |
| Claude API (quantitative) | 209 of 529 roadmap tasks (39.5%) involve conversation preparation | **#1 — highest demand signal in the entire dataset** |
| ChatGPT | Not named as a distinct tool | Missing |
| Gemini | Not named as a distinct tool | Missing |

This tool has the strongest combined qualitative + quantitative
signal of anything in the dataset. It directly addresses the
engine's most distinctive capability: identifying when a founder
knows what to do and is avoiding the one conversation that would
make progress real.

---

## 5. Gemini's Unique Insight: The Physical-Digital Bridge

Gemini is the only analysis that explicitly addresses **offline
founders** — the tailor who needs QR-coded flyers to track which
partner sends customers, the shop owner who needs a WhatsApp link
instead of an email capture form. Three specific ideas no other
analysis surfaced:

1. **WhatsApp Lead-Link** — generate unique WhatsApp links with
   pre-filled intent messages instead of email capture forms.
2. **QR-Flyer Generator** — printable flyers with trackable QR
   codes for offline-to-online conversion.
3. **Low-Bandwidth Portfolio** — mobile-first, image-heavy gallery
   optimized for 3G/4G networks.

These address the "Physical-Digital Gap" that Gemini correctly
identified as a structural feature of the West African founder
market. Scheduled for Tier 2-3 but the insight should inform the
design of all Tier 1 tools (e.g., the Outreach Composer should
default to WhatsApp message format, not email).

---

## 6. The Locked Build Order

### Tier 1 — Build First

These three tools serve 74% of sessions (my analysis) and map to
the three highest-demand task categories (Claude API: 503 of 529
tasks = 95%).

#### Tool 1: The Conversation Coach

**Demand signal:** 209 roadmap tasks (39.5%) + 10 sessions with
identified avoidance patterns (29%)

**What it does:** Takes the founder's specific situation (who they
are talking to, what they need to achieve, what they are afraid of)
and generates:
- A structured conversation script with opening, key asks, and
  fallback positions
- Specific objection handling for the 3-4 most likely pushbacks
- A "what to do after" checklist based on possible outcomes
- Optional role-play mode where the AI plays the other party

**Primary recommendation types:** sales_motion, process_change,
hire_or_outsource — but appears in ALL types.

**Why #1:** The data shows the single biggest execution bottleneck
is not knowledge or resources — it is the courage and preparation
to have one specific conversation. Multiple roadmaps explicitly
name conversation avoidance as the primary risk. The fleet
management founder avoiding GHS 800 pricing. The school owner
avoiding the deputy conversation. The content writer avoiding the
price increase email. An AI that helps them prepare and rehearse
is the single most valuable feature the platform can ship.

**Design principle:** Conversation-first. The founder describes the
situation in natural language. The tool produces the exact words to
say, formatted for the exact channel (WhatsApp message, in-person
script, email), with the exact tone appropriate to the relationship.

---

#### Tool 2: The Outreach Composer

**Demand signal:** 184 combined tasks (outreach + proposals) + 9
sessions where pitch/outreach was the primary gap (26%)

**What it does:** Generates ready-to-send messages tailored to the
founder's channel and context:
- Cold outreach messages with personalisation hooks
- Warm re-engagement messages for dormant contacts
- Follow-up sequences (Day 1, Day 5, Day 14)
- One-page proposals and service descriptions
- Pricing introduction messages (specifically for sales_motion)
- WhatsApp-formatted messages (the dominant channel — 70 task
  mentions)
- LinkedIn post/message drafts

**Primary recommendation types:** build_service, sales_motion,
further_research

**Why #2:** The most common resource referenced in roadmap tasks is
WhatsApp (70 mentions), and the most common execution verb is
"send" (31 tasks). Founders stall because they don't know what to
say. The tool eliminates that friction by producing the exact words.

**Design principle:** Copy-paste ready. Every output is formatted
for the founder's actual channel. No formatting, no editing, no
"now customize this template." Paste and send.

---

#### Tool 3: The Service Packager + Pricing Architect

**Demand signal:** 110 pricing tasks + 8 sessions needing service
packaging (24%)

**What it does:** Helps founders define, scope, and price what they
are selling:
- Define the offer as a fixed-scope, fixed-fee deliverable
- Calculate pricing based on time, local market rates, and margin
- Generate tiered pricing (basic / standard / premium)
- Produce a one-page service brief (name, scope, deliverables,
  pricing, positioning)
- Run "what if" scenarios: "If I charge X and close Y clients per
  month, my monthly revenue is Z"

**Primary recommendation types:** build_service, hire_or_outsource

**Why #3:** The data shows 41% of recommendations are build_service.
Every one of those founders needs to answer "what exactly am I
selling, to whom, and at what price?" before they can do anything
else. This tool produces that answer.

**Design principle:** The output is a single document the founder
can share with a prospect. Not a template — a finished brief with
their specific service, their specific pricing, their specific
positioning.

---

### Tier 2 — Build Next

#### Tool 4: Revenue + Pipeline Tracker

**Demand signal:** 237 tasks (44.8% — highest raw count) + all four
analyses include this.

A lightweight, mobile-first dashboard:
- Auto-creates tracking fields from the roadmap
- Manual input via simple form (30-second logging)
- Weekly snapshot (screenshotable, shareable)
- Feeds real data into the roadmap check-in agent
- Exportable to Google Sheets

**Why Tier 2 not Tier 1:** High demand but lower strategic leverage.
Tracking is valuable AFTER the founder has started executing (which
requires Tools 1-3 first). The tracker without outreach is an empty
dashboard. Outreach without a tracker is still progress.

---

#### Tool 5: Customer Research Sprint Guide

**Demand signal:** 7 sessions (21%) + ChatGPT's Validation Tracker
+ Experiment Builder

For `further_research` recommendations:
- Structured interview questions derived from the belief state
- Signal-vs-noise framework
- Response tracker
- Synthesis template
- Pivot decision checklist

---

#### Tool 6: Feedback + Testimonial Engine

**Demand signal:** 96 tasks (Claude API)

- 3-5 question feedback script (WhatsApp-friendly)
- Raw feedback → formatted testimonial converter
- Case study template (problem → approach → result)
- Feeds into the roadmap check-in agent

---

### Tier 3 — Build Later

#### Tool 7: Process Builder / SOP Generator

**Demand signal:** 50 tasks + 4 sessions (12%)

Verbal description → step-by-step SOP, delegation documents,
accountability frameworks. For `process_change` and
`hire_or_outsource`.

---

#### Tool 8: Credibility Asset Builder

**Demand signal:** Gemini's "Trust Storefront" + ChatGPT's #10

Low-bandwidth portfolio page, one-pagers, service pages. Mobile-
first, image-heavy, optimized for 3G/4G. Includes Gemini's
QR-Flyer Generator and WhatsApp Lead-Link concepts.

---

#### Tool 9: Validation Landing Page (existing)

The current Phase 3 tool. Keep for the 6% of sessions that are
`build_software`. No changes needed — the tool works as verified
in the April 7-8 production test.

---

## 7. Five Themes from the Close Reading

### Theme 1: Avoidance Pattern Detection (29% of sessions)

The engine's most distinctive capability. It identifies when a
founder knows what to do and is avoiding the one action that would
make progress real. Forms: pricing avoidance, outreach avoidance,
accountability avoidance, delegation avoidance, validation
avoidance. The engine catches all five forms and structures
recommendations around breaking the pattern.

### Theme 2: Scope Reduction (26% of sessions)

The engine consistently strips ambitious plans to the smallest
executable version. $50K fundraise → manual validation. Full
marketplace → WhatsApp + Google Forms. The engine does NOT tell
non-technical founders to build apps.

### Theme 3: Genuine Strategic Insight (15% of sessions)

The best sessions contain recommendations that see something the
founder described but didn't name. "Money on the table" → clinical
services. "I need a defined thing to offer" → productized credit
preparation. This is the difference between a chatbot and a
strategic advisor.

### Theme 4: Interview Quality Correlates with Articulateness

Detailed, specific answers produce better recommendations. The
engine needs a thin-signal adaptation — concrete, fill-in-the-blank
questions when answers are consistently short.

### Theme 5: Duplicate Question Bug (18% of sessions)

The agent re-asks covered fields. 6 of 34 sessions. Root cause:
`selectNextField` / `askedFields` tracking gap. P0 fix priority.

---

## 8. Agent Behavior Fixes

| Fix | Priority | Impact |
|---|---|---|
| Duplicate question bug in `selectNextField` | P0 | 18% of sessions |
| Thin-signal adaptation for short answers | P1 | 6% of sessions |
| Competitive intelligence integration in recommendations | P2 | 3% of sessions |
| Earlier commitment question for analysis-paralysis founders | P2 | 3% of sessions |

---

## 9. Design Principles for All Tools

Derived from all four analyses:

1. **Context-aware:** Every tool has full access to the session's
   recommendation, roadmap, and belief state. It never starts from
   zero.

2. **Conversation-first:** Each tool is an AI agent interaction,
   not a static template. The founder describes the situation; the
   tool generates a ready-to-use output.

3. **Copy-paste ready:** Every output is designed to be immediately
   usable in WhatsApp, email, Google Docs, or print. No formatting
   required.

4. **Recommendation-type aware:** While every tool is available for
   every type, the agent behaviour adapts based on whether this is
   a sales_motion, build_service, process_change, etc.

5. **Mobile-first, low-bandwidth:** The primary user is on a
   smartphone with 3G/4G in West Africa. Every interface must load
   fast and work on small screens.

6. **Preparation layer, not replacement:** The tools generate
   outputs for WhatsApp, Sheets, and LinkedIn. They do not try to
   replace those platforms.

---

## 10. Quality Benchmarks from the Dataset

### 10/10 Sessions (the quality ceiling to maintain)

| Session | Founder | What made it exceptional |
|---|---|---|
| 12 | Banking → advisory | Productized vague "consulting" into specific closeable offer |
| 18 | Bookkeeper — receipts | Best non-technical rec: behavior change, not an app |
| 22 | Fleet management SaaS | "Avoidance dressed as responsibility" — perfect catch |
| 29 | School owner — accountability | One unresolved relationship = the whole bottleneck |
| 33 | Fresh grad — tutoring | Best pushback exchange; most emotionally honest session |

### The Pushback System Works

3 of 3 pushback sessions produced high-quality exchanges. Session
33's pushback where the founder argued for a landing page and the
agent defended manual validation ("200 email signups versus 5
confirmed sessions") is the best single exchange in the dataset.

---

*Four analyses. One conclusion. Build the execution layer.*

*Analyses by: Claude Opus 4.6 (close-reading), Claude API
(quantitative task analysis), Gemini, ChatGPT.*
*Dataset: 34 complete sessions, 529 roadmap tasks.*
*Decision locked: April 9, 2026.*
