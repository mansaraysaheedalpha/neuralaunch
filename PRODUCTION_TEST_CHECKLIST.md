# NeuraLaunch — Production Test Checklist

> Every shippable behaviour from the architecture review work, listed
> in test order. Work top-to-bottom; mark each item ✅ when verified
> in production. The order is not arbitrary — earlier items unlock
> the later ones.
>
> **Tester:** Saheed Alpha Mansaray
> **Built against commit:** `b22df19` (main)
> **Last updated:** 2026-04-07
>
> ## Conventions
> - Each item lists the **action**, the **expected behaviour**, and the
>   **how to verify** if it's not visually obvious.
> - "DB check" means querying Postgres directly via Neon or Prisma Studio.
> - "Logs check" means filtering Vercel logs by the listed string.
> - When something fails, paste the failing item id and the actual
>   behaviour and we fix it before continuing.

---

## 0. Pre-flight

| # | Action | Expected | Verify |
|---|---|---|---|
| 0.1 | Open the production app | Loads, no console errors | DevTools console |
| 0.2 | Sign in | Lands on `/discovery` or your last page | – |
| 0.3 | Confirm Vercel env vars set: `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `TAVILY_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | All set | Vercel project settings |
| 0.4 | Inngest dashboard shows registered functions | 6 functions visible: `discovery-synthesis`, `discovery-roadmap-generation`, `validation-reporting-scheduler`, `validation-page-reporting`, `validation-page-lifecycle`, `pushback-alternative-synthesis`, `roadmap-nudge-sweep` | Inngest dashboard |

---

## 1. Discovery interview happy path (foundation for everything else)

| # | Action | Expected |
|---|---|---|
| 1.1 | `/discovery` → start a new session as Folake (the canonical Phase 3 trigger persona) | Welcome layer renders with the Discovery guide button visible |
| 1.2 | Type the opening message and send | Message bubble appears, then the question stepper opens with the first agent question streaming in |
| 1.3 | Refresh the page mid-typing | Your typed-but-unsent draft is restored from localStorage |
| 1.4 | Answer the first question and continue through ~6-8 turns | Each turn streams in, the question counter advances, no blank screens |
| 1.5 | Force a fallback test (optional, only if you want to verify resilience): temporarily set `ANTHROPIC_API_KEY` to an invalid value in Vercel → trigger one turn → restore | The turn still completes via Haiku or Gemini Flash. Logs show `[Fallback] First chunk received — committed to provider` with `google-gemini-flash` |
| 1.6 | Continue the interview to natural completion | Reflection streams in, then "synthesizing" state appears, then the recommendation page opens |

**Logs to grep:** `[Research] Starting`, `[Research] Complete`, `[Fallback] First chunk received`

**DB check:**
```sql
SELECT modelUsed, COUNT(*) FROM "Message" WHERE role = 'assistant' GROUP BY modelUsed;
```
Should show `anthropic-sonnet` for almost all rows.

---

## 2. Recommendation render + recommendationType gating (R2)

| # | Action | Expected |
|---|---|---|
| 2.1 | Read Folake's recommendation | All sections render: summary, path, reasoning, first three steps, time to result, risks, assumptions, what would make this wrong, alternative considered & rejected |
| 2.2 | Look at the bottom CTA section | "This is my path — build my roadmap" button is visible. **The "Build Validation Page" button is NOT visible yet** because the roadmap hasn't been generated |
| 2.3 | Open Folake's session DB row | `recommendationType` should be `build_software` |

**DB check:**
```sql
SELECT id, recommendationType, validationOutcome, phaseContext FROM "Recommendation" ORDER BY "createdAt" DESC LIMIT 5;
```
- `recommendationType` populated
- `validationOutcome` is null (not validated yet)
- `phaseContext` populated with `{ phaseNumber: 1, totalPhases: 5, upstream: { discoverySessionId } }`

---

## 3. Pushback + acceptance flow (Concerns 1+2)

