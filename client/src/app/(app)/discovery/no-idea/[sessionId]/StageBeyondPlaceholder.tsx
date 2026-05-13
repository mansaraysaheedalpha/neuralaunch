import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface StageBeyondPlaceholderProps {
  stageNumber: number;
}

/**
 * Renders when the founder has committed past Stage 2 — Stages 3..5
 * are not yet implemented. Surfaces a clear "coming soon" message so
 * the page never appears broken, and offers a path back to the
 * recommendations / ventures list so the founder is not stranded.
 *
 * TODO(copy): the body text below was written before Stage 2 landed
 * and still references "Outcome Document" (Stage 1's artifact).
 * Update to reference the Stage 2 RequirementsDocument when copy
 * is refreshed.
 */
export function StageBeyondPlaceholder({ stageNumber }: StageBeyondPlaceholderProps) {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Stage {stageNumber} of 5
          </p>
          <h2 className="text-xl font-semibold text-foreground mb-3">
            We&apos;re still building this stage
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            You&apos;ve committed everything available so far. The remaining stages — where
            we surface real-world pain points and evaluate which ones you can credibly go
            after — are under construction. We&apos;ll email you the moment they&apos;re live.
          </p>
          <Button asChild variant="secondary">
            <Link href="/discovery/recommendations">Return to your ventures</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
