// src/app/(app)/settings/page.tsx
import { redirect } from 'next/navigation';
import { auth }     from '@/auth';
import prisma       from '@/lib/prisma';
import { TrainingConsentSection }          from './TrainingConsentSection';
import { AggregateAnalyticsConsentSection } from './AggregateAnalyticsConsentSection';
import { AccountInfoSection }              from './AccountInfoSection';
import { BillingSection }                  from './BillingSection';

/**
 * SettingsPage
 *
 * Central hub for account management and privacy controls.
 * Replaces the old standalone Profile page — the sidebar now
 * links here instead of /profile.
 *
 * Sections:
 *   1. Account information (name, email, connected providers)
 *   2. Privacy and data (training consent + aggregate analytics consent)
 */
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const [user, accounts, subscription] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: userId },
      select: {
        trainingConsent:            true,
        trainingConsentAt:          true,
        aggregateAnalyticsConsent:   true,
        aggregateAnalyticsConsentAt: true,
        paddleCustomerId:           true,
      },
    }),
    prisma.account.findMany({
      where:  { userId },
      select: { provider: true },
    }),
    prisma.subscription.findUnique({
      where:  { userId },
      select: {
        tier:              true,
        status:            true,
        isFoundingMember:  true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd:  true,
      },
    }),
  ]);
  if (!user) redirect('/signin');

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account and control how NeuraLaunch handles your data.
        </p>
      </div>

      {/* Account information */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Account</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your profile and connected sign-in providers.
          </p>
        </div>

        <AccountInfoSection
          name={session.user.name ?? null}
          email={session.user.email ?? null}
          image={session.user.image ?? null}
          providers={accounts.map(a => a.provider)}
        />
      </section>

      {/* Privacy and data */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Privacy and data</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What NeuraLaunch is allowed to do with the things you share during interviews and check-ins.
          </p>
        </div>

        <TrainingConsentSection
          initialConsent={user.trainingConsent}
          initialConsentedAt={user.trainingConsentAt?.toISOString() ?? null}
        />

        <AggregateAnalyticsConsentSection
          initialConsent={user.aggregateAnalyticsConsent}
          initialConsentedAt={user.aggregateAnalyticsConsentAt?.toISOString() ?? null}
        />
      </section>

      {/* Billing */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Billing</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage your subscription, update your card, and download invoices.
          </p>
        </div>

        <BillingSection
          tier={(subscription?.tier ?? 'free') as 'free' | 'execute' | 'compound'}
          status={subscription?.status ?? 'none'}
          isFoundingMember={subscription?.isFoundingMember ?? false}
          cancelAtPeriodEnd={subscription?.cancelAtPeriodEnd ?? false}
          currentPeriodEnd={subscription?.currentPeriodEnd?.toISOString() ?? null}
          hasBillingProfile={Boolean(user.paddleCustomerId)}
        />
      </section>
    </div>
  );
}
