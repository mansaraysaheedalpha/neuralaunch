'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchSessionReview.tsx
//
// Persistent expanded view of a completed Research session on the
// task card. Surfaces every field the report carries — summary,
// findings, sources, roadmap connections, suggested next steps,
// plan, follow-ups — instead of the prior shape which only rendered
// summary + a finding-type pill row and silently dropped the rest.
//
// Defensive fallback: if the strict Zod parse fails (schema drift,
// half-written session, legacy row), the component falls back to
// permissive reads of the raw session JSON for the key fields. The
// prior "if parse failed → render nothing" path was leaving the
// expanded panel literally empty, which made completed research
// look like a dead UI to the founder.

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown,
  Search,
  ExternalLink,
  Globe,
  Compass,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { safeParseResearchSession } from '@/lib/roadmap/research-tool/schemas';

export interface ResearchSessionReviewProps {
  /** The researchSession from the task, typed broadly so the caller
   *  can pass the raw JSON field without a cast. */
  session:    Record<string, unknown>;
  /**
   * Optional callback to reopen the full ResearchFlow surface so the
   * founder can run a follow-up round or revisit the rich report. The
   * sessionId arg is read off the session and forwarded so the parent
   * can hydrate the flow against the existing report (rather than
   * mounting a fresh blank query input — which is what the prior
   * shape did, making the button misleading).
   */
  onReopen?:  (sessionId: string) => void;
}

const MAX_VISIBLE_FINDINGS = 5;
const MAX_VISIBLE_SOURCES  = 3;

/** Permissive read for fallback when the strict parse fails — pulls
 *  the most-useful fields off the raw JSON without crashing on shape
 *  drift. Returns sensible defaults so the render never has to
 *  branch on undefined. */
function permissiveRead(raw: Record<string, unknown>) {
  const query = typeof raw.query === 'string' ? raw.query : 'Research session';
  const plan  = typeof raw.plan  === 'string' ? raw.plan  : undefined;
  const report = (raw.report && typeof raw.report === 'object')
    ? raw.report as Record<string, unknown>
    : undefined;
  const summary = report && typeof report.summary === 'string' ? report.summary : undefined;
  const findings = report && Array.isArray(report.findings) ? report.findings : [];
  const sources  = report && Array.isArray(report.sources)  ? report.sources  : [];
  const roadmapConnections = report && typeof report.roadmapConnections === 'string'
    ? report.roadmapConnections
    : undefined;
  const suggestedNextSteps = report && Array.isArray(report.suggestedNextSteps)
    ? report.suggestedNextSteps
    : [];
  const followUps = Array.isArray(raw.followUps) ? raw.followUps : [];
  return {
    query, plan, summary, findings, sources,
    roadmapConnections, suggestedNextSteps, followUps,
  };
}

/** Confidence pill colour mapping — matches the Research Tool's own
 *  verified / likely / unverified language used in the marketing card. */
function confidenceClass(confidence: string | undefined): string {
  if (confidence === 'verified')   return 'bg-success/15 text-success border-success/30';
  if (confidence === 'likely')     return 'bg-gold/15 text-gold border-gold/30';
  if (confidence === 'unverified') return 'bg-muted text-muted-foreground border-border';
  return 'bg-muted text-muted-foreground border-border';
}

