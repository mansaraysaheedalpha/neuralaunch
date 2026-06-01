'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
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
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Verdict · agent + founder
        </p>
        <p className="max-w-[680px] text-[13px] leading-[1.55] text-fg-2">
          We read Layer A + Layer B and offer a verdict; your call is what advances to Stage 5.
        </p>
      </header>

      <div className="border border-rule bg-bg px-4 py-3.5">
        <header className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-2">
            Agent says
          </p>
          {!readOnly && hasAgentVerdict && onPushback && (
            <button
              type="button"
              onClick={() => setPushbackOpen(o => !o)}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              <MessageSquare aria-hidden="true" className="size-3" />
              {pushbackOpen ? 'Hide pushback' : 'Push back'}
            </button>
          )}
        </header>
        {hasAgentVerdict ? (
          <>
            <div className="mb-2">
              <span className="border border-accent px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                {opportunity.agentVerdict}
              </span>
            </div>
            <p className="text-[13.5px] leading-[1.6] text-fg">{opportunity.agentReasoning}</p>
          </>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            No agent verdict yet · bring back at least one community response and we&rsquo;ll read the signal.
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
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Your call
        </p>
        {!readOnly && onPickVerdict ? (
          <VerdictPicker
            current={opportunity.founderVerdict}
            onPick={onPickVerdict}
          />
        ) : (
          <p className="text-[13.5px] text-fg">{opportunity.founderVerdict ?? 'Not set'}</p>
        )}
      </div>
    </section>
  );
}
