# Paddle Integration — Sandbox Testing Runbook

Every scenario below must pass in the Paddle sandbox before production
is opened for traffic. Cards are Paddle sandbox-only — none of them
charge real money.

---

## 0. Prerequisites

Before running any scenario:

1. `client/.env.local` has real sandbox values for all four Paddle
   variables:
   - `PADDLE_API_KEY=pdl_sandbox_apikey_…`
   - `PADDLE_WEBHOOK_SECRET=pdl_ntfset_…`
   - `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_…`
   - `NEXT_PUBLIC_PADDLE_ENV=sandbox`
2. The Paddle sandbox dashboard has the six prices configured (spec
   §2.4). The price ids in `src/lib/paddle/tiers.ts` and
   `src/lib/paddle/founding-members.ts` match the dashboard values.
3. A webhook subscription in the Paddle sandbox points at a
   publicly-reachable URL that forwards to your dev server, e.g.
   `https://<tunnel>.ngrok-free.app/api/webhooks/paddle`. The
   "Notification destination → Secret key" value matches
   `PADDLE_WEBHOOK_SECRET`.
4. `pnpm dev` is running; tail the dev server logs in a second terminal
   so webhook deliveries are visible in real time.
5. A freshly-created sandbox test user is signed in. (Sandbox prices
   only accept sandbox cards.)

---

## 1. Successful monthly subscription

| Field  | Value |
|--------|-------|
| Card   | `4242 4242 4242 4242` |
| Expiry | `12/30` |
| CVC    | `100` |
| Postcode | `SW1A 2AA` |

**Steps:**
1. Navigate to `/#pricing`.
2. Click the Execute tier's monthly CTA (should open the Paddle overlay).
3. Pay with the card above.

**Expected:**
- Checkout overlay closes with a success screen.
- Dev server logs show `POST /api/webhooks/paddle 200` within ~3s for
  `subscription.created` and `transaction.completed`.
- Database:
  ```sql
  SELECT tier, status, priceId, billingInterval, isFoundingMember
  FROM "Subscription"
  WHERE "userId" = '<test_user_id>';
  -- tier=execute, status=active, priceId=pri_exec_mo_01 (or pri_exec_fnd_01
  -- if a founding slot was still available), billingInterval=month,
  -- isFoundingMember matches which price id won.
  ```
- User row has `paddleCustomerId` populated and `tierUpdatedAt` newly
  set.
- Reloading the app puts the user into a session with
  `session.user.tier = 'execute'`.

---

## 2. Successful annual subscription

Same card as §1. Click the **Execute** CTA with the Annual toggle
selected.

**Expected:** same as §1 except `priceId=pri_exec_yr_01`,
`billingInterval=year`, `isFoundingMember=false` (no founding annual
rate per spec §1.2).

---

## 3. 3D Secure authentication

| Card | `4000 0038 0000 0446` |

**Steps:** attempt an Execute monthly checkout.

**Expected:**
- Paddle overlay shows a 3D Secure challenge — complete it.
- `subscription.created` fires; database state matches §1.

---

## 4. Card declined

| Card | `4000 0000 0000 0002` |

**Steps:** attempt an Execute monthly checkout.

**Expected:**
- Checkout overlay shows an inline decline error.
- NO webhook fires.
- NO row written to `Subscription`.
- User tier stays at `free`.

---

## 5. Payment failure on renewal

| Card | `4000 0027 6000 3184` |

**Steps:**
1. Complete an Execute monthly checkout with this card.
2. In the Paddle sandbox dashboard, advance the subscription's clock
   to trigger a renewal. (Sandbox → subscription detail → "Actions" →
   "Simulate renewal".)

**Expected:**
- `transaction.payment_failed` webhook fires.
- `Subscription.status` transitions to `past_due`.
- Settings → Billing page renders the amber "Payment failed — update
  your card" banner.
- The "Manage billing" button takes the user to a Paddle portal
  session where they can update their card.

---

## 6. Upgrade Execute → Compound

