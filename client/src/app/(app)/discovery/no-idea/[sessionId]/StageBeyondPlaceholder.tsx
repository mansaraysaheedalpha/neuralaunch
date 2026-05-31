import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface StageBeyondPlaceholderProps {
  stageNumber: number;
}

/**
 * Renders when the founder has committed past Stage 4 — Stage 5 is
 * not yet implemented. Surfaces a clear "coming soon" message so
 * the page never appears broken, and offers a path back to the
 * recommendations / ventures list so the founder is not stranded.
 *
 * The threshold is `stageNumber >= 5` per page.tsx — Stage 4 has
 * its own surface as of Stage 4 batch commit #6.
 */
export function StageBeyondPlaceholder({ stageNumber }: StageBeyondPlaceholderProps) {
  return (
    <div className="flex flex-col h-full bg-bg">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted mb-3">
            Stage {stageNumber} of 5
          </p>
          <h2 className="text-xl font-semibold text-fg mb-3">
            We&apos;re still building this stage
          </h2>
          <p className="text-sm text-muted leading-relaxed mb-6">
            You&apos;ve committed everything available so far. The remaining stages — where
            we deepen each shortlisted pain into a concrete opportunity and hand off to
            execution — are still being built. You&apos;ll see them appear here the moment
            they ship.
          </p>
          <Button asChild variant="secondary">
            <Link href="/discovery/recommendations">Return to your ventures</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
