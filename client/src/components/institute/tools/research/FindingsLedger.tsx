'use client';
// src/components/institute/tools/research/FindingsLedger.tsx
//
// Right-column container for the completed-research output:
// synthesis header → confidence summary → grouped findings → output
// actions. Engine returns a flat findings list (no sub-question
// grouping today — see PR 15-Research notes), so this component
// renders a single unlabelled group. If the engine starts emitting
// sub-question structure later, switch on a new optional field.

import { useState, useCallback } from 'react';
import { ArrowRight, ClipboardCheck, Copy, Loader2 } from 'lucide-react';
import type { ResearchReport, ResearchFinding } from '@/lib/roadmap/research-tool/schemas';
import { ConfidenceSummary } from './ConfidenceSummary';
import { FindingRow } from './FindingRow';

export interface FindingsLedgerProps {
  query:           string;
  report:          ResearchReport;
  /** Approximate step count animated during execution — surfaced in the
   *  synthesis stamp row as "Completed in ~N steps". */
  stepCount?:      number;
  /** Optional: when the founder launched from a task, show "Attach to task". */
  taskScoped?:     boolean;
  /** Save the current findings to the venture (persisted server-side
   *  on accept of the research execute job — this CTA is a no-op
   *  acknowledgement today, just emphasis the founder already won). */
  onSaveToVenture?: () => void;
  /** Attach to task is a no-op acknowledgement: the route already
   *  persisted the session against the task on accept. The CTA tells
   *  the founder they're done. */
  onAttachToTask?:  () => void;
}

export function FindingsLedger({
  query,
  report,
  stepCount,
  taskScoped,
  onSaveToVenture,
  onAttachToTask,
}: FindingsLedgerProps) {
  const { findings, summary, sources } = report;
  const verified   = findings.filter(f => f.confidence === 'verified').length;
  const likely     = findings.filter(f => f.confidence === 'likely').length;
  const unverified = findings.filter(f => f.confidence === 'unverified').length;

  const [copied, setCopied] = useState(false);
  const handleCopyBrief = useCallback(() => {
    const md = serialiseReportToMarkdown(query, report);
    void (async () => {
      try {
        await navigator.clipboard.writeText(md);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch { /* clipboard blocked — silent */ }
    })();
  }, [query, report]);

  return (
    <div className="flex flex-col gap-7">
      {/* Synthesis header */}
      <header className="flex flex-col gap-3.5 border-b border-rule pb-6">
        <div className="flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          <span>Synthesis</span>
          <span>{sources.length} sources · {findings.length} findings</span>
          {stepCount != null && (
            <span className="text-accent">Completed in ~{stepCount} steps</span>
          )}
        </div>
        <h2 className="max-w-[680px] font-serif text-[26px] italic leading-[1.25] text-fg [&_em]:not-italic [&_em]:font-normal [&_em]:text-accent">
          {summary}
        </h2>
        {unverified > 0 && (
          <p className="text-[14px] leading-[1.55] text-fg-2 [&_b]:font-medium [&_b]:text-fg">
            <b>{unverified} of {findings.length} findings are unverified</b> and flagged below.
          </p>
        )}
      </header>

      {/* Confidence summary */}
      <ConfidenceSummary verified={verified} likely={likely} unverified={unverified} />

      {/* Findings — flat list (engine returns no sub-question structure
          today). Header is a generic stamp; switch to per-group headers
          once the engine emits sub-question grouping. */}
      {findings.length > 0 && (
        <section className="flex flex-col gap-0">
          <p className="mb-2 border-b border-rule-strong pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <span className="font-serif italic text-accent">i.</span>{' '}
            Findings · cited
          </p>
          <ul className="flex flex-col">
            {findings.map((f: ResearchFinding, i: number) => (
              <FindingRow key={i} finding={f} />
            ))}
          </ul>
        </section>
      )}

      {/* Output actions */}
      <footer className="flex flex-wrap items-center gap-3 border-t border-rule pt-6">
        {onSaveToVenture && (
          <button
            type="button"
            onClick={onSaveToVenture}
            className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5"
          >
            Save to venture
            <ArrowRight aria-hidden="true" className="size-3" />
          </button>
        )}
        <button
          type="button"
          onClick={handleCopyBrief}
          className="inline-flex items-center gap-2 border border-rule-strong px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
        >
          {copied
            ? <><ClipboardCheck aria-hidden="true" className="size-3 text-success" />Copied</>
            : <><Copy aria-hidden="true" className="size-3" />Copy as brief</>}
        </button>
        {taskScoped && onAttachToTask && (
          <button
            type="button"
            onClick={onAttachToTask}
            className="inline-flex items-center gap-2 border border-rule-strong px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
          >
            Attach to task
          </button>
        )}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Findings persist to this session
        </span>
      </footer>
    </div>
  );
}

/* ---- helpers ---- */

export interface InFlightHeroProps { stepCount: number; runningSeconds: number }

/**
 * Tiny mid-job indicator the page can drop into the right column
 * before the report lands — used as a fallback when the founder
 * doesn't want a skeleton or empty state mid-run.
 */
export function InFlightHero({ stepCount, runningSeconds }: InFlightHeroProps) {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed border-rule-strong px-8 py-14 text-center">
      <Loader2 aria-hidden="true" className="size-5 text-accent animate-spin" />
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Working… · step {stepCount} / ~25
      </p>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {Math.floor(runningSeconds / 60)}m {String(runningSeconds % 60).padStart(2, '0')}s elapsed
      </p>
    </div>
  );
}

function serialiseReportToMarkdown(query: string, report: ResearchReport): string {
  const lines: string[] = [];
  lines.push(`# Research · ${query}`);
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  if (report.findings.length > 0) {
    lines.push('## Findings');
    for (const f of report.findings) {
      lines.push(`- **${f.title}** _(${f.type} · ${f.confidence})_`);
      lines.push(`  ${f.description}`);
      if (f.sourceUrl) lines.push(`  Source: ${f.sourceUrl}`);
    }
    lines.push('');
  }
  if (report.sources.length > 0) {
    lines.push('## Sources');
    for (const s of report.sources) {
      lines.push(`- [${s.title}](${s.url}) — ${s.relevance}`);
    }
    lines.push('');
  }
  if (report.roadmapConnections) {
    lines.push('## Roadmap connections');
    lines.push(report.roadmapConnections);
    lines.push('');
  }
  return lines.join('\n');
}
