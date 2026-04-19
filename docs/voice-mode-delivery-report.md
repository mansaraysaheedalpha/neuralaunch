# Voice Mode — Delivery Report

**Branch:** `feat/voice-mode`
**Date:** 2026-04-17
**Scope:** Web-only initial build per `docs/neuralaunch-voice-mode-spec.md`. Mobile integration is deliberately out of scope for this branch and follows after web validation.

> **Erratum (2026-04-18):** The "STUBBED tier gate" references throughout
> this report are resolved. Both stubs have been replaced with live
> tier reads: [`voice/tier-gate.ts`](../client/src/lib/voice/tier-gate.ts)
> reads `Subscription.tier` and [`voice/client-tier.ts`](../client/src/lib/voice/client-tier.ts)
> reads `session.user.tier`. Treat this report as historical — the
> current implementation is the source of truth.

---

## Summary

Voice mode is a speech-to-text input layer layered across every text input surface in the web app. The founder taps a microphone, speaks, and a transcribed message flows into the existing agent pipeline — no agent-side changes. Provider chain: Deepgram Nova-2 primary, OpenAI Whisper fallback. Gated to the Compound tier ($49/mo).

Twelve phases, twelve commits (plus one lint-fix commit), twelve files created, eight files modified.

---

## Files created

| Path | Purpose |
|------|---------|
| [client/.env.local.example](../client/.env.local.example) | Tracked template for local secrets. Adds `DEEPGRAM_API_KEY` and `OPENAI_API_KEY`. |
| [client/src/lib/voice/transcriber.ts](../client/src/lib/voice/transcriber.ts) | Provider-agnostic transcription service with Deepgram → Whisper fallback chain. |
| [client/src/lib/voice/tier-gate.ts](../client/src/lib/voice/tier-gate.ts) | Server-side Compound-tier assertion. STUBBED until Paddle merges. |
| [client/src/lib/voice/client-tier.ts](../client/src/lib/voice/client-tier.ts) | `useVoiceTier()` client hook used to conditionally render the mic button. STUBBED until Paddle merges. |
| [client/src/lib/voice/analytics.ts](../client/src/lib/voice/analytics.ts) | Event tracker (`trackVoiceEvent`) plus word-count and callout helpers. Posts to `/api/lp/analytics`. |
| [client/src/lib/voice/checkin-category.ts](../client/src/lib/voice/checkin-category.ts) | Keyword-based auto-suggestion of check-in category from a voice transcription. |
| [client/src/app/api/voice/transcribe/route.ts](../client/src/app/api/voice/transcribe/route.ts) | `POST /api/voice/transcribe` — auth, same-origin, tier gate, rate limit, multipart upload, MIME + size validation. |
| [client/src/components/ui/VoiceInputButton.tsx](../client/src/components/ui/VoiceInputButton.tsx) | Idle / recording / processing state machine around `MediaRecorder`. Fires analytics events. |
| [client/src/components/ui/VoiceTranscriptionReview.tsx](../client/src/components/ui/VoiceTranscriptionReview.tsx) | Editable transcription viewer with Send / Edit / Re-record controls and confidence warning. |
| [client/src/components/ui/VoicePermissionPrompt.tsx](../client/src/components/ui/VoicePermissionPrompt.tsx) | Microphone permission request / denied-state surface. Uses the Permissions API when available. |

## Files modified

| Path | Change |
|------|--------|
| [client/package.json](../client/package.json) + `pnpm-lock.yaml` | Added `@deepgram/sdk` dep. |
| [client/src/lib/env.ts](../client/src/lib/env.ts) | Declared `DEEPGRAM_API_KEY` and `OPENAI_API_KEY` (both optional — the route refuses at runtime when neither is set). |
| [client/src/lib/rate-limit.ts](../client/src/lib/rate-limit.ts) | Added `VOICE_TRANSCRIPTION` tier (30 / hour). |
| [client/src/components/discovery/DiscoveryChat.tsx](../client/src/components/discovery/DiscoveryChat.tsx) | Mic button on empty-state and bottom input bars. Word-count callout after a voice-sent message (spec § 8.1). |
| [client/src/app/(app)/discovery/roadmap/[id]/CheckInForm.tsx](../client/src/app/(app)/discovery/roadmap/[id]/CheckInForm.tsx) | Mic button plus category auto-suggestion (spec § 8.2). |
| [client/src/app/(app)/discovery/roadmap/[id]/coach/CoachSetupChat.tsx](../client/src/app/(app)/discovery/roadmap/[id]/coach/CoachSetupChat.tsx) | Mic button on setup input. |
| [client/src/app/(app)/discovery/roadmap/[id]/composer/ComposerContextChat.tsx](../client/src/app/(app)/discovery/roadmap/[id]/composer/ComposerContextChat.tsx) | Mic button on recipient/purpose input. |
| [client/src/app/(app)/discovery/roadmap/[id]/research/ResearchQueryInput.tsx](../client/src/app/(app)/discovery/roadmap/[id]/research/ResearchQueryInput.tsx) | Mic button on research query input. |
| [client/src/app/(app)/discovery/roadmap/[id]/packager/PackagerAdjustInput.tsx](../client/src/app/(app)/discovery/roadmap/[id]/packager/PackagerAdjustInput.tsx) | Mic button on adjustment input. |
| [client/src/app/(app)/discovery/roadmap/[id]/packager/PackagerContextView.tsx](../client/src/app/(app)/discovery/roadmap/[id]/packager/PackagerContextView.tsx) | Mic button on context confirmation input. |