**Steps:**
1. Start with an active Execute subscription (from §1).
2. In the Paddle portal (via the Manage billing button), change the
   plan to Compound.

**Expected:**
- `subscription.updated` fires.
- `Subscription.tier` transitions from `execute` to `compound`.
- `tierUpdatedAt` on User is bumped.
- On next navigation, `session.user.tier = 'compound'`.
- Compound-only routes (validation page creation) now return 2xx
  instead of 403.

---

## 7. Cancellation (scheduled at period end)

**Steps:**
1. From an active subscription, open the Paddle portal.
2. Click "Cancel subscription" — Paddle schedules the cancellation
   for the current period end.

**Expected immediate:**
- `subscription.updated` fires with
  `scheduledChange.action === 'cancel'`.
- `Subscription.cancelAtPeriodEnd` flips to `true`.
- Settings → Billing shows the "subscription scheduled to end" banner.
- User retains full access until the period end (tier still
  `execute`/`compound`).

**Expected at period end** (simulate via Paddle sandbox clock):
- `subscription.canceled` fires.
- `Subscription.status = canceled`, `tier = free`,
  `cancelAtPeriodEnd = false`.
- `tierUpdatedAt` bumped.
- Gated routes now return 403.

---

## 8. Founding member checkout

**Steps:**
1. Confirm the Paddle dashboard count of founding-member subscriptions
   is less than 50 (`SELECT COUNT(*) FROM "Subscription" WHERE
   "isFoundingMember" = true`).
2. Visit `/#pricing`; the founding banner should be visible and the
   Execute monthly price should show `$19/mo` with a "Founding member
   rate — $29/mo after launch" subline.
3. Check out with card §1.

**Expected:**
- The checkout overlay references the hidden price (`pri_exec_fnd_01`).
- `Subscription.priceId = pri_exec_fnd_01`,
  `Subscription.isFoundingMember = true`.
- Settings → Billing shows the gold "Founding member" pill.

---

## 9. Duplicate webhook delivery

**Steps:**
1. Complete any subscription.
2. In the Paddle sandbox dashboard → webhook logs, click "Replay" on
   the `subscription.created` delivery.

**Expected:**
- Second delivery returns `200 OK`.
- Database state unchanged — `Subscription` row for that user still
  has exactly one row (upsert keyed on `paddleSubscriptionId` absorbs
  the second event).
- No duplicate `Subscription` rows for the same `userId`.

---

## 10. Customer portal flow

**Steps:**
1. Sign in as a user with an active subscription.
2. Go to Settings → Billing.
3. Click "Manage billing".

**Expected:**
- Server action `generatePortalLink` returns a fresh portal URL.
- Browser is redirected to
  `https://sandbox-customer-portal.paddle.com/…`.
- Portal displays the active subscription, payment method, invoice
  history.
- From the portal, user can update card, download invoices, change
  billing address, cancel, or resume.
- Returning to Settings → Billing and clicking again generates a NEW
  URL (never reuses).

---

## 11. Cold-start webhook timeout smoke

**Steps:**
1. Stop `pnpm dev`; wait long enough for the Vercel Function to cold.
   (Or deploy the branch to a preview on Vercel and target that.)
2. Replay any subscription event from the Paddle dashboard.

**Expected:**
- Webhook route returns `200` within Paddle's 5-second budget.
- `after()` continues processing post-response — the `Subscription`
  update lands within a few additional seconds.
- Paddle dashboard shows the delivery as successful.

---

## 12. CSP / Paddle.js loading

**Steps:**
1. Open DevTools → Console on the pricing page.
2. Click either Execute or Compound monthly CTA.

**Expected:**
- No CSP violations reported.
- `cdn.paddle.com/paddle/v2/paddle.js` loaded successfully.
- The overlay iframe (hosted at `*.paddle.com`) renders.

---

## 13. Sign-in redirect from pricing

**Steps:**
1. Sign out.
2. Click any paid tier CTA.

**Expected:**
- Browser navigates to `/signin?returnTo=%2F%23pricing`.
- After sign-in, the user lands back at the pricing section.
