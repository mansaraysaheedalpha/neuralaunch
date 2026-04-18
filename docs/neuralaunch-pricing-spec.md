# NeuraLaunch — Pricing and Payment Implementation Specification

---

## 1. Pricing Structure (Finalized)

### 1.1 Tier Definitions

These are the canonical tier descriptions. The marketing pricing
section at `client/src/components/marketing/PricingSection.tsx` MUST
match this table verbatim — drift between this spec and the cards is
a regression.

| Tier | Monthly | Annual | What's Included |
|---|---|---|---|
| **Free** | $0 | $0 | Complete discovery interview, one full recommendation with reasoning, the alternatives the system rejected and why, and honest falsification (what would make this recommendation wrong). |
| **Execute** | $29/month | $279/year | Everything in Free, plus push back up to seven rounds on recommendations, the phased execution roadmap, the four execution tools (Conversation Coach for high-stakes conversation prep, Outreach Composer for WhatsApp / email / LinkedIn drafts, Research Tool for deep market research, Service Packager for structuring a service offering), task-level check-ins and diagnostic help. One active venture at a time. |
| **Compound** | $49/month | $479/year | Everything in Execute, plus voice mode (speak answers instead of typing across interview, check-ins, Coach role-play), live validation landing pages with build brief from real market signal, the continuation brief at cycle end, fork selection into the next cycle, and cross-venture memory across all three of your ventures. Up to three active ventures simultaneously. |

### 1.2 Founding Member Rates

| Tier | Founding Rate | Standard Rate | Slots |
|---|---|---|---|
| Execute | $19/month for life | $29/month | First 50 paying users |
| Compound | $29/month for life | $49/month | First 50 paying users (when tier launches) |

Founding member rates are permanently grandfathered for the lifetime of the continuous subscription. If a founding member cancels and resubscribes, the founding rate is forfeited and the standard rate applies.

### 1.3 Tier Boundaries — What Each Tier Gates

This table is the single source of truth for tier gating. Code
changes that adjust which tier owns a feature MUST be paired with an
update to this table in the same commit. Discrepancies between this
table and runtime gating (`requireTierOrThrow` / `assertCompoundTier`
/ `assertVentureLimitNotReached`) are bugs, not allowed product
variation.

| Feature | Free | Execute | Compound |
|---|---|---|---|
| Discovery interview | ✓ | ✓ | ✓ |
| Recommendation with reasoning | ✓ | ✓ | ✓ |
| Alternatives rejected (with rationale) | ✓ | ✓ | ✓ |
| Honest falsification (`whatWouldMakeThisWrong`) | ✓ | ✓ | ✓ |
| Pushback (up to 7 rounds) | ✗ | ✓ | ✓ |
| Execution roadmap generation | ✗ | ✓ | ✓ |
| Conversation Coach | ✗ | ✓ | ✓ |
| Outreach Composer | ✗ | ✓ | ✓ |
| Research Tool | ✗ | ✓ | ✓ |
| Service Packager | ✗ | ✓ | ✓ |
| Task-level check-ins | ✗ | ✓ | ✓ |
| Diagnostic conversations | ✗ | ✓ | ✓ |
| Recalibration offers (within check-ins) | ✗ | ✓ | ✓ |
| Voice mode (speak instead of type) | ✗ | ✗ | ✓ |
| Continuation brief at cycle end | ✗ | ✗ | ✓ |
| Fork selection into next cycle | ✗ | ✗ | ✓ |
| Validation landing page + build brief | ✗ | ✗ | ✓ |
| Cross-venture memory (across all 3 ventures) | ✗ | ✗ | ✓ |
| Active ventures at once | 0 (recommendation only) | 1 | 3 |

### 1.4 Unit Economics

| Metric | Execute | Compound |
|---|---|---|
| Monthly price | $29.00 | $49.00 |
| Paddle fee (5% + $0.50) | $1.95 | $2.95 |
| Net revenue per user | $27.05 | $46.05 |
| Estimated COGS (with prompt caching) | $10-12 | $15-18 |
| Gross margin | 56-63% | 61-69% |

