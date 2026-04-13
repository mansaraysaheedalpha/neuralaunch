'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchReportView.tsx
//
// Renders the full structured ResearchReport. Summary is prominent at
// the top. Findings render as typed cards. Sources are collapsible.
// Roadmap connections render as a highlighted callout. Suggested next
// steps render as action buttons.

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowRight, Link2 } from 'lucide-react';
import { ResearchFindingCard } from './ResearchFindingCard';
// Import directly from schemas, not the barrel.
import type { ResearchReport } from '@/lib/roadmap/research-tool/schemas';

const TOOL_HREF: Record<string, string> = {
  conversation_coach: '/tools/conversation-coach',
  outreach_composer:  '/tools/outreach-composer',
};

export interface ResearchReportViewProps {
  report:       ResearchReport;
  onFollowUp:   (query: string) => void;
}

/**
 * ResearchReportView
 *
 * Full report renderer. Summary → Findings → Roadmap connections →
 * Suggested next steps → Sources (collapsible).
 */
export function ResearchReportView({ report, onFollowUp: _onFollowUp }: ResearchReportViewProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      {/* Summary */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">Summary</p>
        <p className="text-sm text-foreground leading-relaxed">{report.summary}</p>
      </div>

      {/* Findings */}
      {report.findings.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-foreground">
            Findings ({report.findings.length})
          </p>
          <div className="flex flex-col gap-2">
            {report.findings.map((finding, i) => (
              <ResearchFindingCard key={i} finding={finding} />
            ))}
          </div>
        </div>
      )}

      {/* Roadmap connections */}
      {report.roadmapConnections && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex gap-2">
          <Link2 className="size-4 shrink-0 text-blue-500 mt-0.5" />
          <div className="flex flex-col gap-1">
            <p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">
              Connections to your roadmap
            </p>
            <p className="text-[11px] text-foreground/90 leading-relaxed">
              {report.roadmapConnections}
            </p>
          </div>
        </div>
      )}

      {/* Suggested next steps */}
      {report.suggestedNextSteps && report.suggestedNextSteps.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-foreground">Suggested next steps</p>
          <div className="flex flex-col gap-2">
            {report.suggestedNextSteps.map((step, i) => {
              const href = step.suggestedTool ? TOOL_HREF[step.suggestedTool] : null;
              return href ? (
                <a
                  key={i}
                  href={href}
                  className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  <ArrowRight className="size-3 shrink-0" />
                  {step.action}
                </a>
              ) : (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-foreground"
                >
                  <ArrowRight className="size-3 shrink-0 mt-0.5 text-muted-foreground" />
                  {step.action}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sources (collapsible) */}
      {report.sources.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setSourcesOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
          >
            <p className="text-[11px] font-semibold text-foreground">
              Sources ({report.sources.length})
            </p>
            <motion.span animate={{ rotate: sourcesOpen ? 180 : 0 }} transition={{ duration: 0.18 }}>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {sourcesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 px-3 pb-3 border-t border-border pt-2">
                  {report.sources.map((source, i) => (
                    <div key={i} className="flex flex-col gap-0.5">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-primary hover:underline break-all"
                      >
                        {source.title}
                      </a>
                      <p className="text-[10px] text-muted-foreground">{source.relevance}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
