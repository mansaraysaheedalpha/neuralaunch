'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PainInventoryDocument } from '@/lib/ideation/stage3-opportunities/schema';
import { ShortlistView } from './ShortlistView';

interface PainInventoryDocumentViewProps {
  stageRunId: string;
  sessionId:  string;
  status:     'output_ready' | 'committed';
  document:   PainInventoryDocument;
}

/**
 * Review-mode surface for the PainInventoryDocument — the artifact
 * the founder commits to advance into Stage 4.
 *
 * Affordances:
 *   - Save and come back (router back)
 *   - I'm ready for Stage 4 (commit + refresh)
 *
 * Per-pain-point editing happens on the chat surface, not here —
 * an output_ready row goes back to authoring only via an explicit
 * upstream /edit. Stage 3 itself doesn't have an /edit route in this
 * batch.
 */
export function PainInventoryDocumentView({
  stageRunId,
  sessionId,
  status,
  document,
}: PainInventoryDocumentViewProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCommit = () => {
    startTransition(async () => {
      setActionError(null);
      const res = await fetch(`/api/ideation/stage-runs/${stageRunId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setActionError(data.error ?? `Could not commit (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <header>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              {status === 'committed' ? 'Committed' : 'Pre-commit review'} · Pain Inventory
            </p>
            <h1 className="text-2xl font-semibold text-foreground">
              Your pain inventory — Stage 3 of 5
            </h1>
          </header>

          <ShortlistView document={document} />

          {document.recommendedActions.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-foreground mb-2">Recommended actions</h2>
              <ul className="space-y-2">
                {document.recommendedActions.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-border bg-card/30 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span className={
                        a.severity === 'strongly_advised'
                          ? 'text-gold font-medium'
                          : 'text-muted-foreground'
                      }>
                        {a.severity === 'strongly_advised' ? 'Strongly advised' : 'Suggested'}
                      </span>
                      <span>·</span>
                      <span>{a.status}</span>
                    </div>
                    <div className="text-foreground">{a.action}</div>
                    {a.founderResponse && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        You said: {a.founderResponse}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actionError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {actionError}
            </div>
          )}

          <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <Button
              variant="ghost"
              onClick={() => router.push('/discovery')}
              disabled={busy}
            >
              Save and come back
            </Button>
            {status === 'output_ready' ? (
              <Button onClick={handleCommit} disabled={busy} className="ml-auto">
                I&apos;m ready for Stage 4
                <ArrowRight className="size-4 ml-1" />
              </Button>
            ) : (
              <span className="ml-auto text-sm text-muted-foreground">Committed · Stage 4 coming soon</span>
            )}
          </footer>

          <span className="hidden" data-session-id={sessionId} />
        </div>
      </div>
    </div>
  );
}