| Metric | Founding Execute | Founding Compound |
|---|---|---|
| Monthly price | $19.00 | $29.00 |
| Paddle fee | $1.45 | $1.95 |
| Net revenue per user | $17.55 | $27.05 |
| Estimated COGS (with prompt caching) | $10-12 | $15-18 |
| Gross margin | 32-42% | 33-44% |

**Critical engineering dependency:** Prompt caching must be implemented before launch. Without caching, COGS rises to $15-19 per active user, compressing margins to dangerous levels on the founding member rate. With caching (80% cache hit rate on belief state, recommendation, and roadmap context), input token costs drop from $15 to ~$4.20 per million tokens.

---

## 2. Payment Infrastructure — Paddle as Merchant of Record

### 2.1 Why Paddle

Stripe, PayPal, Wise, and Paystack are not available to Sierra Leone-based businesses. Paddle accepts Sierra Leone merchants, handles global tax compliance (VAT, sales tax, GST) as the Merchant of Record, and pays out via SWIFT to a USD domiciliary account in Freetown.

- **Fee:** 5% + $0.50 per transaction
- **Setup time:** 2-7 business days
- **Upfront cost:** $0
- **Tax compliance:** Fully handled by Paddle — Tabempa Engineering has zero global consumption tax obligations
- **Payout:** SWIFT wire to USD corporate domiciliary account
- **Payout threshold:** Set to $1,500-2,000 to dilute SWIFT intermediary fees ($15-35 per wire)

### 2.2 Paddle Account Setup

**Required documents for onboarding:**
- Government-issued identification for all stakeholders holding >25% equity (Alpha Saheed Mansaray, Saheed Alpha Mansaray)
- Tabempa Engineering Limited business registration certificate (SL110326TABEM29256)
- Domain ownership verification for startupvalidator.app
- Clear pricing page on the live site showing the subscription nature of the product

**Critical:** The landing page at startupvalidator.app must explicitly show subscription pricing before Paddle underwriting. Ambiguous language suggesting consulting services or physical goods will delay approval. The pricing section built into the landing page redesign satisfies this requirement.

### 2.3 Paddle Billing (Not Paddle Classic)

Use Paddle Billing exclusively — not Paddle Classic. Paddle Billing uses a decoupled entity model (Product, Price, Customer, Address) that supports multiple prices per product, which is required for the founding member architecture.

### 2.4 Paddle Dashboard — Product and Price Configuration

Create the following entities in the Paddle dashboard:

**Products:**
- `pro_execute_01` — "NeuraLaunch Execute"
- `pro_compound_01` — "NeuraLaunch Compound"

**Prices (attached to products):**

| Price ID | Product | Amount | Interval | Visibility |
|---|---|---|---|---|
| `pri_exec_mo_01` | pro_execute_01 | $29.00 | Monthly | Public |
| `pri_exec_yr_01` | pro_execute_01 | $279.00 | Annual | Public |
| `pri_comp_mo_01` | pro_compound_01 | $49.00 | Monthly | Public |
| `pri_comp_yr_01` | pro_compound_01 | $279.00 | Annual | Public |
| `pri_exec_fnd_01` | pro_execute_01 | $19.00 | Monthly | Hidden |
| `pri_comp_fnd_01` | pro_compound_01 | $29.00 | Monthly | Hidden |

**Founding member prices are hidden** — never displayed on the pricing page. The backend injects the founding member price ID into the checkout only when the authenticated user is verified as one of the first 50 registered accounts.

**Do NOT use Discount/Coupon entities for founding member rates.** Coupons can be detached during self-service modifications and complicate future promotions. Separate hidden Price entities on the same Product are the robust approach.

---

## 3. Backend Integration

### 3.1 Environment Variables

Add to `.env` and Vercel environment variables (all environments):

```
PADDLE_API_KEY=pdl_live_apikey_[hash]          # Backend API key (NEVER expose to frontend)
PADDLE_WEBHOOK_SECRET=[secret]                  # Webhook signature verification
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=live_[hash]     # Frontend client token (safe to expose)
NEXT_PUBLIC_PADDLE_ENV=production               # or 'sandbox' for development
```

For development/testing, use sandbox equivalents:

