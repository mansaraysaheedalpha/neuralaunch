'use client';

import type { RecommendedAction } from '@/lib/ideation/stage1-outcome/schema';

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
      <h2 className="text-sm font-semibold text-fg mb-3">Recommended actions</h2>
      <ul className="space-y-2">
        {actions.map((a, i) => (
          <li key={i} className="rounded-lg border border-rule bg-bg-2/30 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted mb-1">
              <span className={a.severity === 'strongly_advised' ? 'text-accent font-medium' : 'text-muted'}>
                {a.severity === 'strongly_advised' ? 'Strongly advised' : 'Suggested'}
              </span>
              <span>·</span>
              <span>{a.status}</span>
            </div>
            <div className="text-fg">{a.action}</div>
            {a.founderResponse && (
              <div className="mt-1 text-xs text-muted">You said: {a.founderResponse}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