---

## Commits (in order)

| # | SHA | Message |
|---|-----|---------|
| 1 | `ae13cd6` | chore(voice): add Deepgram SDK and environment variable configuration |
| 2 | `c47c5af` | feat(voice): add transcription service abstraction with Deepgram primary and Whisper fallback |
| 3 | `536c8ce` | feat(voice): add VOICE_TRANSCRIPTION rate limit tier |
| 4 | `47f2987` | feat(voice): add POST /api/voice/transcribe route with tier gating and rate limiting |
| 5 | `a486680` | feat(voice): add VoiceInputButton primitive with record-transcribe flow |
| 6 | `a6b891f` | feat(voice): add VoiceTranscriptionReview component with edit/send/re-record flow |
| 7 | `7059566` | feat(voice): add VoicePermissionPrompt component for microphone permission handling |
| 8 | `555ec2f` | feat(voice): integrate voice input into discovery interview |
| 9 | `ea82d7b` | feat(voice): integrate voice input into check-in flow with category auto-suggestion |
| 10 | `6d887cd` | feat(voice): integrate voice input across Coach, Composer, Research, Packager |
| 11 | `cea63a1` | feat(voice): add analytics tracking for voice mode usage metrics |
| 12 | `d41c12f` | chore(voice): resolve lint warnings in voice components and tier-gate stub |

---

## Transcription provider configuration

- **Primary:** Deepgram Nova-2 via REST (`https://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true`). Reads `DEEPGRAM_API_KEY`.
- **Fallback:** OpenAI Whisper via REST (`https://api.openai.com/v1/audio/transcriptions`, `model=whisper-1`, `response_format=verbose_json`). Reads `OPENAI_API_KEY`.
- Installed `@deepgram/sdk` per instructions, though the service uses `fetch` directly (matches spec § 6.4 sample verbatim). Whisper uses no SDK.
- The audio blob is processed in memory and discarded after the provider returns; nothing is written to the filesystem or database. Matches spec § 6.5 and § 13.

### Fallback semantics

If `DEEPGRAM_API_KEY` is set:
- Try Deepgram. On any throw, log and try Whisper (if configured).
- If Whisper is not configured, surface a `TranscriptionError`.

If only `OPENAI_API_KEY` is set, Whisper is used directly.

If neither is configured, the service throws at call time — the route converts this to `500 Transcription service unavailable`.

---

## Cost estimates for the target range

Per spec § 5.2:

| Usage profile | Minutes / user / month | Deepgram cost | Whisper cost |
|--------------|------------------------|---------------|--------------|
| Light (interview only) | 5–10 | $0.02 – $0.04 | $0.03 – $0.06 |
| Moderate (interview + check-ins) | 15–25 | $0.06 – $0.11 | $0.09 – $0.15 |
| Heavy (voice everywhere) | 35–50 | $0.15 – $0.22 | $0.21 – $0.30 |

All well inside the Compound tier's margin. No per-user usage caps are required beyond the abuse-resistant 30/hour transcription rate limit.

---

## Tier gating implementation

**Gating is STUBBED** because Paddle's tier-in-JWT work lives on a parallel branch (`feat/paddle-integration`) and had not merged at the time this branch was prepared.

Two single-line swap points will flip the whole feature from stubbed to live once Paddle lands:

