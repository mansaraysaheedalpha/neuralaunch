// src/app/(app)/discovery/no-idea/mindset/page.tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isNoIdeaEnabled } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { startNoIdeaSession } from './start-action';

/**
 * Stage 0 — Mindset.
 *
 * Fully static server component. No LLM, no Inngest, no streaming.
 * The "I'm ready, let's start" CTA invokes a server action that
 * creates the DiscoverySession + IdeationStageRun rows and redirects
 * to the Stage 1 surface.
 *
 * Guards:
 *   - Auth required (redirect to /signin)
 *   - Feature flag (redirect back to /discovery when off so the
 *     founder doesn't see an orphaned page)
 */
export default async function NoIdeaMindsetPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  if (!isNoIdeaEnabled())  redirect('/discovery');

  return (
    <div className="flex flex-col h-full bg-bg">
      <div className="flex-1 overflow-y-auto px-4 py-12">
        <div className="mx-auto w-full max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
            Stage 0 of 5 — Mindset
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-fg mb-3">
              What you&apos;re about to do
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              You&apos;ve said you want to start a business but you don&apos;t have an idea yet.
              Over the next five stages, we work that out together — not by handing you a
              generic playbook, but by figuring out what outcome would actually fit your life,
              what you&apos;re built to execute, where the real pain points are in the world,
              which of those you can credibly go after, and how to validate the most promising
              one. By the end you&apos;ll have one validated idea and a roadmap to start moving on it.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-fg mb-3">
              What this requires
            </h2>
            <ul className="space-y-3 text-sm text-muted leading-relaxed">
              <li>
                <span className="text-fg font-medium">Diligence.</span>{' '}
                There&apos;s homework. The agent will ask you to do real things in the real
                world — talk to people, observe your own life, write things down. Skipping
                those steps produces a hollow result.
              </li>
              <li>
                <span className="text-fg font-medium">Perseverance.</span>{' '}
                The first idea you commit to may not survive validation. That&apos;s the system
                working, not breaking. Coming back to pick the next one is part of the process.
              </li>
              <li>
                <span className="text-fg font-medium">Honesty.</span>{' '}
                You can mislead the agent — exaggerate your skills, ignore the trade-offs,
                pick a goal that doesn&apos;t fit your life — but you&apos;ll be building on
                top of the lies. Everything downstream gets worse.
              </li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-fg mb-3">
              What you&apos;ll have at the end
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              A ranked shortlist of five evaluated opportunities, one chosen and committed to,
              a validation roadmap for it, and a clear path forward whether validation passes
              or fails. This is not a generator that hands you an idea — it&apos;s a process
              that helps you arrive at one you can stand behind.
            </p>
          </section>

          <form action={startNoIdeaSession} className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg">
              I&apos;m ready, let&apos;s start
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/discovery">Not yet</Link>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