```
PADDLE_API_KEY=pdl_sandbox_apikey_[hash]
PADDLE_WEBHOOK_SECRET=[sandbox_secret]
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_[hash]
NEXT_PUBLIC_PADDLE_ENV=sandbox
```

### 3.2 SDK Installation and Singleton Client

Install: `pnpm add @paddle/paddle-node-sdk`

Create `lib/paddle/client.ts`:

```typescript
import { Environment, LogLevel, Paddle } from '@paddle/paddle-node-sdk';

const apiKey = process.env.PADDLE_API_KEY;
const isProduction = process.env.NODE_ENV === 'production';

if (!apiKey) {
  throw new Error('CRITICAL: PADDLE_API_KEY environment variable is missing.');
}

const globalForPaddle = global as unknown as { paddleClient: Paddle };

export const paddleClient =
  globalForPaddle.paddleClient ||
  new Paddle(apiKey, {
    environment: isProduction ? Environment.production : Environment.sandbox,
    logLevel: isProduction ? LogLevel.error : LogLevel.verbose,
  });

if (!isProduction) {
  globalForPaddle.paddleClient = paddleClient;
}
```

The singleton pattern prevents memory leaks during Next.js hot reloads in development.

### 3.3 Prisma Schema — Subscription Model

Add to `prisma/schema.prisma`:

```prisma
model Subscription {
  id                   String   @id @default(cuid())
  userId               String   @unique
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  paddleSubscriptionId String   @unique
  paddleCustomerId     String
  
  status               String   // 'active', 'past_due', 'paused', 'canceled'
  tier                 String   @default("free") // 'free', 'execute', 'compound'
  
  priceId              String?  // Tracks the specific Paddle price entity — identifies founding members
  billingInterval      String?  // 'monthly' or 'annual'
  
  cancelAtPeriodEnd    Boolean  @default(false)
  currentPeriodEnd     DateTime
  
  isFoundingMember     Boolean  @default(false)
  
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}
```

Add to the User model:

```prisma
model User {
  // ... existing fields
  paddleCustomerId String?       @unique
  subscription     Subscription?
}
```

### 3.4 Price-to-Tier Mapping

Create `lib/paddle/tiers.ts`:

```typescript
const PRICE_TO_TIER: Record<string, { tier: string; isFounder: boolean }> = {
  'pri_exec_mo_01': { tier: 'execute', isFounder: false },
  'pri_exec_yr_01': { tier: 'execute', isFounder: false },
  'pri_comp_mo_01': { tier: 'compound', isFounder: false },
  'pri_comp_yr_01': { tier: 'compound', isFounder: false },
  'pri_exec_fnd_01': { tier: 'execute', isFounder: true },
  'pri_comp_fnd_01': { tier: 'compound', isFounder: true },
};

export function resolveTier(priceId: string) {
  return PRICE_TO_TIER[priceId] ?? { tier: 'free', isFounder: false };
}
```

Replace the placeholder price IDs with actual Paddle-generated IDs after dashboard configuration.

### 3.5 Webhook Route

Create `app/api/webhooks/paddle/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { paddleClient } from '@/lib/paddle/client';
import { handleWebhookEvent } from '@/lib/paddle/webhook-processor';
import { waitUntil } from '@vercel/functions';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('paddle-signature');
  const secret = process.env.PADDLE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // CRITICAL: Use req.text() NOT req.json() — json() re-serialises 
  // the payload and breaks the HMAC-SHA256 signature verification.
  const rawBody = await req.text();
  let eventData;

  try {
    eventData = paddleClient.webhooks.unmarshal(rawBody, secret, signature);
  } catch (error) {
    console.error('Paddle webhook signature verification failed:', error);
    return NextResponse.json({ error: 'Signature mismatch' }, { status: 400 });
  }

  // Decouple processing from the HTTP response to avoid Paddle's 
  // 5-second timeout and Vercel cold start issues.
  waitUntil(handleWebhookEvent(eventData));

  // Acknowledge immediately
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
```

### 3.6 Webhook Event Processor

Create `lib/paddle/webhook-processor.ts`:

