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
          {recommendations.map(rec => (
            <li key={rec.id}>
              <Link
                href={`/discovery/recommendations/${rec.id}`}
                className="flex flex-col gap-1 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium text-foreground leading-snug">{rec.path}</span>
                <span className="text-xs text-muted-foreground">
                  {rec.createdAt.toLocaleDateString(undefined, {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
