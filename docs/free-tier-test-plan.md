# Free Tier — Production Test Plan

**Target:** startupvalidator.app (production)
**Persona:** A Free-tier user — signed up, never paid, never upgraded.
**Goal:** Exercise every surface a Free user can reach, confirm every gated surface shows an upgrade prompt instead of breaking, and surface any behaviour that disagrees with what's documented here.

Run the tests **in order**. Each phase builds on the state the previous one left behind (session rows in Postgres, Redis counters, consent timestamps, etc.). If a step fails, stop and capture the symptom before continuing — some later steps depend on earlier ones creating the right shape in the database.

---

## 0. What a Free Tier user can actually do

Reconciled from the latest code on `main`, not marketing copy:

| Surface | Free can reach it? | What they see |
|---|---|---|
| Landing page `/` + pricing section | ✓ | Public. |
| Sign up / sign in via Google or GitHub | ✓ | Public. |
| `/discovery` — start an interview | ✓ (lifetime cap: 2 sessions) | Normal chat UI. |
| `/discovery` — resume an incomplete interview | ✓ | Resumption card when a session was started <72h ago. |
| Discovery interview itself | ✓ | Up to 15 total questions across 4 phases. Synthesis fires when ~80% of required fields are filled. |
| `/discovery/recommendation` (most recent) | ✓ | Full recommendation + reasoning + alternatives rejected + falsification + first three steps + risks + assumptions. |
| `/discovery/recommendations/[id]` — past recommendation | ✓ | Same detail as above, read-only. |
| `/chat/[conversationId]` — interview transcript | ✓ | The interview messages, read-only. |
| `/discovery/recommendations` — past recommendations list | ✓ | Will show their 1 (or 2) recommendations. Venture cards render only if they had paid ventures — Free users see the flat list. |
| `/tools` — standalone tools hub | ✓ (with a wall) | Execute-tier UpgradePrompt hero — NO tile list. |
| `/tools/conversation-coach`, `.../outreach-composer`, `.../research`, `.../service-packager` | ✓ technically | Pages render, but every API call returns **403 Forbidden** with "This feature requires an Execute or Compound subscription." |
| `/settings` | ✓ | Account info, training-consent toggle, aggregate-analytics-consent toggle, Billing section (shows Free tier, "Manage billing" button is disabled). |
| `/profile` | ✓ | Legacy profile view — basic account info. |
| `/discovery/validation` and `/discovery/validation/[pageId]` | ✓ technically | Pages load, but any attempt to generate a validation page hits **403** (Compound-only). |
| Legal pages `/legal/*`, `/faq`, `/about` | ✓ | Public. |
| Recommendation page — "This is my path — build my roadmap" button | ✗ | Replaced with an Execute UpgradePrompt hero. No accept button visible. |
| Pushback chat on the recommendation page | ✗ | Component not rendered at all for Free users. |
| Voice mode microphone button on any input | ✗ | Hidden. Only Compound users see it. |
| Roadmap generation / viewing | ✗ | No entry point exists for Free — no accept button means no roadmap is ever created. |