export function ResearchSessionReview({ session, onReopen }: ResearchSessionReviewProps) {
  const [expanded, setExpanded] = useState(false);

  // Try strict parse first; fall back to permissive read if the schema
  // rejects it. This way the founder always sees what the agent actually
  // produced even when the shape drifts (e.g. legacy session, partial
  // report, transient mid-write).
  const strict = safeParseResearchSession(session);
  const fallback = permissiveRead(session);

  const sessionId          = strict?.id ?? (typeof session.id === 'string' ? session.id : undefined);
  const query              = strict?.query                                ?? fallback.query;
  const plan               = strict?.plan                                 ?? fallback.plan;
  const summary            = strict?.report?.summary                      ?? fallback.summary;
  const strictFindings     = strict?.report?.findings;
  const findings           = strictFindings ?? (fallback.findings as Array<Record<string, unknown>>);
  const strictSources      = strict?.report?.sources;
  const sources            = strictSources ?? (fallback.sources as Array<Record<string, unknown>>);
  const roadmapConnections = strict?.report?.roadmapConnections           ?? fallback.roadmapConnections;
  const suggestedNextSteps = strict?.report?.suggestedNextSteps
                          ?? (fallback.suggestedNextSteps as Array<Record<string, unknown>>);
  const followUps          = strict?.followUps
                          ?? (fallback.followUps as Array<Record<string, unknown>>);

  const totalFindingsAcrossRounds =
    findings.length
    + followUps.reduce((acc, fu) => {
        const fus = (fu as { findings?: unknown }).findings;
        return acc + (Array.isArray(fus) ? fus.length : 0);
      }, 0);

  const hasReport = Boolean(summary || findings.length > 0 || sources.length > 0);
  const hasAnyContent = hasReport || plan || followUps.length > 0;

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      {/* Collapsed header — always visible. Counts the total findings
          across every round so the founder sees the cumulative result
          at a glance. */}
      <button
        type="button"
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Search className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-[11px] font-semibold text-foreground truncate">
              Researched: {query}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {totalFindingsAcrossRounds} finding{totalFindingsAcrossRounds !== 1 ? 's' : ''}
              {followUps.length > 0 && ` · ${followUps.length} follow-up${followUps.length !== 1 ? 's' : ''}`}
              {sources.length > 0 && ` · ${sources.length} source${sources.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0 ml-2" />
        </motion.span>
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-border flex flex-col gap-3">

              {/* SUMMARY — almost always present when research completed */}
              {summary && (
                <div className="pt-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold mb-1">
                    Summary
                  </p>
                  <p className="text-[11.5px] text-foreground/90 leading-[1.55] whitespace-pre-wrap">
                    {summary}
                  </p>
                </div>
              )}

              {/* FINDINGS — list with title + type + confidence pill +
                  source link. Cap at MAX_VISIBLE_FINDINGS with a "+N more"
                  affordance so a 20-finding session doesn't dominate the
                  task card. */}
              {findings.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                    Findings ({findings.length})
                  </p>
                  <ul role="list" className="flex flex-col gap-1.5">
                    {findings.slice(0, MAX_VISIBLE_FINDINGS).map((f, i) => {
                      const finding = f as {
                        title?:      string;
                        type?:       string;
                        confidence?: string;
                        sourceUrl?:  string;
                        location?:   string;
                      };
                      return (
                        <li
                          key={i}
                          className="flex items-start gap-2 rounded-md border border-border/60 bg-card/60 px-2.5 py-2"
                        >
                          <CheckCircle2 className="size-3 text-success/80 shrink-0 mt-0.5" />
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-[11px] font-medium text-foreground leading-snug truncate">
                                {finding.title ?? `Finding ${i + 1}`}
                              </p>
                              {finding.confidence && (
                                <span className={`text-[9px] uppercase tracking-wider rounded-full border px-1.5 py-px ${confidenceClass(finding.confidence)}`}>
                                  {finding.confidence}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {finding.type && (
                                <span className="capitalize">{finding.type}</span>
                              )}
                              {finding.location && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span className="truncate">{finding.location}</span>
                                </>
                              )}
                              {finding.sourceUrl && (
                                <a
                                  href={finding.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="ml-auto inline-flex items-center gap-0.5 text-primary/80 hover:text-primary"
                                >
                                  source
                                  <ExternalLink className="size-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {findings.length > MAX_VISIBLE_FINDINGS && (
                    <p className="text-[10px] text-muted-foreground/70 italic mt-1.5">
                      +{findings.length - MAX_VISIBLE_FINDINGS} more — open the full session to review them.
                    </p>
                  )}
                </div>
              )}

              {/* SUGGESTED NEXT STEPS — read-only render of the agent's
                  recommended actions. Cross-tool handoff hints are
                  surfaced as a small chip beneath each step. */}
              {suggestedNextSteps.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary mb-1.5">
                    Suggested next steps
                  </p>
                  <ul role="list" className="flex flex-col gap-1.5">
                    {suggestedNextSteps.map((s, i) => {
                      const step = s as {
                        action?:        string;
                        suggestedTool?: string;
                      };
                      return (
                        <li key={i} className="flex items-start gap-2 text-[11px] text-foreground/85 leading-snug">
                          <ArrowRight className="size-3 text-primary/80 shrink-0 mt-0.5" />
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <span>{step.action ?? `Step ${i + 1}`}</span>
                            {step.suggestedTool && (
                              <span className="self-start text-[9px] uppercase tracking-wider rounded-full border border-primary/30 bg-primary/5 text-primary px-1.5 py-px">
                                Open {step.suggestedTool.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* ROADMAP CONNECTIONS — the agent's narrative on how
                  these findings connect back to the founder's roadmap. */}
              {roadmapConnections && (
                <div className="pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1 inline-flex items-center gap-1.5">
                    <Compass className="size-2.5" />
                    Roadmap connections
                  </p>
                  <p className="text-[11px] italic text-foreground/85 leading-relaxed whitespace-pre-wrap">
                    {roadmapConnections}
                  </p>
                </div>
              )}

              {/* SOURCES — a compact list of the sources the agent
                  cited. First MAX_VISIBLE_SOURCES with link icons; the
                  rest collapse to a count line. */}
              {sources.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5 inline-flex items-center gap-1.5">
                    <Globe className="size-2.5" />
                    Sources ({sources.length})
                  </p>
                  <ul role="list" className="flex flex-col gap-1">
                    {sources.slice(0, MAX_VISIBLE_SOURCES).map((s, i) => {
                      const source = s as { title?: string; url?: string };
                      return (
                        <li key={i} className="flex items-center gap-1.5 text-[10.5px]">
                          <ExternalLink className="size-2.5 text-muted-foreground/70 shrink-0" />
                          {source.url ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-primary/80 hover:text-primary truncate"
                            >
                              {source.title ?? source.url}
                            </a>
                          ) : (
                            <span className="text-muted-foreground truncate">
                              {source.title ?? 'source'}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {sources.length > MAX_VISIBLE_SOURCES && (
                    <p className="text-[10px] text-muted-foreground/70 italic mt-1">
                      +{sources.length - MAX_VISIBLE_SOURCES} more sources
                    </p>
                  )}
                </div>
              )}

              {/* PLAN — what the agent set out to do. Useful especially
                  when no report yet exists (research is still in flight
                  or mid-completion). */}
              {plan && !hasReport && (
                <div className="pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1">
                    Research plan
                  </p>
                  <p className="text-[11px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
                    {plan}
                  </p>
                </div>
              )}

              {/* FOLLOW-UP ROUNDS — quick summary so the founder can
                  see "I asked for X follow-ups and got Y total findings
                  out of them". */}
              {followUps.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                    Follow-up rounds ({followUps.length})
                  </p>
                  <ul role="list" className="flex flex-col gap-1">
                    {followUps.map((fu, i) => {
                      const followUp = fu as {
                        query?:    string;
                        round?:    number;
                        findings?: unknown[];
                      };
                      return (
                        <li key={i} className="text-[10.5px] text-foreground/80 leading-snug truncate">
                          <span className="font-mono text-muted-foreground/70">R{followUp.round ?? i + 1}:</span>{' '}
                          {followUp.query ?? 'Follow-up query'}
                          {Array.isArray(followUp.findings) && (
                            <span className="text-muted-foreground"> · {followUp.findings.length} finding{followUp.findings.length !== 1 ? 's' : ''}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* EMPTY-STATE FALLBACK — when the report exists but
                  carries no useful data (zero findings AND no summary
                  AND no roadmap connection AND no suggestions), surface
                  an explicit "no results" message so the panel never
                  renders as a literal empty box. */}
              {!hasAnyContent && (
                <div className="pt-2.5 flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-gold/80" />
                  <span>
                    The research session completed but produced no findings.
                    The query may have been too narrow, or no public
                    information matched. Try reopening and refining the query.
                  </span>
                </div>
              )}

              {/* REOPEN BUTTON — surfaced when the parent provides an
                  onReopen callback AND the session id is recoverable
                  from the persisted session. Forwards the session id
                  so the parent can hydrate the live flow against the
                  existing report (rather than mounting a blank query
                  input — which is what the prior shape did and the
                  reason the button felt broken). */}
              {onReopen && sessionId && (
                <button
                  type="button"
                  onClick={() => onReopen(sessionId)}
                  className="self-start mt-1 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-foreground/85 hover:bg-primary/10 hover:text-foreground transition-colors"
                >
                  <Search className="size-3 text-primary" />
                  Reopen full session
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
