# NeuraLaunch — Action Plan

> Prioritised action items based on competitive intelligence research, Gemini deep research findings,
> production testing, and architectural decisions made during the April 2026 engineering review.
>
> Last updated: April 14, 2026

---

## Immediate (This Week)

### 1. Landing Page Redesign
**Status:** Prompt ready, awaiting agent execution
**Why now:** The current landing page describes a product that doesn't exist ("72-hour validation sprints," "AI Agent Builder") while hiding the product that does. Every founder who visits startupvalidator.app gets the wrong impression. This is the highest-leverage marketing fix.
**Scope:** Full homepage replacement with new brand palette (electric blue + gold on deep navy), accurate product copy from the vision document, all 10 sections specified in the prompt. Placeholder legal pages (Terms, Privacy, Cookies) included.
**Brand palette:** Deep navy background (keep), electric blue `#2563EB` primary, warm gold `#D4A843` premium accent, clean white `#F7F8FA` text, muted silver `#94A3B8` secondary text, slate `#1E293B` borders. No pink, no purple, no magenta, no gradient buttons.

### 2. Logo Production Assets
**Status:** Direction approved (blue-to-gold NL lettermark from Gemini), needs vector recreation
**Why now:** The landing page needs the logo. The mobile app will need it. Social profiles need it.
**Scope:** Recreate the approved blue-to-gold NL lettermark as a clean vector (SVG) with exact brand colors (`#2563EB` blue, `#D4A843` gold). Export: SVG for web, PNG at multiple sizes (16x16, 32x32, 180x180, 512x512) for favicon, app icon, and OG image. Versions on transparent, dark navy, and white backgrounds.

### 3. Merge All Pending Branches and Fix Lint
**Status:** Branches need merge confirmation
**Why now:** The Conversation Coach, Outreach Composer, Research Tool, and Section A changes queue are all built on separate branches. Before anything else ships, every branch needs to merge to dev with lint and typecheck confirmed green.
**Action:** Delete `node_modules`, run `pnpm install` fresh, confirm `pnpm lint` passes. The corrupt `language-subtag-registry` issue that prevented lint on two consecutive branches must be resolved permanently.

### 4. Production Testing of Tier 1 Tools
**Status:** Core system tested, tools untested in production
**Why now:** The three tools (Coach, Composer, Research Tool) are built but not production-validated.
**Scope:** Run 3-5 real sessions through the full flow: discovery → recommendation → roadmap → use tools on tasks. Verify:
- Roadmap generator produces tool choreography in task descriptions (explicit multi-tool workflows, not just tool names)
- Tools pre-load context from the task when launched from the task card
- Coach-Composer handoff works in both directions
- Research Tool's editable plan and progress indicator work correctly
- Check-in agent references tool usage ("you prepared with the Coach — how did the conversation go?")
- Standalone tool access from the tools menu works with belief state context

---

## Short-Term (Next 2 Weeks)

### 5. Service Packager + Pricing Architect — Spec and Build
**Status:** Not yet specced
**Why now:** 41% of recommendations are `build_service`. Every one of those founders needs to answer "what am I selling and at what price" before outreach or conversations matter. This completes the Tier 1 tool chain: Research (find competitors/pricing) → Package/Price (define your offering) → Coach/Compose (pitch and reach out).
**Scope:** Design the full spec (same depth as Coach, Composer, and Research Tool specs), then build. The tool helps founders define a fixed-scope service offering, calculate pricing based on time/market/margin, generate tiered pricing, produce a one-page service brief, and run "what if" revenue scenarios. Connects to the Research Tool (competitive pricing data feeds in) and Outreach Composer (the service brief content feeds into outreach messages).

### 6. NeuraLaunch Legal Documents
**Status:** Placeholder pages built, real documents not yet produced
**Why now:** Required before any public launch or marketing push.
**Scope:** NeuraLaunch-specific Terms of Service, Privacy Policy, and Cookie Policy covering: account creation and authentication, discovery session data (belief state, interview transcripts), roadmap and check-in data persistence, AI-generated content ownership (scripts, messages, research reports), data retention and deletion rights, the nine-agent data processing pipeline, research tool external data access. Written for Sierra Leone jurisdiction with Tabempa Engineering Limited as the operating entity. These are NeuraLaunch documents, not Tabempa documents — distinct from the Tabempa corporate legal suite.

### 7. Voice Mode — Specification Only
**Status:** Concept identified by both Gemini research and Alpha independently
**Why now:** Voice is the natural interface for NeuraLaunch's West African user base (WhatsApp voice notes are the dominant communication mode). Speccing now ensures the architecture accounts for it even if the build comes later.
**Scope:** Design spec covering: real-time speech-to-text (Whisper or Deepgram), text-to-speech for agent responses (ElevenLabs or cost-effective alternative), transcript generation and persistence, which surfaces support voice (interview first, then check-ins, then Coach role-play), bandwidth considerations for 3G/4G, latency targets, cost modelling per voice session. Do not build yet — validate that latency and cost are viable for the market.

---

## Medium-Term (Next 4-6 Weeks)

### 8. Mobile App Build (React Native / Expo)
**Status:** Architecture decisions locked (Expo, monorepo Option A, engagement-first scope)
**Why now:** NeuraLaunch would be the only startup validation platform in the App Store and Play Store. The Composer's copy-paste-to-WhatsApp flow and the Coach's role-play are mobile-native experiences. Push notifications close the nudge engagement loop.
**Scope v1:** Roadmap view with task cards, check-in form, push notifications for nudges, Coach chat (all four stages), Outreach Composer with copy-to-clipboard, Research Tool with progress indicator, recommendation view with pushback chat. Everything else deep-links to the web app.
**Architecture:** `neuralaunch/mobile/` as sibling to `client/` in the same monorepo. Shared types via pnpm workspaces. Same API routes serve both web and mobile. `expo-router` for file-based navigation matching the Next.js mental model.

