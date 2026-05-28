// src/app/(app)/discovery/stuck/[sessionId]/page.tsx
//
// Placeholder shell — PR 09 builds the bespoke Stuck diagnostic
// interview here. Until then, this surface acknowledges the session
// the picker just created and lets the founder either keep going via
// the standard pipeline or back out to the picker. The DB session
// row + Redis state already exist (created by /discovery/stuck), so
// PR 09 can wire the real diagnostic without re-touching the
// archetype picker.

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';

interface StuckPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function StuckPlaceholderPage({ params }: StuckPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  const userId = session.user.id;

  const { sessionId } = await params;
  // Ownership scope — single-query findFirst per CLAUDE.md security
  // rule. A bad sessionId or one belonging to a different user resolves
  // to notFound() rather than leaking 401 vs 404.
  const row = await prisma.discoverySession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!row) notFound();

  return (
    <div className="mx-auto flex min-h-[80dvh] w-full max-w-[760px] flex-col justify-center px-6 py-16 sm:px-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        Stuck · Pipeline in design
      </p>
      <h1 className="mt-7 font-sans text-[clamp(34px,4.4vw,60px)] font-medium leading-[1] tracking-[-0.025em] text-fg">
        Your session is{' '}
        <em className="font-serif italic font-normal text-accent">
          saved.
        </em>
      </h1>
      <p className="mt-7 max-w-[560px] text-[16px] leading-[1.55] text-fg-2">
        The bespoke diagnostic interview for founders mid-stall is being
        built — it ships in a later release. In the meantime we have your
        situation captured, and you can either take the standard
        discovery path now (we&rsquo;ll preseed it as a stuck-founder
        interview) or come back when the diagnostic lands.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link
          href="/discovery/standard?archetype=builder"
          className="inline-flex items-center gap-3 bg-accent px-5 py-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5"
        >
          Take the standard path
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
        <Link
          href="/discovery"
          className="inline-flex items-center gap-2 border border-rule-strong px-5 py-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Back to picker
        </Link>
      </div>
      <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Session id · <span className="text-fg-2">{row.id.slice(0, 8)}</span>
      </p>
    </div>
  );
}