| # | Action | Expected |
|---|---|---|
| 3.1 | Below the recommendation card, find the **PushbackChat** widget | Empty state shows "Disagree with something? Type your concern and I will engage honestly…" |
| 3.2 | Type a soft pushback ("I don't think I have the budget for the developer this assumes") and send | Optimistic user bubble appears, then the agent response streams in. Round counter shows `1/7`. Action is one of: continue_dialogue / defend / refine / replace |
| 3.3 | Send a second pushback if the agent didn't commit yet | Round counter advances to `2/7` |
| 3.4 | If the agent picks `refine` or `replace`, the recommendation card above mutates with the new content | The card content changes inline. A version snapshot is stored in the `versions` JSON column |
| 3.5 | Try to double-click "send" rapidly (concurrency test) | One request wins, the other returns a 409 "Another request modified this recommendation. Please refresh and try again." UI shows the error |
| 3.6 | Accept the recommendation: click "This is my path — build my roadmap" | Button shows "Committing…" then "Building your roadmap…" then redirects to the roadmap viewer |
| 3.7 | Try to double-click "This is my path" (idempotency test) | Only one accept, only one roadmap. Second click is a no-op idempotent success |
| 3.8 | After acceptance, return to the recommendation page via "Past recommendations" → click | An "Reopen the discussion (un-accept)" link appears below the View Roadmap button |
| 3.9 | Click "Reopen the discussion" then push back again | The roadmap is marked STALE on the next refine commit. The recommendation un-accepts |
| 3.10 | Push the conversation to round 7 | The closing-move message is delivered, no Opus call is made for that turn, an alternative-synthesis is queued via Inngest |
| 3.11 | Wait ~30 seconds | The "Alternative ready" amber card appears. Clicking it takes you to the alternative recommendation |
| 3.12 | Try to push back an 8th time | 409: "Pushback cap reached" |

**DB checks:**
```sql
-- Round count + accepted state
SELECT id, "acceptedAt", "acceptedAtRound", "unacceptCount", "alternativeRecommendationId" FROM "Recommendation" ORDER BY "createdAt" DESC LIMIT 5;

-- Pushback history shape
SELECT id, jsonb_array_length("pushbackHistory") AS turns FROM "Recommendation" ORDER BY "createdAt" DESC LIMIT 5;
```

**Logs to grep:** `[Pushback] Turn complete`, `[Pushback] Closing move delivered`

---

## 4. Stale roadmap banner (C5 from the hardening pass)

| # | Action | Expected |
|---|---|---|
| 4.1 | After step 3.4 (a refine commit), open the roadmap | An amber "Out of date" banner is shown above the phases |
| 4.2 | Click "Regenerate roadmap" | The viewer re-polls, shows the loading state, then renders the new roadmap once Inngest finishes |

---

## 5. Roadmap check-in system (Concern 4)

| # | Action | Expected |
|---|---|---|
| 5.1 | Open a fresh roadmap | Each task card has a status dropdown ("Not started" by default), task description, time/criteria badges, "Check in on this task" link |
| 5.2 | Change a task status to "In progress" | Status badge updates colour to blue. No agent call. DB row updates immediately |
| 5.3 | Click "Check in on this task" → category "I have a question" → type "What does Y mean here?" → submit | Agent response streams into the per-task transcript. Round counter shows `1/5`. Action label visible |
| 5.4 | Change a task status to "Blocked" | The check-in form **auto-opens** with "Blocked" preselected. The blocked-task immediate surface |
| 5.5 | Submit a real blocker text → agent responds with one of: acknowledged / adjusted_next_step / flagged_fundamental | If `adjusted_next_step` you see a "Proposed adjustments" amber card. If `flagged_fundamental` you see a red "Re-examine the recommendation" link that deep-links to the recommendation page |
| 5.6 | Mark a task "Completed" | The completion-acknowledgment card appears: green border, references the success criteria, quotes the founder's primary goal, shows progress count |
| 5.7 | Submit a 5th check-in on a single task | Round counter shows `5/5` |
| 5.8 | Try to submit a 6th | 409: "You have reached the check-in cap on this task" |

