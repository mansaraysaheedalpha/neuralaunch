// src/app/(app)/settings/page.tsx
import { redirect } from 'next/navigation';
import { auth }     from '@/auth';
import prisma       from '@/lib/prisma';
import { TrainingConsentSection } from './TrainingConsentSection';

/**
 * SettingsPage
 *
 * Minimal scaffold today — only the Privacy and Data section is
 * built. Concern 5 ships with the consent toggle here so the
 * founder has a discoverable place to flip it without going through
 * the inline outcome card.
 */
export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      trainingConsent:   true,
      trainingConsentAt: true,
    },
  });
  if (!user) redirect('/signin');

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how NeuraLaunch handles your data.
        </p>
      </div>

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
      </section>
    </div>
  );
}