```typescript
import prisma from '@/lib/prisma';
import { resolveTier } from './tiers';

export async function handleWebhookEvent(event: any) {
  const eventType = event.eventType || event.event_type;

  switch (eventType) {
    case 'subscription.created':
      await handleSubscriptionCreated(event.data);
      break;
    case 'subscription.updated':
      await handleSubscriptionUpdated(event.data);
      break;
    case 'subscription.canceled':
      await handleSubscriptionCanceled(event.data);
      break;
    case 'subscription.paused':
      await handleSubscriptionPaused(event.data);
      break;
    case 'transaction.completed':
      await handleTransactionCompleted(event.data);
      break;
    case 'transaction.payment_failed':
      await handlePaymentFailed(event.data);
      break;
  }
}

async function handleSubscriptionCreated(data: any) {
  const internalUserId = data.custom_data?.internalUserId;
  if (!internalUserId) {
    console.error('Paddle subscription.created missing internalUserId in custom_data');
    return;
  }

  const priceId = data.items?.[0]?.price?.id;
  const { tier, isFounder } = resolveTier(priceId);

  // Idempotency: upsert to handle duplicate webhook deliveries
  await prisma.subscription.upsert({
    where: { paddleSubscriptionId: data.id },
    update: {
      status: data.status,
      tier,
      priceId,
      isFoundingMember: isFounder,
      currentPeriodEnd: new Date(data.current_billing_period?.ends_at),
    },
    create: {
      userId: internalUserId,
      paddleSubscriptionId: data.id,
      paddleCustomerId: data.customer_id,
      status: data.status,
      tier,
      priceId,
      billingInterval: data.billing_cycle?.interval || 'month',
      isFoundingMember: isFounder,
      currentPeriodEnd: new Date(data.current_billing_period?.ends_at),
    },
  });

  // Update user's paddleCustomerId for portal link generation
  await prisma.user.update({
    where: { id: internalUserId },
    data: { paddleCustomerId: data.customer_id },
  });
}

async function handleSubscriptionUpdated(data: any) {
  const priceId = data.items?.[0]?.price?.id;
  const { tier, isFounder } = resolveTier(priceId);

  const updateData: any = {
    status: data.status,
    tier,
    priceId,
    isFoundingMember: isFounder,
    currentPeriodEnd: new Date(data.current_billing_period?.ends_at),
    updatedAt: new Date(),
  };

  // Handle scheduled cancellation (cancel at end of period)
  if (data.scheduled_change?.action === 'cancel') {
    updateData.cancelAtPeriodEnd = true;
  } else {
    updateData.cancelAtPeriodEnd = false;
  }

  await prisma.subscription.update({
    where: { paddleSubscriptionId: data.id },
    data: updateData,
  });
}

async function handleSubscriptionCanceled(data: any) {
  await prisma.subscription.update({
    where: { paddleSubscriptionId: data.id },
    data: {
      status: 'canceled',
      tier: 'free',
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    },
  });
}

async function handleSubscriptionPaused(data: any) {
  await prisma.subscription.update({
    where: { paddleSubscriptionId: data.id },
    data: {
      status: 'paused',
      updatedAt: new Date(),
    },
  });
}

async function handleTransactionCompleted(data: any) {
  // Renewal payment succeeded — ensure subscription is active
  if (data.subscription_id) {
    await prisma.subscription.update({
      where: { paddleSubscriptionId: data.subscription_id },
      data: {
        status: 'active',
        updatedAt: new Date(),
      },
    });
  }
}

async function handlePaymentFailed(data: any) {
  // Card declined — Paddle begins dunning sequence
  if (data.subscription_id) {
    await prisma.subscription.update({
      where: { paddleSubscriptionId: data.subscription_id },
      data: {
        status: 'past_due',
        updatedAt: new Date(),
      },
    });
  }
}
```

---

## 4. Frontend Integration

### 4.1 Paddle.js Provider

Add to root layout. Uses `next/script` to load Paddle.js from CDN.

