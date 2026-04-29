// src/app/admin/stories/[reportId]/page.tsx
//
// Per-report admin review surface. Server component fetches the
// report + venture + redacted-content preview; client component
// renders the editable cardSummary form, outcome chip picker,
// review-notes input, and the three action buttons (Approve,
// Send back, Decline).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getAdminSession } from '@/lib/auth/admin';
import prisma from '@/lib/prisma';
import {
  safeParseTransformationReport,
  safeParseCardSummary,
  RedactionCandidatesArraySchema,
  RedactionEditsSchema,
  deriveCardSummary,
  type TransformationCardSummary,
  type OutcomeLabel,
} from '@/lib/transformation';
import { applyRedactionEdits } from '@/lib/transformation/redaction';
import { AdminReviewForm } from './AdminReviewForm';

export const metadata = {
  title: 'Review story — NeuraLaunch admin',
  robots: { index: false, follow: false },
};

export default async function AdminReviewPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin) notFound();

  const { reportId } = await params;
  const row = await prisma.transformationReport.findUnique({
    where: { id: reportId },
    select: {
      id:                  true,
      stage:               true,
      publishState:        true,
      content:             true,
      redactionCandidates: true,
      redactionEdits:      true,
      cardSummary:         true,
      outcomeLabel:        true,
      reviewNotes:         true,
      reviewedAt:          true,
      publishedAt:         true,
      publicSlug:          true,
      venture:             { select: { id: true, name: true, status: true } },
    },
  });
  if (!row) notFound();

  const parsedContent = safeParseTransformationReport(row.content);
  if (!parsedContent || row.stage !== 'complete') {
    return (
      <div className="min-h-screen bg-navy-950 text-slate-50">
        <main className="mx-auto max-w-3xl px-6 py-12">
          <Link href="/admin/stories" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
            <ArrowLeft className="size-4" />
            Back to queue
          </Link>
          <p className="mt-8 text-sm text-amber-400">
            Report is not ready for review (stage = {row.stage}). It may still be generating, or its content failed to parse.
          </p>
        </main>
      </div>
    );
  }

  // Apply the founder's redaction edits server-side so the review
  // surface shows EXACTLY what the public version will read like.
  const candidates = row.redactionCandidates
    ? RedactionCandidatesArraySchema.safeParse(row.redactionCandidates)
    : null;
  const edits = row.redactionEdits
    ? RedactionEditsSchema.safeParse(row.redactionEdits)
    : null;
  const redactedContent = candidates?.success && edits?.success
    ? applyRedactionEdits(parsedContent, candidates.data, edits.data)
    : parsedContent;

  // Seed the review form with the founder-saved cardSummary if
  // present, otherwise auto-derive from the redacted content.
  // Subsequent edits in the form land on the same row.
  const seededCardSummary: TransformationCardSummary =
    safeParseCardSummary(row.cardSummary) ?? deriveCardSummary(redactedContent);
  const seededOutcome: OutcomeLabel = (row.outcomeLabel as OutcomeLabel | null) ?? 'learning';

  return (
    <div className="min-h-screen bg-navy-950 text-slate-50">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link
          href="/admin/stories"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="size-4" />
          Back to queue
        </Link>

        <header className="mt-6 flex flex-col gap-1.5">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">
            Admin · Review
          </p>
          <h1 className="text-2xl font-bold">{row.venture.name}</h1>
          <p className="text-xs text-slate-400">
            Current state: <span className="text-slate-300">{row.publishState}</span>
            {row.publishedAt && (
              <> · published {row.publishedAt.toLocaleString()}</>
            )}
            {row.publicSlug && (
              <> · slug <span className="font-mono text-slate-300">{row.publicSlug}</span></>
            )}
          </p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          {/* Left column — the redacted-content preview, exactly
              as a public reader would see it. Read-only. */}
          <section className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-navy-900/40 px-6 py-5">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Redacted preview (what readers will see)
            </h2>
            <PreviewSection title="Where they started" body={redactedContent.startingPoint} />
            <PreviewSection title="The real thing they were stuck on" body={redactedContent.centralChallenge} />
            <PreviewSection title="What they learned" body={redactedContent.whatYouLearned} />
            <PreviewSection title="What they built" body={redactedContent.whatYouBuilt} />
            <PreviewSection title="Honest struggles" body={redactedContent.honestStruggles} />
            <PreviewSection title="Where they are now" body={redactedContent.endingPoint} />
            <PreviewSection title="Closing reflection" body={redactedContent.closingReflection} />
          </section>

          {/* Right column — the action form. Client component for
              the inputs + submit handling. */}
          <AdminReviewForm
            reportId={row.id}
            ventureName={row.venture.name}
            currentPublishState={row.publishState}
            initialCardSummary={seededCardSummary}
            initialOutcome={seededOutcome}
            initialReviewNotes={row.reviewNotes ?? ''}
          />
        </div>
      </main>
    </div>
  );
}

function PreviewSection({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{title}</p>
      <p className="text-[13px] leading-relaxed text-slate-200 whitespace-pre-wrap">{body}</p>
    </div>
  );
}