**Hard caps to keep in mind:**
- **2 lifetime discovery interviews** per Free account ([tier-limits.ts:105](../client/src/lib/lifecycle/tier-limits.ts#L105)). The 3rd attempt returns a 403 with "You've reached the free-tier limit. Upgrade to Execute to run unlimited discovery interviews."
- **Max 15 questions per interview**, split across 4 phases (ORIENTATION → GOAL_CLARITY → CONSTRAINT_MAP → CONVICTION).
- **72-hour resumption window**. A session idle longer than 72h no longer shows the resumption card.

---

## 1. Pre-flight (2 minutes)

Before you start clicking:

1. Open `startupvalidator.app` in an **incognito / private window** in Chrome. Incognito avoids any cached session, extension interference, or localStorage drift from prior testing.
2. Open DevTools (F12). Keep it open on the Console + Network tabs for every step — the tests call out specific things to watch for there.
3. Have a second tab open on the Vercel dashboard logs for `neuralaunch` so you can correlate the browser state with server-side errors in real time.
4. **Prepare two OAuth accounts** if possible — one Google, one GitHub. Test plan uses a single account end-to-end, but a second account lets you re-verify the 2-session cap from a clean slate.
5. Decide on the "persona" you'll play. The interview agent is context-sensitive — its questions depend on the situation you describe. A consistent fictional persona will give you consistent results. Suggested persona:
   > "I'm a solo developer in Lagos. I've built a personal finance tracker for African freelancers and want to figure out if I should charge for it or give it away to build a portfolio."

   Use this same persona in both test sessions so you can compare synthesis outputs.

---

## 2. Phase A — Sign-up & first landing

### A.1 Landing page (unauthenticated)

**Steps:**
1. Navigate to `https://startupvalidator.app/`.
2. Scroll to the Pricing section (or click "Pricing" in the header).
3. Toggle between **Monthly** and **Annual**. Confirm the segmented switch animates cleanly.

**Expect:**
- Three tier cards: Free, Execute (Recommended), Compound (Premium).
- Free card CTA reads "Start free" and links to `/signin`.
- Execute card shows `$19/mo` on Monthly (founding rate). Below it, gold "Locked in for life" + muted "Standard rate $29/mo".
- Compound card shows `$29/mo` on Monthly. Below: "Locked in for life" + "Standard rate $49/mo".
- On Annual, the founding rate disappears (spec §1.2 — no annual founding rate). Cards show `$29/mo` (billed $279/yr) and `$49/mo` (billed $479/yr) with "save $69" / "save $109" hints.
- Founding-member banner reads "**50 of 50 founding slots remaining**" (assuming nobody has subscribed yet). If someone has, the count reflects that.

**Flag if:**
- Any card button reads "Start with Execute/Compound" but doesn't route to Paddle checkout on click. (For now, Free clicks should go to `/signin`; Execute/Compound clicks require being signed in first.)
- The Compound card shows `$19/mo` or any founding-rate misattribution.
- The slot count reads "50 of 50" even though you know someone has subscribed (webhook wiring issue).

### A.2 Sign up flow

**Steps:**
1. Click "Start free" or the sign-in link.
2. Expect `/signin` with the NeuraLaunch logo and **two buttons: Google, GitHub**.
3. Click either provider. Complete the OAuth flow.
4. After OAuth returns, you should land on `/` (the landing page), this time as a signed-in user.

**Expect:**
- Your avatar / name renders in the header.
- `/api/auth/session` (check in DevTools Network) returns a JSON object with `user: { id, name, email, image, tier: "free", subscriptionStatus: "none" }`.
- The session callback embeds `tier: "free"` because no Subscription row exists yet.

**Flag if:**
- `user.tier` is absent from the session response — that's the auth callback not running.
- The callback URL doesn't return to NeuraLaunch (domain misconfig in the OAuth provider console).
- You land on `/signin` again after completing OAuth — usually an NEXTAUTH_URL mismatch in Vercel.

### A.3 Settings — first look (before any discovery)

**Steps:**
1. From the header / sidebar, navigate to `/settings`.

**Expect:**
- **Account section:** name, email, and one connected provider badge (whichever you used to sign up).
- **Privacy and data section:**
  - "Training consent" toggle, default **off**, no timestamp shown yet.
  - "Aggregate analytics consent" toggle, default **off**, no timestamp shown yet.
- **Billing section:**
  - Shows "**Free tier**" as the tier label.
  - Status reads `none` (no Subscription row yet). No period-end date because Free has no billing cycle.
  - No founding-member pill.
  - "Manage billing" button is **disabled**.
  - Below it, a muted line: "Complete a paid checkout to unlock billing management."

**Flag if:**
- The tier label shows anything other than "Free".
- The Manage billing button is enabled (it should be disabled because `hasBillingProfile = false` — user has no `paddleCustomerId`).
- An amber "billing profile couldn't be located" error is visible (that message is reserved for paid users whose profile vanished — not Free).

### A.4 /tools page as a Free user

**Steps:**
1. Navigate to `/tools`.

**Expect:**
- An **UpgradePrompt hero** with a gold icon, uppercase "EXECUTE TIER" header, and copy: *"Unlock the execution tools — Conversation Coach, Outreach Composer, Research Tool, and Service Packager are part of Execute. Upgrade to use them on any task in your roadmap — or open them standalone from this page."*
- A primary "Upgrade to Execute" CTA button.
- **NO four-tile list.** The tiles must not render for a Free user.

**Flag if:**
- The four tiles appear (Free-tier leak — regression of the `isFreeTier` gate).
- The UpgradePrompt says "Compound tier" — wrong target.
- You can click through any tile link and reach a tool page.

### A.5 /tools/research as a Free user (direct navigation)

**Steps:**
1. Navigate directly to `/tools/research`.

**Expect:**
- The page loads (it doesn't server-block). The UsageMeter component **renders nothing** for Free users (checked via `tier !== 'free'`).
- The Research flow will attempt to auto-load your most recent roadmap via `/api/discovery/roadmaps/has-any`. Free users have no roadmap, so the response is `{ hasRoadmap: false }`.
- You should see the "The Research Tool needs your discovery context to produce relevant results. Start a discovery session first." fallback, linking to `/discovery`.
- If you somehow had a roadmap id (you don't), any attempt to submit a research query would hit a 403 at the API.

**Flag if:**
- The UsageMeter renders with "0 of 30 Research Tool calls used this cycle" — that's a regression; Free users should see nothing.
- You reach the plan input and can submit a query successfully (would mean API gating broke).

---

## 3. Phase B — First discovery interview

This is the core Free-tier experience. It should feel like a thoughtful conversation, not a form.

### B.1 Entry

**Steps:**
1. Click "Discovery" in the sidebar, or navigate to `/discovery`.

**Expect:**
- Welcome screen with greeting using your first name ("Welcome, [First name]").
- A single chat input at the bottom, autofocused.
- A "Guide" button in the top-right with a **subtle primary-colored pulse indicator** (because `isFirstSession === true` for you — you have zero completed sessions).
- **No resumption card** (first visit, no in-flight session).

**Flag if:**
- The greeting fires with no name (your OAuth profile is missing `name`).
- The guide button has no pulse indicator.

### B.2 Open the Guide (optional but worth it once)

**Steps:**
1. Click "Guide".

**Expect:**
- A panel slides open explaining how the interview works (phases, rough length).
- The pulse indicator disappears.
- You can close the guide and return to the chat.

### B.3 Start the interview

**Steps:**
1. Type your persona into the input: *"I'm a solo developer in Lagos. I've built a personal finance tracker for African freelancers and want to figure out if I should charge for it or give it away to build a portfolio."*
2. Hit Enter (or click the send arrow — **no microphone button should be visible**; voice is Compound-only).

**Expect:**
- Your message posts, the send arrow briefly shows a loader, and a new assistant turn streams in.
- First assistant question is **phase = ORIENTATION** — it asks a grounding question about you / the situation. Something like "*What's pushing you to decide now — is there a deadline, a pattern, or a feeling?*" (the exact wording is model-generated; the *shape* is what matters — open, one question at a time, no multiple choice).

**Flag if:**
- The send button is disabled and never un-disables.
- The assistant response is multi-question ("1. What's your goal? 2. Who's your customer? ...") — the question selector is supposed to ask exactly one thing per turn.
- The page throws a hydration error in the console (usually a browser extension, but worth noting which extension).

### B.4 Proceed through the interview

**Steps:**
1. Answer each question in character. Don't skip, don't one-word. Give the model enough to extract belief state fields (market, goal, situation, stage, resources, psych, etc).
2. Count your turns. You should see 10–15 questions total across 4 phases.

**Watch for:**
- **Phase transitions.** The interview internally moves ORIENTATION → GOAL_CLARITY → CONSTRAINT_MAP → CONVICTION. You won't see phase labels in the UI, but questions shift theme: first they're about you/context, then about the goal you want, then about constraints (time, money, skills), then about conviction ("what would change your mind on this?").
- The question-stepper interface (it might render differently from the flat chat) — this is the progressive question surface that appears mid-interview. Answer it the same way.
- A running "question N of M" counter is **not** shown; the system doesn't pre-commit to a count because it decides dynamically when it has enough signal.

**Expect:**
- At some point around question 10–14, the assistant signals it has enough and synthesis begins. The UI flips into a **"Synthesising your recommendation…"** state with progress copy (`synthesisStep` updates: the engine writes real step names into the DB so the client shows *actual* progress, not a time-based animation).
- Synthesis typically takes 30–90 seconds. Opus is the synthesis model, not Sonnet — that's the slow one.

**Flag if:**
- Synthesis never fires and you keep getting questions past 15 turns — the `MAX_TOTAL_QUESTIONS = 15` cap should force synthesis.
- The UI shows "Synthesising…" for longer than 3 minutes — either Opus is stuck or a fallback didn't engage; check Vercel logs for `AI_RetryError` or `529` from Anthropic.
- The page silently throws and falls back to no state — the engine has retry-last-turn plumbing; there should be a visible error message with a retry button.

### B.5 Safety gate sanity

**Do not actually submit anything harmful**, but know that if you typed something like "help me run a fraud scheme," the safety classifier fires and the session is **permanently terminated** (`DiscoverySessionStatus = TERMINATED`). No amount of rephrasing re-opens it. This is by design — covered in [safety-gate.ts](../client/src/lib/discovery/safety-gate.ts).

**Flag if:** You mention anything business-legal (crypto, grey-market, competition-adjacent tactics) and the session terminates on that input. The safety rules explicitly state not to flag business difficulties, competitive concerns, grey-area-in-some-jurisdictions topics. Over-blocking is a bug.

### B.6 Synthesis completes — recommendation reveal

**Expect (a guided animation):**
- The UI transitions from "Synthesising…" to the recommendation reveal page at `/discovery/recommendation?from=<conversationId>`.
- You see a multi-section scrollable page:
  - **Summary** — one-sentence recommendation
  - **Path** — a slightly longer name for the path ("Build a paid tier for your finance tracker")
  - **Reasoning** — 2–4 paragraphs explaining *why* this path fits the belief state extracted from the interview
  - **First three steps** — concrete actionable starts
  - **Time to first result** — a realistic estimate
  - **Risks** — structured list with `risk` + `mitigation` pairs
  - **Assumptions** — things the system believed to reach this conclusion (you can challenge these on a paid tier)
  - **Honest falsification** — the field `whatWouldMakeThisWrong`. A paragraph stating what evidence or situation would invalidate this recommendation. This is the defining Free-tier deliverable — if it's empty or vague, something went wrong in synthesis.
  - **Alternatives rejected** — `{ alternative, whyNotForThem }` pairs showing paths the system considered and discarded, with reasoning.
- Two links above the scroll:
  - "Past recommendations" → `/discovery/recommendations`
  - "View interview transcript →" → `/chat/<conversationId>`

### B.7 What Free users DON'T see on the recommendation page

**This is the important reconciliation.** On this same page, an Execute or Compound user would see a "This is my path — build my roadmap" button and a pushback chat. **You should NOT see either.**

**Expect:**
- Where the accept button would be, you see an **UpgradePrompt hero** with uppercase "EXECUTE TIER" header and copy: *"Ready to execute? Your Free tier includes this recommendation and its reasoning. Upgrade to Execute to commit to this path — we'll generate your execution roadmap with Coach, Composer, Research, and Packager unlocked on every task."*
- A primary "Upgrade to Execute" CTA.
- **No PushbackChat component** — the comment thread input should not render at all.
- The **alternative-ready** gold box does NOT appear (alternatives are generated only after a round-7 pushback, and Free can't pushback).
- The "validation page" section does NOT appear (Compound-only, also requires `recommendationType` to be eligible).

**Flag if:**
- You see an accept button — the tier gate on the client component failed.
- You see a pushback chat input — same.
- Clicking the Upgrade CTA doesn't navigate to `/#pricing`.

### B.8 View the interview transcript

**Steps:**
1. Click "View interview transcript →".

**Expect:**
- Navigate to `/chat/<conversationId>`.
- Full message list: your inputs + each assistant question + the final synthesis prompt if it was exposed as a chat message (depends on design — some rows are synthetic).
- **No new input field** — this is a read-only archive of the interview conversation.

**Flag if:** The page shows a live chat input allowing you to keep messaging. The interview flow owns that conversation; the chat view should be read-only.

### B.9 Past recommendations

**Steps:**
1. Click "Past recommendations" or navigate to `/discovery/recommendations`.

**Expect:**
- Because no ventures exist (Free users can't create them), you see the **flat list fallback**, not the venture cards. Heading reads "**Past recommendations**".
- Your one recommendation is listed with its `path` text and createdAt date.
- A green "Start new discovery →" button in the top-right.

**Flag if:**
- Heading reads "Your ventures" — that means a venture somehow got created for a Free user. Shouldn't happen.
- The list is empty despite completing an interview — data wasn't persisted.

---

## 4. Phase C — Second discovery (cap testing)

This confirms the 2-session lifetime cap behaves correctly and the 3rd attempt is blocked cleanly.

### C.1 Start a second interview

**Steps:**
1. Click "Start new discovery →" from the Past recommendations page (or navigate back to `/discovery`).
2. Expect the welcome screen again, this time **without the guide pulse** (since `completedCount > 0`).
3. Run through a second interview with a **meaningfully different persona** so you can tell the synthesis outputs apart. Example: *"I'm a consultant who's been helping SMEs manually reconcile bank statements for three years. I want to figure out if I should productize this into a SaaS or just keep charging for the service."*

**Expect:**
- Interview flows identically to Phase B — ORIENTATION → … → CONVICTION → synthesis.
- A second recommendation lands on `/discovery/recommendation` (most-recent wins by default).
- `/discovery/recommendations` now shows **two entries** in the flat list.

**Flag if:**
- The second interview fails to start with a 403 before you even type — means the cap miscounts (should trigger at 3rd, not 2nd).
- The second recommendation overwrites the first in `/discovery/recommendations` — rows should be persisted independently, one per `DiscoverySession`.

### C.2 Third attempt — the block

**Steps:**
1. Again click "Start new discovery →" and try to start a third session.
2. Type *anything* and hit Enter.

**Expect:**
- The POST to `/api/discovery/sessions` returns **HTTP 403** with body `{ "error": "You've reached the free-tier limit. Upgrade to Execute to run unlimited discovery interviews." }`.
- The UI surfaces this as an error state in the chat (probably a toast or inline error). An Upgrade CTA should be nearby.

**Flag if:**
- The 3rd session starts normally — cap not enforced.
- You see a raw 403 but the UI shows no user-facing message — the client is not reading the `error` field.
- The error mentions Compound, or says "please contact support" — wrong copy branch fired.

---

## 5. Phase D — Settings revisited

After generating data (sessions, recommendations), re-check Settings.

### D.1 Privacy toggles

**Steps:**
1. Navigate to `/settings`.
2. Toggle "Training consent" ON. Expect a small confirmation state and a timestamp appearing beneath the toggle ("Consented [date]").
3. Refresh the page. Toggle state persists.
4. Toggle OFF. This triggers a retroactive deletion sweep of any previously-consented training payloads (should be none yet because you have no outcome records). Expect the timestamp to clear.

**Expect:**
- Both toggles are independently togglable. No errors.
- The timestamps display in a reasonable local format.

**Flag if:**
- Toggling throws a 401 (session refresh issue) or 500 (DB write issue).
- The timestamp persists after toggling off without resetting.

### D.2 Billing — still disabled

**Steps:**
1. Scroll to the Billing card.
2. Try clicking "Manage billing".

**Expect:**
- Button is disabled. Clicking does nothing.
- The muted "Complete a paid checkout to unlock billing management" stays visible.

**Flag if:** The button is enabled and clicking it triggers `generatePortalLink` → you get a `{ ok: false, reason: 'no-billing-profile' }` toast. That would mean the disabled-state gate broke.

---

## 6. Phase E — Gated paths, explored

Each of these is a "what happens if a Free user tries…" check. They're useful for spotting places where the gate logic is off.

### E.1 Directly POST to a gated route (use DevTools)

**Steps:**
1. Open DevTools → Console.
2. Run (replacing `<rec_id>` with one of your recommendation ids from `/discovery/recommendations`):
   ```js
   fetch('/api/discovery/recommendations/<rec_id>/pushback', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ content: 'test' }),
   }).then(r => r.status);
   ```

**Expect:** **`403`** — `"This feature requires an Execute or Compound subscription."`

Repeat for:
- `POST /api/discovery/recommendations/<rec_id>/accept` → 403
- `POST /api/discovery/recommendations/<rec_id>/roadmap` → 403
- `POST /api/discovery/recommendations/<rec_id>/validation-page` → 403 (Compound)

**Flag if:** Any route returns 200 or a different status (500, 401).

### E.2 Voice mode — must be invisible

**Steps:**
1. Go back to `/discovery` (any surface where a message input lives).
2. Inspect the input area.

**Expect:** **No microphone button.** Voice mode is Compound-only and its client hook (`useVoiceTier`) returns `'free'`, so `canUseVoiceMode` returns `false` and the button is never rendered.

**Flag if:** A microphone button appears on the Discovery input, check-in input, coach setup, composer context, research query, or packager adjust inputs.

### E.3 /tools standalone pages

**Steps:** Navigate directly to each:
- `/tools/conversation-coach`
- `/tools/outreach-composer`
- `/tools/research`
- `/tools/service-packager`

**Expect:** Each page loads and will hit the "no roadmap" fallback (because you have no roadmap as a Free user). The UsageMeter component **does not render** for Free users. No API calls succeed on submit.

### E.4 Validation page

**Steps:** Navigate to `/discovery/validation`.

**Expect:** The page loads but shows an empty state or a "no validation pages yet" fallback. Any "Create validation page" action posts to the Compound-gated route and returns **403**.

---

## 7. Edge cases worth exercising

Each takes 1–2 minutes. These surface subtle bugs that the happy-path flow above won't.

### 7.1 Refresh mid-interview

**Steps:** In an active (incomplete) interview, hit F5. Re-land on `/discovery`.

**Expect:**
- After 60+ seconds from your last turn, the resumption card appears: "You have an interview in progress — X questions in. Resume or start new?"
- Clicking "Resume" loads the session with the prior messages intact.
- Before 60 seconds, the resumption card is suppressed (`INCOMPLETE_MIN_AGE_MS`) — the server assumes the refresh was accidental and continues.

**Flag if:** The resumption card appears immediately after a refresh (before 60s). Or it fails to appear after 5 minutes.

### 7.2 Close tab, come back next day

**Steps:** Leave a session open, close the tab, return ≥1 hour later but ≤72 hours later.

**Expect:** Resumption card still appears. Past 72 hours, the card is suppressed and the session is treated as abandoned.

### 7.3 Local-draft persistence

**Steps:** Type a long message into the discovery input, **don't send**. Refresh the page.

**Expect:** Your draft is still there. The input reads from `localStorage` key `neuralaunch:discovery-input-draft` on mount.

**Flag if:** The draft is gone.

### 7.4 Rate limiting

**Steps:** Submit 30+ interview turns rapidly within a single minute. (Hard to do manually; you can simulate by hammering the endpoint from the console.)

**Expect:** At some point you hit `DISCOVERY_TURN` limit (30 requests per 5 minutes). Response is `429 — Too many requests — try again in Ns`.

**Flag if:** You can POST turns indefinitely without being rate-limited.

### 7.5 Network drop mid-stream

**Steps:** Open DevTools → Network tab → set throttling to "Offline". Hit send during a live interview turn.

**Expect:**
- The streaming response fails cleanly.
- A retry button appears in the chat or stepper surface.
- Clicking retry replays the last turn without losing context.

**Flag if:** The UI locks up, the last turn is permanently lost, or you see an uncaught promise rejection in the console.

---

## 8. What to capture when something breaks

For any flag in this document, please attach:

1. **What you clicked** (URL before, URL after, name of button).
2. **What you expected.**
3. **What actually happened** (screenshot helps).
4. **Network tab capture** — the failing request's status, response body, request body.
5. **Console tab capture** — any errors (red) or warnings (yellow) that fired around the same time.
6. **Server logs from Vercel** — timestamp window ±30s around the moment of failure. Grep for your `userId` if you have it.

Keep a single running notes file as you test. It's easier to triage ten flags from one test pass than to remember them later.

---

## 9. Quick reference — all Free-tier API responses

| Route | Free tier response |
|---|---|
| `GET /api/auth/session` | 200 — `{ user: { tier: "free", subscriptionStatus: "none" } }` |
| `POST /api/discovery/sessions` (1st, 2nd) | 200 — session id |
| `POST /api/discovery/sessions` (3rd) | 403 — "free-tier limit" message |
| `POST /api/discovery/sessions/[id]/turn` | 200 streaming |
| `POST /api/discovery/recommendations/[id]/accept` | 403 |
| `POST /api/discovery/recommendations/[id]/pushback` | 403 |
| `POST /api/discovery/recommendations/[id]/roadmap` | 403 |
| `POST /api/discovery/recommendations/[id]/validation-page` | 403 (Compound-gated) |
| Any `/api/discovery/roadmaps/*` route | 403 (Free has no roadmap id anyway) |
| `POST /api/voice/transcribe` | 403 (Compound-gated) |
| `GET /api/usage` | 200 — all-zero rows, but UsageMeter still renders nothing for Free |
| `GET /api/discovery/roadmaps/has-any` | 200 — `{ hasRoadmap: false }` |

---

## 10. After Free testing — natural next steps

Once this Free-tier pass is clean, the next test pass is:

1. Upgrade the same account to **Execute** via the Paddle sandbox checkout (card `4242 4242 4242 4242`). Verify `session.user.tier` flips to `'execute'` within ~30 seconds (session-tier cache TTL) and all gated surfaces unlock in order.
2. Re-run the gated-route checks in §6 — each should now return 200 instead of 403.
3. Generate a roadmap, run a task, use each of the four tools, watch the UsageMeter tick up.
4. Upgrade to Compound, confirm the voice mode microphone appears and validation page creation succeeds.

That sequence is out of scope for this document — we'll write it up separately once Free testing is signed off. Focus here is proving every Free surface works and every gated surface prompts cleanly.

---

**End of Free-tier test plan.**