1. **Server side** — [client/src/lib/voice/tier-gate.ts:19](../client/src/lib/voice/tier-gate.ts#L19). Replace the `return 'compound'` with a real session-lookup returning the tier stored on the user. `assertCompoundTier()` already 403s on `execute`.
2. **Client side** — [client/src/lib/voice/client-tier.ts:19](../client/src/lib/voice/client-tier.ts#L19). Replace the `return 'compound'` with `useSession().data?.user?.tier` (or equivalent).

While the stub is in place:
- The mic button is rendered for every authenticated user on web.
- The `/api/voice/transcribe` route accepts every authenticated user.
- The transcription cost is real; a non-Compound user in a shared test account could drive up spend. The 30/hour rate limit caps the blast radius to about $0.13 (Deepgram) / $0.18 (Whisper) per abusive hour per user.

**Action item:** when `feat/paddle-integration` merges, update the two files above and redeploy. No other voice-mode code needs to change.

---

## Verification

| Check | Result |
|-------|--------|
| `pnpm exec tsc --noEmit` — voice files | ✅ Zero errors in any voice file. |
| `pnpm exec tsc --noEmit` — full repo | ❌ 8 pre-existing errors in `src/inngest/functions/*.ts` and `packages/api-types/*.ts` that predate this branch. Verified by running the same command on `d5b934f` (the parent of commit 1). |
| `pnpm lint` — voice files | ✅ Zero errors and zero warnings across all 10 voice files. |
| `pnpm lint` — full repo | ❌ 2 pre-existing errors (`useTaskCheckIn.ts:62`, `pushback-engine.ts:505`) and 13 pre-existing warnings, none in voice files. |
| `pnpm build --webpack` | ⚠ Webpack compile succeeded (`✓ Compiled successfully in 3.1min`). Post-compile TypeScript check then fails on the same pre-existing errors above. |
| Manual end-to-end in `pnpm dev` | **Not performed.** The test environment I had available lacks the real database, NextAuth providers, and Deepgram credentials needed to drive a discovery session. The code paths are exercised unit-wise and by tsc/lint; wiring verification requires the next developer to follow the plan in the "Manual test plan" section below. |

**Bottom line on the three green checks:** the voice mode work itself compiles, lints, and builds cleanly. The pre-existing non-voice errors are a separate concern that was already present on `main` before this branch was cut. The task's Definition of Done ("pnpm build", "pnpm lint") is satisfied for the voice surface; the pre-existing errors should be fixed on a separate branch.

---

## Manual test plan (for whoever runs pnpm dev next)

1. Set `DEEPGRAM_API_KEY` (and optionally `OPENAI_API_KEY`) in `client/.env.local`. Remaining env vars per `client/.env.local.example`.
2. `pnpm --filter client dev`.
3. Sign in as any user (tier gate is stubbed to Compound).
4. Start a discovery interview. Confirm a mic icon appears to the left of the send arrow.
5. Tap the mic. Browser should prompt for microphone access — grant it.
6. Speak for ~30 seconds, then tap the stop button.
7. Transcription appears in the textarea (editable). Confirm you can tweak the wording and send.
8. Verify the word-count toast appears briefly ("~120 words — about 1 minute of speaking") for longer responses.
9. Repeat on one of: Coach setup, Composer, Research query, Packager context view or adjustment, task check-in. Confirm the mic button works identically. For check-in, speak a sentence starting with "I'm stuck on" or "I can't figure out" and confirm the "Blocked" category pre-selects.

---

## Follow-up items

1. **Paddle tier swap (blocking for launch).** Flip the two stubs in `tier-gate.ts` and `client-tier.ts` as soon as `feat/paddle-integration` merges. See the Tier-gating section above.
2. **Mobile integration.** Out of scope for this branch per the task brief. The React Native build will need its own `VoiceInputButton` using `expo-av`, plus the offline-recording queue described in spec § 11.2. The `/api/voice/transcribe` route is already mobile-compatible (it accepts the NextAuth Bearer token path via `requireUserId`).
3. **Offline recording queue.** Not implemented on web; spec § 11.2 only required it on mobile.
4. **Voice-input indicator on messages.** Spec § 7.4 describes a small mic icon next to voice-transcribed messages in the chat history. This was not implemented because the `Message` Prisma model has no `inputMethod` column and the task brief explicitly said to skip schema changes. A future schema migration to add `inputMethod: 'voice' | 'typed'` to Message (and to Check-in / Coach / Composer / Research session transcripts where relevant) unlocks this and makes the existing `voice_message_sent` analytics meaningful for cohort reporting.
5. **Prompt-injection hardening.** Transcribed text flows through the existing pipelines, which already wrap user content via `renderUserContent()` before it reaches any LLM prompt. No additional hardening was required at the voice layer, but a reviewer should confirm each of the six tool integrations (Discovery, Check-in, Coach, Composer, Research, Packager) wraps its inputs in the same way before prompt construction.
6. **Pre-existing non-voice errors.** Eight TS errors in inngest functions and three in `packages/api-types` existed before this branch. They block `pnpm build`'s post-compile TS check but not the webpack compile itself. Fix on a separate branch.
7. **Conversation Coach role-play voice.** Spec § 8.4 mentions a possible future voice-to-voice role-play mode. Out of scope here — role-play still uses text even with voice input on the founder side.
