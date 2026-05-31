'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OpportunityEvaluation } from '@/lib/ideation/stage4-opportunities/schema';
import type { OpportunityVerdict } from '@neuralaunch/constants';
import { VerdictPicker } from './VerdictPicker';
import { VerdictPushbackDrawer, type VerdictPushbackResult } from './VerdictPushbackDrawer';

export interface VerdictSectionProps {
  opportunity: OpportunityEvaluation;
  readOnly?:   boolean;
  onPickVerdict?: (verdict: OpportunityVerdict) => Promise<void>;
  onPushback?:    (input: { opportunityId: string; message: string; priorVersion: number }) => Promise<VerdictPushbackResult>;
}

/**
 * Per-opportunity verdict surface. Shows the agent's verdict + reasoning,
 * the founder's verdict picker, and a button to open the multi-round
 * pushback drawer against the agent's call.
 */
export function VerdictSection({ opportunity, readOnly, onPickVerdict, onPushback }: VerdictSectionProps) {
  const [pushbackOpen, setPushbackOpen] = useState(false);
  const hasAgentVerdict = opportunity.agentVerdict !== 'pending';

  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-semibold text-fg">Verdict</h3>
        <p className="text-xs text-muted mt-0.5">
          I read Layer A + Layer B and offer a verdict; your call is what advances to Stage 5.
        </p>
      </header>

      <div className="rounded-md border border-rule bg-bg-2/30 px-3 py-3">
        <header className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-fg">Agent says</span>
          {!readOnly && hasAgentVerdict && onPushback && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPushbackOpen(o => !o)}
            >
              <MessageSquare className="size-3 mr-1" />
              {pushbackOpen ? 'Hide pushback' : 'Push back'}
            </Button>
          )}
        </header>
        {hasAgentVerdict ? (
          <>
            <div className="text-sm text-fg mb-1">
              <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wider text-accent">
                {opportunity.agentVerdict}
              </span>
            </div>
            <p className="text-sm text-fg leading-relaxed">{opportunity.agentReasoning}</p>
          </>
        ) : (
          <p className="text-xs italic text-muted">
            No agent verdict yet. Once you bring back at least one community response, I&apos;ll read the signal and offer a call.
          </p>
        )}

        {pushbackOpen && onPushback && (
          <VerdictPushbackDrawer
            opportunity={opportunity}
            onPushback={onPushback}
            onClose={() => setPushbackOpen(false)}
          />
        )}
      </div>

      <div>
        <div className="text-xs text-muted mb-2">Your call:</div>
        {!readOnly && onPickVerdict ? (
          <VerdictPicker
            current={opportunity.founderVerdict}
            onPick={onPickVerdict}
          />
        ) : (
          <p className="text-sm text-fg">{opportunity.founderVerdict ?? 'Not set'}</p>
        )}
      </div>
    </section>
  );
}
