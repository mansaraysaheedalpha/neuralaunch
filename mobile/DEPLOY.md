# NeuraLaunch Mobile — Deployment Checklist

This document captures every step required to go from this repo to a live
build in the Apple App Store and Google Play Store. Written for **code-
complete state** — every item below is either a config action or a manual
account setup, not further coding.

---

## Prerequisites (one-time, per machine)

- Apple Developer Program membership (~$99/year) with an App Store Connect
  team set up.
- Google Play Console account ($25 one-time) with a developer profile.
- [Expo account](https://expo.dev/) (free) — the monorepo will publish
  builds through EAS against this account.
- Node 20 + pnpm available (the codebase already requires these).
- `eas-cli` installed globally: `npm i -g eas-cli` (this is the one spot
  `npm` is acceptable — see CLAUDE.md exception).

---

## Required environment variables

Set these in Vercel for `production`, `preview`, and `development`:

| Variable | Notes |
|---|---|
| `GITHUB_MOBILE_CLIENT_ID` | New "NeuraLaunch Mobile" GitHub OAuth App — separate from the web app's `GITHUB_CLIENT_ID` because GitHub only permits one callback URL per app. |
| `GITHUB_MOBILE_CLIENT_SECRET` | Same source. |

All other env vars (Google OAuth, Anthropic, Neon, etc.) already existed
for the web app and are reused by the mobile auth routes.

---

## OAuth console configuration

Confirm both providers have the mobile callback registered:

- **Google Cloud Console → OAuth 2.0 Client:** add
  `https://startupvalidator.app/api/auth/mobile/callback` to *Authorized
  redirect URIs*. Shared with the web app — single client works for both.
- **GitHub → New OAuth App "NeuraLaunch Mobile":** callback URL
  `https://startupvalidator.app/api/auth/mobile/callback`. The web app's
  existing GitHub OAuth App stays unchanged.

---

## EAS project bootstrap (one-time)

```bash
cd mobile
eas login                  # log into the Expo account
eas init --id <optional>   # generates a project ID, writes it into
                           # app.json → expo.extra.eas.projectId
```

After `eas init`, `getExpoPushTokenAsync()` on EAS builds will mint
production-valid push tokens automatically.

---

## Build profiles (defined in `mobile/eas.json`)

| Profile | Distribution | When to use |
|---|---|---|
| `development` | internal | Local dev-client build with the full dev menu. iOS simulator supported. |
| `preview` | internal | Unsigned Android APK you can install on any device by scanning a QR. iOS TestFlight-ready IPA. |
| `production` | store | Auto-increments `buildNumber` / `versionCode`. Signed for App Store + Play Store. |

All three extend a `base` profile that injects `EXPO_PUBLIC_API_URL=https://startupvalidator.app`.

---

## Dev loop

```bash
cd mobile
pnpm install --ignore-workspace      # pnpm, not npm — required
pnpm start                            # Metro + Expo Go
# …or, with a dev client on a real device:
eas build --profile development --platform android
eas build --profile development --platform ios
```

---

## Production release

1. **Confirm the branch is green.** Run `pnpm exec tsc --noEmit` inside
   both `client/` and `mobile/`. Run `pnpm lint` in `client/`. Both must
   pass.
2. **Merge** `feat/mobile-vision-refresh` → `dev` → `main`. Vercel
   auto-deploys `main` and runs `prisma migrate deploy && next build`.
   The push-tokens migration is additive and idempotent; safe to deploy.
3. **Build for stores.**
   ```bash
   cd mobile
   eas build --profile production --platform all
   ```
4. **Submit.**
   ```bash
   eas submit --profile production --platform ios      # first time: interactive prompt for ASC App ID
   eas submit --profile production --platform android
   ```
   Add the resulting ASC App ID to `eas.json → submit.production.ios.ascAppId`
   so future submits are hands-off.

---

## Smoke test after the build installs

Run the founder through this path on a real device, both iOS and Android:

1. Fresh install → onboarding carousel renders all 4 slides → tap "Start
   your discovery" → lands on sign-in.
2. Sign in with Google. The system browser opens → account picker → tap
   account → returns to the app (custom scheme `neuralaunch://auth/callback`
   deep-link) → Roadmap tab renders the empty state (no roadmap yet).
3. Sign in with GitHub. Same flow; must use the dedicated
   `GITHUB_MOBILE_CLIENT_ID` credentials. Verify in Vercel logs.
4. Tap Sessions → Start new discovery → complete interview → accept
   recommendation → roadmap generates (watch for the 20–30s building
   screen) → task cards render with tool choreography prose.
5. On a task with `suggestedTools: [research_tool]`, tap Research →
   plan → execute → report renders. On a task with `outreach_composer`,
   tap Outreach → pick mode → generate → copy a message.
6. Settings → Task nudges toggle. Leave it on.
7. Background the app. Wait for the roadmap-nudge cron to fire at 14:00
   UTC (or manually trigger from Inngest dashboard). Push should land on
   the device; tapping it should open the Roadmap tab with the relevant
   roadmap visible.
8. Sign out from Settings. Confirm in the backend (Neon or a log tail)
   that the `PushToken` row was deleted.

If all 8 pass, production is live.

---

## Known non-blocking follow-ups

- **Typed routes.** Currently off. Six `router.push('/...' as any)` calls
  exist. Turning on `experiments.typedRoutes` in `app.json` gives
  compile-time route safety but requires replacing those casts.
- **Reanimated restoration.** Plain `Animated` is used throughout because
  Expo Go doesn't load reanimated 4.x TurboModules. Dev builds via EAS
  support reanimated — safe to add later.
- **Service Packager tool.** Deferred per the action plan; referenced by
  the Research Tool's next-step handoffs but gracefully no-ops on mobile.
- **Voice mode.** Per action plan, spec only.
