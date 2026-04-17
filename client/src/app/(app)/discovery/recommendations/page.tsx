// src/app/(app)/discovery/recommendations/page.tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { VentureCard } from './VentureCard';

/**
 * RecommendationsPage — venture-aware Sessions tab.
 *
 * When ventures exist (post-backfill), renders venture cards grouped
 * by status (active → paused → completed) with nested cycle lists.
 * When no ventures exist yet (pre-backfill), falls back to the flat
 * recommendation list so existing users see no regression.
 */
export default async function RecommendationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  // Load ventures with cycles + active roadmap progress
  const ventures = await prisma.venture.findMany({
    where:   { userId },
    orderBy: { updatedAt: 'desc' },
    take:    50,
    select: {
      id: true, name: true, status: true, currentCycleId: true,
      cycles: {
        orderBy: { cycleNumber: 'asc' },
        select: {
          id: true, cycleNumber: true, status: true,
          selectedForkSummary: true, roadmapId: true,
          createdAt: true, completedAt: true,
        },
      },
    },
  });

  // For active ventures, load the active roadmap's progress for the bar
  const progressMap = new Map<string, { completedTasks: number; totalTasks: number }>();
  if (ventures.length > 0) {
    const activeVentureIds = ventures.filter(v => v.status === 'active').map(v => v.id);
    if (activeVentureIds.length > 0) {
      const progresses = await prisma.roadmapProgress.findMany({
        where: { roadmap: { ventureId: { in: activeVentureIds } } },
        select: { roadmap: { select: { ventureId: true } }, completedTasks: true, totalTasks: true },
      });
      for (const p of progresses) {
        if (p.roadmap.ventureId) {
          progressMap.set(p.roadmap.ventureId, { completedTasks: p.completedTasks, totalTasks: p.totalTasks });
        }
      }
    }
  }

  const hasVentures = ventures.length > 0;

  // Fallback: flat recommendation list for pre-backfill users
  const recommendations = !hasVentures ? await prisma.recommendation.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    take:    50,
    select:  { id: true, path: true, createdAt: true, roadmap: { select: { status: true } } },
  }) : [];

  const active    = ventures.filter(v => v.status === 'active');
  const paused    = ventures.filter(v => v.status === 'paused');
  const completed = ventures.filter(v => v.status === 'completed');

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">
          {hasVentures ? 'Your ventures' : 'Past recommendations'}
        </h1>
        <Link
          href="/discovery"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Start new discovery →
        </Link>
      </div>

      {hasVentures ? (
        <>
          {/* Active ventures */}
          {active.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Active</h2>
              {active.map(v => (
                <VentureCard
                  key={v.id}
                  venture={{ ...v, cycles: v.cycles.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), completedAt: c.completedAt?.toISOString() ?? null })) }}
                  progress={progressMap.get(v.id) ?? null}
                />
              ))}
            </section>
          )}

          {/* Paused ventures */}
          {paused.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Paused</h2>
              {paused.map(v => (
                <VentureCard
                  key={v.id}
                  venture={{ ...v, cycles: v.cycles.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), completedAt: c.completedAt?.toISOString() ?? null })) }}
                  progress={null}
                />
              ))}
            </section>
          )}

          {/* Completed ventures */}
          {completed.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Completed</h2>
              {completed.map(v => (
                <VentureCard
                  key={v.id}
                  venture={{ ...v, cycles: v.cycles.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), completedAt: c.completedAt?.toISOString() ?? null })) }}
                  progress={null}
                />
              ))}
            </section>
          )}

          {active.length === 0 && paused.length === 0 && completed.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No ventures yet.{' '}
              <Link href="/discovery" className="underline underline-offset-2 hover:text-foreground">
                Start your first discovery interview.
              </Link>
            </p>
          )}
        </>
      ) : (
        /* Fallback: flat recommendation list (pre-backfill) */
        recommendations.length === 0 ? (
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
                  <Link href={`/discovery/recommendations/${rec.id}`} className="flex flex-col gap-1 p-4 hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium text-foreground leading-snug">{rec.path}</span>
                    <span className="text-xs text-muted-foreground">{rec.createdAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </Link>
                  {hasRoadmap && (
                    <Link href={`/discovery/roadmap/${rec.id}`} className="flex items-center gap-1.5 px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                      <span className="size-1.5 rounded-full bg-primary/60 shrink-0" /> View execution roadmap
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