```typescript
// components/PaddleProvider.tsx
'use client';

import Script from 'next/script';
import { createContext, useContext, useState } from 'react';

const PaddleContext = createContext({ isReady: false });

export function usePaddle() {
  return useContext(PaddleContext);
}

export function PaddleProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  return (
    <PaddleContext.Provider value={{ isReady }}>
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (typeof window !== 'undefined' && window.Paddle) {
            window.Paddle.Environment.set(
              process.env.NEXT_PUBLIC_PADDLE_ENV === 'production'
                ? 'production'
                : 'sandbox'
            );
            window.Paddle.Initialize({
              token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
            });
            setIsReady(true);
          }
        }}
      />
      {children}
    </PaddleContext.Provider>
  );
}
```

### 4.2 Subscribe Button

```typescript
// components/SubscribeButton.tsx
'use client';

import { useSession } from 'next-auth/react';
import { usePaddle } from './PaddleProvider';

interface SubscribeButtonProps {
  priceId: string;
  tierName: string;
}

export function SubscribeButton({ priceId, tierName }: SubscribeButtonProps) {
  const { data: session } = useSession();
  const { isReady } = usePaddle();

  const initiateCheckout = () => {
    if (!window.Paddle || !session?.user?.id || !isReady) return;

    window.Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: {
        email: session.user.email!,
      },
      customData: {
        internalUserId: session.user.id,
        originTier: tierName,
      },
    });
  };

  return (
    <button onClick={initiateCheckout}>
      Upgrade to {tierName}
    </button>
  );
}
```

**Founding member checkout:** When the backend determines the user qualifies for the founding member rate, it returns the hidden founding price ID instead of the standard price ID. The SubscribeButton component receives whichever price ID the backend provides — it doesn't know or care whether it's the standard or founding rate.

### 4.3 Content Security Policy

Add to `next.config.js` headers or middleware:

```
script-src 'self' 'unsafe-inline' https://cdn.paddle.com
frame-src 'self' https://*.paddle.com
connect-src 'self' https://*.paddle.com
```

---

## 5. Feature Gating

### 5.1 JWT Tier Embedding

Embed the user's subscription tier into the Auth.js JWT token. This allows edge middleware to check the tier without a database query.

In the Auth.js configuration, add to the `jwt` callback:

```typescript
async jwt({ token, user }) {
  if (user?.id) {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    token.tier = subscription?.tier || 'free';
    token.subscriptionStatus = subscription?.status || 'none';
  }
  return token;
}
```

Add to the `session` callback:

```typescript
async session({ session, token }) {
  if (session.user) {
    session.user.tier = token.tier as string;
    session.user.subscriptionStatus = token.subscriptionStatus as string;
  }
  return session;
}
```

**When a webhook updates the subscription tier, the JWT must be refreshed.** The simplest approach: set a `tierUpdatedAt` timestamp on the User model when the webhook fires. The JWT callback checks if `tierUpdatedAt` is newer than the token's `iat` and re-fetches the tier if so.

### 5.2 Route-Level Gating

In the existing API routes, add tier checks:

```typescript
// Helper: lib/auth/require-tier.ts
export function requireTier(userTier: string, requiredTier: 'execute' | 'compound'): boolean {
  if (requiredTier === 'execute') {
    return ['execute', 'compound'].includes(userTier);
  }
  if (requiredTier === 'compound') {
    return userTier === 'compound';
  }
  return false;
}
```

Apply in route handlers:

```typescript
// Example: roadmap generation requires Execute tier
const session = await auth();
const tier = session?.user?.tier || 'free';

if (!requireTier(tier, 'execute')) {
  return NextResponse.json(
    { error: 'This feature requires an Execute subscription.' },
    { status: 403 }
  );
}
```

### 5.3 Feature Gating Map