**DB checks:**
```sql
SELECT "totalTasks", "completedTasks", "blockedTasks", "lastActivityAt", "nudgePending"
FROM "RoadmapProgress" ORDER BY "updatedAt" DESC LIMIT 5;
```

**Logs to grep:** `[CheckIn] Turn starting`, `[CheckIn] Turn complete`

---

## 6. Validation page CTA gating (R2 + R3)

| # | Action | Expected |
|---|---|---|
| 6.1 | Return to Folake's recommendation page | "Build Validation Page" button is **now visible** because the roadmap is READY and `recommendationType === 'build_software'` |
| 6.2 | Run a second discovery session as Aminata (the non-software persona) | Recommendation generated. `recommendationType` should be one of: `process_change`, `sales_motion`, `build_service`, etc. — NOT `build_software` |
| 6.3 | Open Aminata's recommendation | The "Build Validation Page" button is **NOT shown** even though her roadmap will eventually be ready |
| 6.4 | Try to POST directly: `curl -X POST https://startupvalidator.app/api/discovery/recommendations/<aminata-rec-id>/validation-page` (defense-in-depth check) | Server returns 409 "A validation landing page is not applicable to this recommendation" |

---

## 7. Validation page generation + publish (Phase 3 core)

| # | Action | Expected |
|---|---|---|
| 7.1 | On Folake's recommendation, click "Build Validation Page" | Page generation runs (Sonnet call), preview iframe loads with the generated content |
| 7.2 | Click "Regenerate" | New content streams in, the iframe reloads via the PreviewFrame remount key |
| 7.3 | Click "Publish" | Distribution brief generates (3 channels). Status flips to LIVE. Slug is shareable |
| 7.4 | Open the public `/lp/<slug>` URL in an incognito tab | Page renders with hero, features, CTA, exit-intent overlay |
| 7.5 | Click a feature card "Notify me when this is ready" | An event POST fires to `/api/lp/analytics`. No visible error |
| 7.6 | Submit the email signup form | Same — event lands |
| 7.7 | Answer the entry survey | Same |
| 7.8 | Move cursor to the top of the viewport (desktop) OR switch tabs for >30s (mobile) | Exit intent fires. Mobile path: `pagehide` beacon sent via `navigator.sendBeacon` |

**DB checks:**
```sql
SELECT "eventType", COUNT(*) FROM "ValidationEvent"
WHERE "validationPageId" = '<your-page-id>' GROUP BY "eventType";
```

---

## 8. Validation reporting + interpretation + build brief

| # | Action | Expected |
|---|---|---|
| 8.1 | Generate enough activity to cross thresholds: 50 page views, 5 feature clicks, 3 survey responses (use multiple incognito sessions or the API directly) | Events accumulate in `ValidationEvent` |
| 8.2 | Manually trigger the reporting cron from the Inngest dashboard: send `validation/report.requested` with `{"pageId": "your-page-id"}` | A `ValidationSnapshot` is created with the aggregated metrics. A `ValidationReport` is created with the Opus build brief |
| 8.3 | Refresh the preview page | The BuildBriefPanel renders with: signal strength badge, "The call" paragraph, confirmed/rejected features, verbatim survey insights, next 48-hour action |
| 8.4 | Click "Use as my MVP spec" | `usedForMvp` flips to true, button replaced by "This brief is your MVP spec" |

**DB checks:**
```sql
-- The validationOutcome should now mirror signalStrength
SELECT id, "validationOutcome" FROM "Recommendation" WHERE id = '<rec-id>';

-- ValidationReport phaseContext populated
SELECT id, "phaseContext" FROM "ValidationReport" WHERE "validationPageId" = '<page-id>';
```

---

## 9. Negative-signal path (the honesty test)

