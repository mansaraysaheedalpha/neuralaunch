// src/app/(app)/discovery/validation/page.tsx
import Link             from 'next/link';
import { redirect }     from 'next/navigation';
import { auth }         from '@/auth';
import prisma           from '@/lib/prisma';

/**
 * ValidationDashboardPage
 *
 * Top-level list of the user's validation pages. One card per page showing:
 *   - Status badge (DRAFT / LIVE / ARCHIVED)
 *   - Recommendation path as the title
 *   - Slug + last updated
 *   - Latest snapshot signal strength (when available)
 *   - Whether a committed build brief has been produced
 *
 * Clicking a card opens the preview/detail at /discovery/validation/[pageId].
 */
export default async function ValidationDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const pages = await prisma.validationPage.findMany({
    where:   { userId },
    orderBy: { updatedAt: 'desc' },
    take:    50,
    select: {
      id:                true,
      slug:              true,
      status:            true,
      updatedAt:         true,
      publishedAt:       true,
      channelsCompleted: true,
      recommendation:    { select: { path: true } },
      report:            { select: { signalStrength: true, generatedAt: true } },
      snapshots: {
        orderBy: { takenAt: 'desc' },
        take:    1,
        select: {
          visitorCount:  true,
          interpretation: true,
        },
      },
    },
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10 flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Validation Pages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Landing pages you've built to test your ideas with real users.
          </p>
        </div>

        {pages.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              You haven't built a validation page yet.
            </p>
            <Link
              href="/discovery/recommendations"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              Start from a recommendation →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pages.map(page => {
              const interp      = page.snapshots[0]?.interpretation as { signalStrength?: string } | null | undefined;
              const visitorCount = page.snapshots[0]?.visitorCount ?? 0;
              const hasReport    = !!page.report;
              const signal       = page.report?.signalStrength ?? interp?.signalStrength ?? null;

              return (
                <Link
                  key={page.id}
                  href={`/discovery/validation/${page.id}`}
                  className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={page.status} />
                        {hasReport && page.report?.signalStrength !== 'negative' && (
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                            Build brief ready
                          </span>
                        )}
                        {hasReport && page.report?.signalStrength === 'negative' && (
                          <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-600 dark:text-red-400">
                            Market said no
                          </span>
                        )}
                      </div>
                      <h2 className="mt-2 text-sm font-semibold text-foreground leading-snug truncate">
                        {page.recommendation?.path ?? 'Untitled validation page'}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground truncate">/lp/{page.slug}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{visitorCount} visitor{visitorCount === 1 ? '' : 's'}</span>
                    {signal && <span>signal: {signal}</span>}
                    {page.status === 'LIVE' && (
                      <span>{page.channelsCompleted.length} channel{page.channelsCompleted.length === 1 ? '' : 's'} shared</span>
                    )}
                    <span>updated {formatRelative(page.updatedAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT:    'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    LIVE:     'bg-green-500/10 text-green-600 dark:text-green-400',
    ARCHIVED: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${styles[status] ?? styles.DRAFT}`}>
      {status.toLowerCase()}
    </span>
  );
}

function formatRelative(date: Date): string {
  const ms = Date.now() - date.getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1)  return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)  return `${days}d ago`;
  return date.toLocaleDateString();
}