| Route/Feature | Required Tier | Gate Location |
|---|---|---|
| `POST /api/discovery/sessions/start` | Free | No gate — always available |
| `POST /api/discovery/sessions/[id]/answer` | Free | No gate |
| `GET /api/discovery/recommendations/[id]` | Free | No gate |
| `POST /api/discovery/recommendations/[id]/pushback` | Execute | API route |
| `POST /api/discovery/recommendations/[id]/accept` | Execute | API route |
| `POST /api/discovery/recommendations/[id]/roadmap` | Execute | API route |
| All `/api/discovery/roadmaps/[id]/tasks/*` routes | Execute | API route |
| All `/api/discovery/roadmaps/[id]/coach/*` routes | Execute | API route |
| All `/api/discovery/roadmaps/[id]/composer/*` routes | Execute | API route |
| All `/api/discovery/roadmaps/[id]/research/*` routes | Execute | API route |
| All `/api/discovery/roadmaps/[id]/packager/*` routes | Execute | API route |
| `POST /api/discovery/roadmaps/[id]/continuation` | **Compound** | API route |
| `POST /api/discovery/roadmaps/[id]/continuation/fork` | **Compound** | API route |
| Voice mode endpoints (`POST /api/voice/transcribe`) | Compound | API route + `assertCompoundTier` |
| Cross-session memory loading | Compound | API route |
| Validation page creation | Compound | API route |
| Creating 2nd / 3rd concurrent venture | Compound | API route + `assertVentureLimitNotReached` |
| `/tools` standalone tools page | Execute | Client component (mirrors per-route gates) |

### 5.4 UI Gating

On the frontend, use the session tier to:
- Show the upgrade prompt on the recommendation page (Free users see "Upgrade to Execute to generate your roadmap")
- Show tool buttons on task cards (only for Execute+ users)
- Show the standalone `/tools` tile list (only for Execute+ users; Free users see the Execute UpgradePrompt hero in its place)
- Show the voice mode microphone button (only for Compound users — gated via `useVoiceTier()`)
- Show the "Founding Member — $19/month forever" badge in account settings for founding members
- Show "Cancel at period end" warning banner when `cancelAtPeriodEnd` is true
- Show "Payment failed — update your card" banner when status is `past_due`

---

## 6. Customer Portal

### 6.1 Portal Link Generation

```typescript
// app/actions/billing.ts
'use server';

import { paddleClient } from '@/lib/paddle/client';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';

export async function generatePortalLink() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });

  if (!subscription?.paddleCustomerId) {
    throw new Error('No active billing profile found.');
  }

  const portalSession = await paddleClient.customerPortalSessions.create({
    customerId: subscription.paddleCustomerId,
    subscriptionIds: [subscription.paddleSubscriptionId],
  });

  return portalSession.urls.general.overview;
}
```

The portal allows users to: update payment methods, view and download invoices, change billing address, and cancel subscriptions. No PCI-sensitive UI needs to be built in the NeuraLaunch codebase.

---

## 7. Founding Member Detection

### 7.1 Counting Logic

```typescript
// lib/paddle/founding-members.ts
import prisma from '@/lib/prisma';

const FOUNDING_MEMBER_LIMIT = 50;

export async function isFoundingSlotAvailable(): Promise<boolean> {
  const count = await prisma.subscription.count({
    where: { isFoundingMember: true },
  });
  return count < FOUNDING_MEMBER_LIMIT;
}

export async function getFoundingMemberCount(): Promise<number> {
  return prisma.subscription.count({
    where: { isFoundingMember: true },
  });
}
```

### 7.2 Checkout Price Selection

The pricing page component calls the backend to determine which price ID to use:

```typescript
// app/actions/pricing.ts
'use server';

import { isFoundingSlotAvailable } from '@/lib/paddle/founding-members';

export async function getPriceIds(tier: 'execute' | 'compound') {
  const foundingAvailable = await isFoundingSlotAvailable();

  if (tier === 'execute') {
    return {
      monthly: foundingAvailable ? 'pri_exec_fnd_01' : 'pri_exec_mo_01',
      annual: 'pri_exec_yr_01', // No founding annual rate
      isFoundingRate: foundingAvailable,
      foundingSlotsRemaining: foundingAvailable ? await getFoundingMemberCount() : 0,
    };
  }

  if (tier === 'compound') {
    return {
      monthly: foundingAvailable ? 'pri_comp_fnd_01' : 'pri_comp_mo_01',
      annual: 'pri_comp_yr_01',
      isFoundingRate: foundingAvailable,
    };
  }
}
```

The pricing page shows: "Founding member rate: $19/month forever — X of 50 slots remaining" when founding slots are available, and the standard price when they're not.