### 9. Pricing Model Design and Implementation
**Status:** Tier structure defined in vision document, no dollar amounts
**Why now:** Revenue is required before global competitors notice the African market.
**Scope:** Design two pricing tracks:
- **Subscription model** (standard markets): Free → Starter → Builder → Scale as defined in the vision document
- **Pay-per-phase model** (emerging markets): The founder pays when they enter a new phase of their roadmap, not on a monthly cycle. Matches capital constraints of the primary market (Gemini recommendation).
Implement subscription first. Architect billing so pay-per-phase can be added without a rewrite. Stripe for international payments, Flutterwave or similar for African mobile money.

### 10. Tier 2 Tools (Selective)
**Status:** Specs not yet written
**Why now:** Revenue + Pipeline Tracker feeds real execution data into the check-in agent and continuation engine — replacing self-reported check-ins with actual numbers. This is the "Founding Memory" lock-in that Gemini recommends.
**Scope:**
- **Revenue + Pipeline Tracker** (Tier 2, Tool 4): Lightweight mobile-first dashboard. Auto-creates tracking fields from the roadmap. Manual input via simple form. Weekly snapshot. Feeds real data into the check-in agent. Exportable to Google Sheets.
- **Customer Research Sprint Guide** (Tier 2, Tool 5): For `further_research` recommendations. Structured interview questions derived from belief state, signal-vs-noise framework, response tracker, synthesis template, pivot decision checklist.

---

## Longer-Term (2-3 Months)

### 11. Voice Mode Build
**Status:** Spec to be written in short-term phase
**Why now:** After mobile app exists, voice becomes the natural interaction mode.
**Build order:**
1. Voice check-ins (lowest risk, highest value) — founder records voice note, system transcribes, check-in agent processes as text
2. Voice interview (highest value surface) — founders describe their situation more naturally when speaking, produces richer context
3. Voice Coach role-play (most immersive) — rehearsing a conversation by speaking rather than typing
4. Full voice mode across all surfaces (like ChatGPT/Gemini voice mode) — real-time back-and-forth voice conversation with transcript generation

### 12. Cross-Cycle Memory
**Status:** Continuation briefs exist, cross-cycle connection not yet built
**Why now:** Gemini identified this as the primary churn-prevention mechanism. Once a founder has execution history in NeuraLaunch, switching costs become real.
**Scope:** When a founder completes one recommendation cycle and starts another, the new interview knows everything from the previous cycle — what they executed, what worked, what failed, which conversations went well, which markets responded. The data already exists across `checkInHistory`, `toolSessions`, `continuationBrief`, `parkingLot`, and `researchLog`. The integration is connecting continuation brief forks to the next discovery interview's context.

### 13. WhatsApp Integration
**Status:** Concept, not specced
**Why now:** Uses the channel founders are already in rather than asking them to switch.
**Scope:** Not a WhatsApp bot that replaces the app — a notification and lightweight interaction channel. Push nudges via WhatsApp. Let founders reply with voice notes that become check-ins. Send weekly progress summaries. Requires WhatsApp Business API integration.

### 14. Founding Memory Dashboard
**Status:** Concept from Gemini research
**Why now:** Makes accumulated context visible and valuable to the founder, creating perceived switching costs.
**Scope:** Show the founder: total conversations, completed tasks, tool usage counts, research sessions, continuation brief learnings. Not vanity metrics — a visual representation of how much the system knows about their journey. The moment the founder sees this, they understand that leaving means starting from zero elsewhere.

---

## Explicitly Deprioritised

### Website Builder and MVP Builder (Original Vision Phases 4-5)
**Why:** Gemini's analysis confirms that NeuraLaunch's moat is interpretation and execution partnership, not code generation. Rocket and Denovo are better positioned for "build it for you." Only 6% of sessions are `build_software`. The execution tools (Coach, Composer, Research Tool, Service Packager) serve the 94% that need human-to-human execution support.

### Brand Asset Generation (Logos, Ad Creatives, Visual Identity)
**Why:** IdeaProof territory. NeuraLaunch's user base doesn't need Jungian brand archetypes or TikTok ad scripts. Irrelevant to the execution gap.

### Enterprise Competitive Monitoring (Continuous CI)
**Why:** Rocket's $350/month Intelligence feature. NeuraLaunch's founders don't need daily competitor briefings. The Research Tool's on-demand deep research covers competitive intelligence without the cost of continuous monitoring.

---

## Key Strategic Principles (From Gemini Research)

1. **Own the interpretation layer, not the automation layer.** Competitors will always be better at generating code and automating marketing. NeuraLaunch's moat is interpreting execution outcomes — the continuation brief, the recalibration system, the check-in agent that connects patterns across tasks.

2. **Solve for churn with Founding Memory.** The more context NeuraLaunch accumulates about a founder's journey, the harder it is to leave. Every check-in, every Coach session, every Research report, every Composer message is data that makes the next interaction smarter. Make this accumulation visible and valuable.

3. **The Freetown advantage is the strongest structural moat.** Designing for low-bandwidth, WhatsApp-first, mobile-dominant environments is a barrier to entry that money can't easily overcome. Lean into it — every design decision should work on a phone over 3G.

4. **Reach profitability before global competitors notice the market.** Africa received 0.02% of global AI funding. Capital asymmetry means NeuraLaunch must be self-sustaining before well-funded competitors decide the African founder market is worth their attention.

---

*Tracked by: Alpha Mansaray, Co-Founder & Chief Engineer*
*Document created: April 14, 2026*