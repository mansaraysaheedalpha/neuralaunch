'use client';

import type { RecommendedAction } from '@/lib/ideation';

interface RecommendedActionsSectionProps {
  actions: ReadonlyArray<RecommendedAction>;
}

/**
 * Read-only render of the founder's recommended-action log for a
 * committed Stage 2 document. Extracted from RequirementsDocumentView
 * to keep that file under the component cap.
 */
export function RecommendedActionsSection({ actions }: RecommendedActionsSectionProps) {
  if (actions.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-3">Recommended actions</h2>
      <ul className="space-y-2">
        {actions.map((a, i) => (
          <li key={i} className="rounded-lg border border-border bg-card/30 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className={a.severity === 'strongly_advised' ? 'text-gold font-medium' : 'text-muted-foreground'}>
                {a.severity === 'strongly_advised' ? 'Strongly advised' : 'Suggested'}
              </span>
              <span>·</span>
              <span>{a.status}</span>
            </div>
            <div className="text-foreground">{a.action}</div>
            {a.founderResponse && (
              <div className="mt-1 text-xs text-muted-foreground">You said: {a.founderResponse}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