| # | Action | Expected |
|---|---|---|
| 9.1 | Generate validation data that should be classified negative: high traffic, low conversion, surveys saying "I do not need this" | Synthetically post 100 page_views, 1 cta_signup, 3 negative-toned survey_response events |
| 9.2 | Trigger the reporting cron | Sonnet interpretation should classify as `negative` |
| 9.3 | The Opus build brief generates with `signalStrength: 'negative'` | The BuildBriefPanel UI **switches to the red "The market said no" treatment** |
| 9.4 | Verify: no MVP handoff button | The "Use as my MVP spec" button is replaced with "Start a new discovery session" |
| 9.5 | The dashboard chip shows "Market said no" instead of "Build brief ready" | – |
| 9.6 | The disconfirmedAssumptions and pivotOptions are populated and rendered | – |
| 9.7 | Try to POST `usedForMvp=true` directly to `/api/discovery/validation/[pageId]/report` | Server returns 409 "A negative validation cannot be used as an MVP spec" |

---

## 10. Concern 5 — Outcome capture (NEW IN THIS SHIP)

### 10a. Trigger #1 — completion path
| # | Action | Expected |
|---|---|---|
| 10.1 | On a roadmap with multiple tasks, mark every task as completed | After the LAST task transition to completed, the OutcomeForm appears at the bottom of the roadmap below the closing thought |
| 10.2 | The form shows 4 outcome cards with the spec copy | Yes |
| 10.3 | Pick "I took a different path — and here is what I learned" | The free-text field becomes required, placeholder asks "what would have made this recommendation more accurate" |
| 10.4 | Try to submit without free text | Submit button stays disabled |
| 10.5 | Type free text → submit (without opting in to training) | Form closes. DB row created with `consentedToTraining=false`, `anonymisedRecord=null` |

### 10b. Trigger #1 edge case — refine after completion
| # | Action | Expected |
|---|---|---|
| 10.6 | After the completion above, push back on the recommendation, get a refine, mark the new tasks complete | The OutcomeForm does **NOT** re-fire because an outcome row already exists |

### 10c. Consent toggle path
| # | Action | Expected |
|---|---|---|
| 10.7 | Visit `/settings` | Privacy and data section visible, toggle is OFF by default |
| 10.8 | Read the disclosure copy carefully | Mentions: lexical anonymisation, 24-month TTL, retroactive deletion |
| 10.9 | Toggle ON | Confirmation banner says "Training data sharing turned off… deleted" — wait, that's the off-side message. Check the on-side state |
| 10.10 | Submit a new outcome on a different recommendation while consent is ON | DB row has `consentedToTraining=true`, `anonymisedRecord` is populated with the stripped belief state |
| 10.11 | Verify the anonymisation in the DB row | Names redacted to `[redacted]`, location is country-only, no email/phone visible |
| 10.12 | Toggle consent OFF | Confirmation says "X anonymised outcome record(s) deleted from our training corpus." Past anonymisedRecord field is now NULL |
| 10.13 | Verify in DB: `SELECT id, "consentedToTraining", "anonymisedRecord" FROM "RecommendationOutcome";` — past row has `consentedToTraining=true` (audit fact) but `anonymisedRecord` is now NULL |

### 10d. Trigger #3 — new session blocked by pending outcome
| # | Action | Expected |
|---|---|---|
| 10.14 | Have at least one in-progress roadmap (>0 tasks complete, < total) with no outcome yet | – |
| 10.15 | Visit `/discovery` and try to start a NEW session | The session POST returns 200 with `pendingOutcomeRecommendationId` |
| 10.16 | The OutcomeForm appears as a fullscreen modal with the "session-block" heading | "Before you start a new session, what did the previous one teach you?" |
| 10.17 | Click "Skip for now" | Modal closes, the new session POST re-fires with `acknowledgePendingOutcome=true` and creates the session |
| 10.18 | Verify in DB: `outcomePromptSkippedAt` on the previous roadmap's progress row is now populated. No outcome row was created |