---

## 8. Migration Strategy for Existing Users

### 8.1 Phase 1 — Schema Deployment

Run the Prisma migration to add the Subscription model. No application code changes yet. All existing users continue to access all features.

### 8.2 Phase 2 — Data Backfill

Run a background script to create a virtual `free` tier subscription record for every existing user:

```typescript
const users = await prisma.user.findMany({
  where: { subscription: null },
});

for (const user of users) {
  await prisma.subscription.create({
    data: {
      userId: user.id,
      paddleSubscriptionId: `legacy_free_${user.id}`,
      paddleCustomerId: '',
      status: 'active',
      tier: 'free',
      currentPeriodEnd: new Date('2099-12-31'),
    },
  });
}
```

### 8.3 Phase 3 — Feature Flag Rollout

Enable the pricing UI behind a feature flag. Existing users see a "Founding Member — Upgrade for $19/month" banner but are not locked out of any features yet. This gives existing users first access to the founding member rate as a reward for being early.

### 8.4 Phase 4 — Hard Cutoff

After a defined grace period (14-30 days of banner visibility), enforce tier gating. All users without a paid subscription are restricted to the Free tier. Existing users who upgraded during the grace period retain their founding member rate. Those who didn't revert to Free tier access.

**Communication:** Send email notification 14 days before the hard cutoff. Send a second reminder 3 days before. Include a direct link to the founding member upgrade checkout.

---

## 9. Sandbox Testing Checklist

Before going to production, test every scenario in the Paddle sandbox:

| Test | Card Number | Expected Result |
|---|---|---|
| Successful monthly subscription | 4242 4242 4242 4242 | subscription.created webhook fires, Subscription record created with tier='execute' |
| Successful annual subscription | 4242 4242 4242 4242 | Same as above with billingInterval='annual' |
| 3D Secure authentication | 4000 0038 0000 0446 | Challenge flow completes, subscription created |
| Card declined | 4000 0000 0000 0002 | Checkout shows error, no webhook fires |
| Payment failure on renewal | 4000 0027 6000 3184 | transaction.payment_failed fires, status becomes 'past_due' |
| Upgrade Execute → Compound | N/A (API call) | subscription.updated fires, tier changes to 'compound' |
| Cancellation | N/A (portal or API) | scheduled_change set, then subscription.canceled fires at period end |
| Founding member checkout | 4242 4242 4242 4242 | Uses hidden price ID, isFoundingMember=true |
| Duplicate webhook delivery | Webhook simulator | Upsert handles idempotently, no duplicate records |
| Vercel cold start | Webhook simulator | waitUntil ensures processing completes after 200 response |

---

## 10. Banking Setup (Sierra Leone)

### 10.1 Required

Open a **USD corporate domiciliary account** at UBA, GT Bank, or Sierra Leone Commercial Bank under Tabempa Engineering Limited. This account receives SWIFT payouts from Paddle.

### 10.2 Payout Configuration

- Set Paddle payout threshold to $1,500-2,000
- Use SHA (shared) fee structure on SWIFT wires — anticipate $15-35 intermediary deductions per wire
- Hold USD in the domiciliary account as a hedge against Leone depreciation
- Convert to NLe only as needed for payroll, rent, taxes, and operational expenses

### 10.3 Domestic Tax

- Sierra Leone CIT: 30% on net profits (filed annually with NRA)
- GST on exported digital services: **Zero-rated** (0%) under GST Act 2009 Section 10
- No GST is added to subscription prices for international customers

---

## 11. Environment Variables Summary

| Variable | Location | Purpose |
|---|---|---|
| `PADDLE_API_KEY` | Server only (.env + Vercel) | Backend API authentication |
| `PADDLE_WEBHOOK_SECRET` | Server only (.env + Vercel) | Webhook signature verification |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Client-safe (.env + Vercel) | Frontend Paddle.js initialization |
| `NEXT_PUBLIC_PADDLE_ENV` | Client-safe (.env + Vercel) | 'sandbox' or 'production' |

**NEVER expose `PADDLE_API_KEY` to the frontend.** Only the client token (prefixed `test_` or `live_`) is safe for browser bundles.