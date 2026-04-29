// src/app/admin/stories/page.tsx
//
// Public-archive moderation queue. Admin-only (allow-list at
// lib/auth/admin.ts). Lists every TransformationReport row in
// `pending_review` ordered by oldest-first (so the queue is FIFO
// and a story doesn't sit forgotten while newer arrivals get
// reviewed). Each row links to /admin/stories/[reportId] for
// the review action.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAdminSession } from '@/lib/auth/admin';
import prisma from '@/lib/prisma';
import {
  safeParseTransformationReport,
  safeParseCardSummary,
} from '@/lib/transformation';

export const metadata = {
  title: 'Moderation queue — NeuraLaunch admin',
  robots: { index: false, follow: false },
};

const QUEUE_TAKE = 100;

export default async function AdminStoriesQueuePage() {
  const admin = await getAdminSession();
  if (!admin) {
    // Render a 404 rather than redirecting — admin surfaces should
    // be invisible to non-admins, no signal that the route exists.
    notFound();
  }

  const rows = await prisma.transformationReport.findMany({
    where: {
      publishState: { in: ['pending_review', 'private'] },
    },
    orderBy: [
      // Pending-review FIFO first (so backlogged stories don't
      // get buried). Private rows that have been reviewed
      // (sent-back) come after.
      { publishState: 'asc' },   // 'pending_review' < 'private' alphabetically
      { updatedAt:    'asc' },
    ],
    take: QUEUE_TAKE,
    select: {
      id:           true,
      stage:        true,
      publishState: true,
      content:      true,
      cardSummary:  true,
      reviewedAt:   true,
      reviewNotes:  true,
      updatedAt:    true,
      createdAt:    true,
      venture:      { select: { name: true, status: true } },
    },
  });

  // Surface only rows that have a parseable content payload — a
  // half-generated row should never reach moderation, but the
  // safety filter costs nothing.
  const queue = rows
    .map(r => ({
      ...r,
      parsedContent: safeParseTransformationReport(r.content),
      parsedCard:    safeParseCardSummary(r.cardSummary),
    }))
    .filter(r => r.parsedContent !== null && r.stage === 'complete');

  const pendingCount = queue.filter(r => r.publishState === 'pending_review').length;
  const sentBackCount = queue.filter(r => r.publishState === 'private').length;

  return (
    <div className="min-h-screen bg-navy-950 text-slate-50">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <header className="flex flex-col gap-1.5">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">
            Admin · Moderation
          </p>
          <h1 className="text-2xl font-bold">Public archive — review queue</h1>
          <p className="text-sm text-slate-400">
            Signed in as <span className="text-slate-300">{admin.email}</span>.
            {' '}<span className="text-success">{pendingCount} pending review</span>
            {' · '}<span className="text-amber-400">{sentBackCount} sent back</span>
          </p>
        </header>

        {queue.length === 0 ? (
          <p className="mt-12 rounded-xl border border-slate-800 bg-navy-900/40 px-6 py-10 text-center text-sm text-slate-400">
            Queue is empty. No founders have submitted stories for review.
          </p>
        ) : (
          <ul className="mt-10 flex flex-col gap-3">
            {queue.map(row => {
              const opening =
                row.parsedCard?.openingQuote
                ?? row.parsedContent?.centralChallenge
                ?? row.parsedContent?.startingPoint
                ?? '(no preview available)';
              const isSentBack = row.publishState === 'private';
              return (
                <li key={row.id}>
                  <Link
                    href={`/admin/stories/${row.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-navy-900/40 px-5 py-4 transition-colors hover:border-slate-700 hover:bg-navy-900/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className={[
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest',
                            isSentBack
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                              : 'border-success/40 bg-success/10 text-success',
                          ].join(' ')}>
                            {isSentBack ? 'Sent back' : 'Pending review'}
                          </span>
                          <p className="text-sm font-semibold text-foreground truncate">
                            {row.venture.name}
                          </p>
                        </div>
                        <p className="text-[12px] italic text-slate-300 line-clamp-2">
                          &ldquo;{opening}&rdquo;
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Last updated {row.updatedAt.toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                          {row.reviewedAt && (
                            <> · last reviewed {row.reviewedAt.toLocaleString(undefined, {
                              month: 'short', day: 'numeric',
                            })}</>
                          )}
                        </p>
                      </div>
                    </div>
                    {row.reviewNotes && isSentBack && (
                      <p className="text-[10px] text-amber-300/80 italic line-clamp-2">
                        Note left for founder: &ldquo;{row.reviewNotes}&rdquo;
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