### 10e. Trigger #2 — proactive nudge sweep (manual cron trigger)
| # | Action | Expected |
|---|---|---|
| 10.19 | Find a roadmap that is ≥50% complete and has not been touched in 30+ days. (For testing, you can manually update `RoadmapProgress.lastActivityAt` to a date 31 days ago via DB) | – |
| 10.20 | Trigger the daily nudge cron from Inngest dashboard | After completion, `RoadmapProgress.outcomePromptPending` flips to true on eligible rows |
| 10.21 | Open that roadmap in the UI | The OutcomeForm appears at the bottom with the "nudge" heading: "It has been a while. What did this journey teach you?" |

### 10f. Hard data invariant
**This is the most important check in the entire test plan.** Run after at least 2 outcomes have been submitted:

```sql
SELECT id, "consentedToTraining", "anonymisedRecord"
FROM "RecommendationOutcome"
WHERE "consentedToTraining" = false
  AND "anonymisedRecord" IS NOT NULL;
```

**Expected: ZERO ROWS.** If this query ever returns a row, the hard data invariant has been violated and we have a serious bug. Stop testing and report immediately.

---

## 11. Cross-cutting checks

| # | Action | Expected |
|---|---|---|
| 11.1 | Open `/discovery/validation` (the validation pages dashboard) | Lists all your validation pages with status badges, signal strength chips, visitor counts |
| 11.2 | Open `/chat/<conversationId>` for one of your past sessions | Renders the read-only transcript with both interview turns AND pushback turns (footer section) |
| 11.3 | Open `/discovery/recommendations` | Lists all past recommendations |
| 11.4 | Try to access another user's recommendation by guessing the ID: `/discovery/recommendations/<not-yours>` | 404 |
| 11.5 | CSRF check (optional, advanced): from a browser console on a different origin, try `fetch('https://startupvalidator.app/api/discovery/recommendations/<id>/accept', { method: 'POST', credentials: 'include' })` | 403 "Cross-origin request rejected" — Sec-Fetch-Site header rejects it |
| 11.6 | Rate limit check: rapid-fire 10+ pushback attempts in a minute | 429 after the AI_GENERATION cap (5/min) |

---

## 12. Inngest function health

Open the Inngest dashboard and verify each function has run successfully at least once during your testing:

| Function | What triggered it during the test | Expected status |
|---|---|---|
| `discovery-synthesis` | Step 1 (interview completion) | ✅ Completed |
| `discovery-roadmap-generation` | Step 3.6 (clicking This is my path) | ✅ Completed |
| `validation-page-reporting` | Step 8.2 (manual cron trigger) | ✅ Completed |
| `validation-page-lifecycle` | Daily 03:00 UTC sweep | ✅ At least one run |
| `pushback-alternative-synthesis` | Step 3.10 (round 7 closing) | ✅ Completed |
| `roadmap-nudge-sweep` | Daily 14:00 UTC OR manual trigger | ✅ At least one run |
| `validation-reporting-scheduler` | Cron every N hours | ✅ At least one run |

---

## 13. Logs to grep on success

Open Vercel logs (Functions tab → filter) and confirm these strings appear at least once during the test session:

| Grep string | Indicates |
|---|---|
| `[Research] Starting` | Tavily research ran during synthesis |
| `[Research] Complete` | Research finished cleanly |
| `[Fallback] First chunk received` | Question-generation fallback chain committed to a provider |
| `[Pushback] Turn complete` | Pushback engine handled at least one turn |
| `[CheckIn] Turn complete` | Roadmap check-in agent ran |
| `Validation page saved` | Validation page generation succeeded |
| `Build brief persisted` | Validation reporting Opus call succeeded |
| `Outcome submitted` | Concern 5 outcome capture worked |
| `Training consent updated` | Settings consent toggle worked |

---

## When you finish

If every item is ✅, Phase 3 + Concerns 1-5 are production-ready. Bring me the list of any items that failed and we fix them in order.

If everything passes, the architecture review has zero open items. Concerns 1-5 are closed. The two deferred-for-data items (Roadmap Adjustment Layer and Cross-Phase Orchestration) are marked in the codebase with their production-data trigger thresholds and will be picked up after enough founders have run through the full pipeline.

The next critical task you mentioned is the next thing to work on after this checklist is complete.
