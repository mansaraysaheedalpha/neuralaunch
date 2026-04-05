// src/app/(app)/discovery/recommendations/page.tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';

/**
 * RecommendationsPage
 *
 * Server Component — lists all Recommendation records for the authenticated user,
 * newest first. Each item links to its detail view.
 */
export default async function RecommendationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const recommendations = await prisma.recommendation.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id:        true,
      path:      true,
      createdAt: true,
      roadmap:   { select: { status: true } },
    },
  });

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Past recommendations</h1>
        <Link
          href="/discovery"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          New discovery →
        </Link>
      </div>

      {recommendations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recommendations yet.{' '}
          <Link href="/discovery" className="underline underline-offset-2 hover:text-foreground">
            Start your first discovery interview.
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {recommendations.map(rec => {
            const hasRoadmap = rec.roadmap?.status === 'READY';
            return (
              <li key={rec.id} className="flex flex-col gap-0 rounded-lg border border-border overflow-hidden">
                <Link
                  href={`/discovery/recommendations/${rec.id}`}
                  className="flex flex-col gap-1 p-4 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground leading-snug">{rec.path}</span>
                  <span className="text-xs text-muted-foreground">
                    {rec.createdAt.toLocaleDateString(undefined, {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </span>
                </Link>
                {hasRoadmap && (
                  <Link
                    href={`/discovery/roadmap/${rec.id}`}
                    className="flex items-center gap-1.5 px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <span className="size-1.5 rounded-full bg-primary/60 shrink-0" />
                    View execution roadmap
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
