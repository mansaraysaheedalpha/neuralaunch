// src/lib/transformation/evidence-loader.ts
//
// Server-only evidence-bundle loader for the Transformation Report
// engine. Reads everything that happened across a single venture's
// cycles — belief states, recommendations + pushback, every roadmap
// (phases / tasks / check-ins / tool sessions), CycleSummaries,
// FounderProfile, validation pages and signals, parking lot — and
// returns one structured object the engine renders into a prompt.
//
// Structured output > raw JSON dump — the renderer (in engine.ts)
// formats each section into prose-shaped prompt blocks so the
// model treats the evidence as story material, not config.

import 'server-only';
import prisma from '@/lib/prisma';
import { safeParseDiscoveryContext } from '@/lib/discovery/context-schema';
import { StoredPhasesArraySchema } from '@/lib/roadmap/checkin-types';
import { safeParseFounderProfile, type FounderProfile, type CycleSummary as PersistedCycleSummary } from '@/lib/lifecycle';

// ---------------------------------------------------------------------------
// The evidence bundle. Every field is shaped for direct rendering —
// the engine does no further DB work, just prose-formats this.
// ---------------------------------------------------------------------------

export interface VentureEvidenceBundle {
  ventureName:      string;
  daysActive:       number;
  ventureStatus:    string;
  cycleCount:       number;
  cycles:           CycleEvidence[];
  founderProfile:   FounderProfile | null;
  validationSignal: ValidationSignalEvidence | null;
}

export interface CycleEvidence {
  cycleNumber:       number;
  status:            string;
  selectedForkSummary: string | null;
  completedAt:       string | null;
  summary:           PersistedCycleSummary | null;

  recommendation: {
    path:                  string;
    summary:               string;
    reasoning:             string;
    recommendationType:    string | null;
    firstThreeSteps:       string[];
    risks:                 unknown;          // typed in schema; engine renders as-is
    assumptions:           unknown;
    alternativeRejected:   unknown;
    whatWouldMakeThisWrong: string;
    pushbackTurnsCount:    number;
    pushbackTurnsSample:   string[];          // up to 8 most recent founder turns, redacted-for-prompt
    validationOutcome:     string | null;
    outcome:               OutcomeEvidence | null;
  };

  beliefState: {
    primaryGoal:        string | null;
    situation:          string | null;
    biggestConcern:     string | null;
    motivationAnchor:   string | null;
    availableBudget:    string | null;
    availableTimePerWeek: string | null;
    technicalAbility:   string | null;
    geographicMarket:   string | null;
    whatTriedBefore:    string | null;
    whyNow:             string | null;
  };

  roadmap: {
    totalTasks:        number;
    completedTasks:    number;
    blockedTasks:      number;
    closingThought:    string | null;
    parkingLotItems:   ParkingLotEvidence[];
    checkIns:          CheckInEvidence[];
    toolSessions:      ToolSessionEvidence[];
  } | null;
}

export interface CheckInEvidence {
  taskTitle:     string;
  taskStatus:    string;
  category:      string;
  source:        string;
  freeText:      string;
  agentAction:   string;
  agentResponse: string;
  round:         number;
  timestamp:     string;
}

export interface ToolSessionEvidence {
  taskTitle: string;
  tool:      'coach' | 'composer' | 'research' | 'packager';
  // Each tool-session shape is opaque enough that the engine
  // formats it conditionally. The serialisation below extracts
  // only the human-readable signal — not the raw JSON blob.
  summary:   string;
}

export interface ParkingLotEvidence {
  idea:         string;
  surfacedFrom: string;
  surfacedAt:   string;
  taskContext:  string | null;
}

export interface OutcomeEvidence {
  outcomeType: string;
  freeText:    string;
  weakPhases:  string[];
}

export interface ValidationSignalEvidence {
  signalStrength: 'strong' | 'moderate' | 'weak' | 'negative' | 'absent';
  totalVisitors:  number;
  uniqueVisitors: number;
  ctaConversion:  number;       // 0..1
  pagesPublished: number;
  surveyThemes:   string[];
  buildBriefSummary: string | null;
  disconfirmedAssumptions: string[];
}

// ---------------------------------------------------------------------------
// Top-level loader
// ---------------------------------------------------------------------------

/**
 * Load every piece of evidence the engine needs for one venture.
 * Ownership-scoped via userId on every query — a leaked ventureId
 * cannot read another user's data.
 */
export async function loadVentureEvidenceBundle(input: {
  userId:    string;
  ventureId: string;
}): Promise<VentureEvidenceBundle | null> {
  const { userId, ventureId } = input;

  const venture = await prisma.venture.findFirst({
    where:  { id: ventureId, userId },
    select: {
      id: true, name: true, status: true, createdAt: true,
      cycles: {
        orderBy: { cycleNumber: 'asc' },
        select: {
          id: true, cycleNumber: true, status: true,
          selectedForkSummary: true, completedAt: true,
          summary: true,
          recommendation: {
            select: {
              id:                     true,
              path:                   true,
              summary:                true,
              reasoning:              true,
              recommendationType:     true,
              firstThreeSteps:        true,
              risks:                  true,
              assumptions:            true,
              alternativeRejected:    true,
              whatWouldMakeThisWrong: true,
              pushbackHistory:        true,
              validationOutcome:      true,
              session: { select: { beliefState: true } },
              outcome: {
                select: {
                  outcomeType: true,
                  freeText:    true,
                  weakPhases:  true,
                },
              },
              // Recommendation.id is needed to join validation pages
              // back to this venture's recommendations downstream.
              roadmap: {
                select: {
                  id:               true,
                  phases:           true,
                  closingThought:   true,
                  parkingLot:       true,
                  progress: {
                    select: {
                      totalTasks:     true,
                      completedTasks: true,
                      blockedTasks:   true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!venture) return null;

  const profile = await prisma.founderProfile.findUnique({
    where:  { userId },
    select: { profile: true },
  });
  const founderProfile = profile?.profile ? safeParseFounderProfile(profile.profile) : null;

  // Validation signal — aggregated across every page tied to this
  // venture's recommendations or roadmaps. The continuation engine
  // already has a similar aggregator (loadValidationSignal); for
  // the transformation report we read the same shape here so the
  // engine prompt sees raw numbers + a strength label.
  const recommendationIds = venture.cycles
    .map(c => c.recommendation?.id)
    .filter((x): x is string => Boolean(x));
  const roadmapIds = venture.cycles
    .map(c => c.recommendation?.roadmap?.id)
    .filter((x): x is string => Boolean(x));

  const validationSignal = await loadValidationSignalForVenture({
    userId,
    recommendationIds,
    roadmapIds,
  });

  const daysActive = Math.max(
    1,
    Math.round((Date.now() - venture.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
  );

  return {
    ventureName:   venture.name,
    daysActive,
    ventureStatus: venture.status,
    cycleCount:    venture.cycles.length,
    cycles:        venture.cycles.map(formatCycle),
    founderProfile,
    validationSignal,
  };
}

// ---------------------------------------------------------------------------
// Per-cycle formatting — extracts belief state fields the engine
// quotes back, samples pushback turns, parses the JSONB phases
// column for check-ins + tool sessions.
// ---------------------------------------------------------------------------

interface RawCycle {
  id: string;
  cycleNumber: number;
  status: string;
  selectedForkSummary: string | null;
  completedAt: Date | null;
  summary: unknown;
  recommendation: {
    id: string;
    path: string;
    summary: string;
    reasoning: string;
    recommendationType: string | null;
    firstThreeSteps: unknown;
    risks: unknown;
    assumptions: unknown;
    alternativeRejected: unknown;
    whatWouldMakeThisWrong: string;
    pushbackHistory: unknown;
    validationOutcome: string | null;
    session: { beliefState: unknown };
    // Outcome.freeText is nullable in the Prisma model — match that
    // here so the structural typecheck against the findFirst return
    // type passes without a lossy cast.
    outcome: { outcomeType: string; freeText: string | null; weakPhases: string[] } | null;
    roadmap: {
      id: string;
      phases: unknown;
      closingThought: string | null;
      parkingLot: unknown;
      progress: { totalTasks: number; completedTasks: number; blockedTasks: number } | null;
    } | null;
  } | null;
}

function formatCycle(raw: RawCycle): CycleEvidence {
  const rec = raw.recommendation;
  const beliefRaw = rec?.session.beliefState;
  const ctx = beliefRaw ? safeParseDiscoveryContext(beliefRaw) : null;

  const pushback = formatPushbackHistory(rec?.pushbackHistory);

  const roadmap = rec?.roadmap ? formatRoadmap(rec.roadmap) : null;

  return {
    cycleNumber:         raw.cycleNumber,
    status:              raw.status,
    selectedForkSummary: raw.selectedForkSummary,
    completedAt:         raw.completedAt?.toISOString() ?? null,
    summary:             raw.summary && typeof raw.summary === 'object'
      ? (raw.summary as PersistedCycleSummary)
      : null,
    recommendation: {
      path:                  rec?.path ?? '',
      summary:               rec?.summary ?? '',
      reasoning:             rec?.reasoning ?? '',
      recommendationType:    rec?.recommendationType ?? null,
      firstThreeSteps:       Array.isArray(rec?.firstThreeSteps)
        ? (rec.firstThreeSteps as string[]).filter(s => typeof s === 'string')
        : [],
      risks:                 rec?.risks ?? [],
      assumptions:           rec?.assumptions ?? [],
      alternativeRejected:   rec?.alternativeRejected ?? [],
      whatWouldMakeThisWrong: rec?.whatWouldMakeThisWrong ?? '',
      pushbackTurnsCount:    pushback.userTurnCount,
      pushbackTurnsSample:   pushback.recentUserTurns,
      validationOutcome:     rec?.validationOutcome ?? null,
      outcome:               rec?.outcome
        ? {
            outcomeType: rec.outcome.outcomeType,
            // Outcome.freeText is nullable on the schema; surface
            // empty-string when null so the engine prompt does not
            // need to special-case the missing field.
            freeText:    rec.outcome.freeText ?? '',
            weakPhases:  rec.outcome.weakPhases,
          }
        : null,
    },
    beliefState: {
      primaryGoal:          beliefValueOrNull(ctx?.primaryGoal),
      situation:            beliefValueOrNull(ctx?.situation),
      biggestConcern:       beliefValueOrNull(ctx?.biggestConcern),
      motivationAnchor:     beliefValueOrNull(ctx?.motivationAnchor),
      availableBudget:      beliefValueOrNull(ctx?.availableBudget),
      availableTimePerWeek: beliefValueOrNull(ctx?.availableTimePerWeek),
      technicalAbility:     beliefValueOrNull(ctx?.technicalAbility),
      geographicMarket:     beliefValueOrNull(ctx?.geographicMarket),
      whatTriedBefore:      beliefValueOrNull(ctx?.whatTriedBefore),
      whyNow:               beliefValueOrNull(ctx?.whyNow),
    },
    roadmap,
  };
}

function beliefValueOrNull(field: { value: unknown } | undefined | null): string | null {
  if (!field) return null;
  return typeof field.value === 'string' && field.value.trim().length > 0
    ? field.value.trim()
    : null;
}

function formatPushbackHistory(raw: unknown): {
  userTurnCount: number;
  recentUserTurns: string[];
} {
  if (!Array.isArray(raw)) return { userTurnCount: 0, recentUserTurns: [] };
  const userTurns = (raw as Array<{ role?: string; content?: string }>)
    .filter(t => t.role === 'user' && typeof t.content === 'string')
    .map(t => t.content as string);
  const recent = userTurns.slice(-8).map(s => s.slice(0, 800));
  return { userTurnCount: userTurns.length, recentUserTurns: recent };
}

function formatRoadmap(roadmap: {
  id: string;
  phases: unknown;
  closingThought: string | null;
  parkingLot: unknown;
  progress: { totalTasks: number; completedTasks: number; blockedTasks: number } | null;
}): CycleEvidence['roadmap'] {
  const phasesParsed = StoredPhasesArraySchema.safeParse(roadmap.phases);
  const phases = phasesParsed.success ? phasesParsed.data : [];

  const checkIns: CheckInEvidence[] = [];
  const toolSessions: ToolSessionEvidence[] = [];

  for (const phase of phases) {
    for (const task of phase.tasks) {
      // Check-ins — capture the founder's own words. Source is
      // important: 'success_criteria_confirmed' has lower narrative
      // weight than 'founder' but still records that the task was
      // completed.
      const history = task.checkInHistory ?? [];
      for (const entry of history) {
        checkIns.push({
          taskTitle:     task.title,
          taskStatus:    task.status ?? 'not_started',
          category:      entry.category,
          source:        entry.source ?? 'founder',
          freeText:      entry.freeText.slice(0, 1200),
          agentAction:   entry.agentAction,
          agentResponse: entry.agentResponse.slice(0, 1200),
          round:         entry.round,
          timestamp:     entry.timestamp,
        });
      }

      // Tool sessions — only summarise the kind of work that
      // happened, not the full output (the engine doesn't need to
      // re-quote the entire roleplay; it needs to know the founder
      // prepped a sales call and how it went).
      const t = task as Record<string, unknown>;
      if (t.coachSession)    toolSessions.push({ taskTitle: task.title, tool: 'coach',     summary: summariseToolSession('coach', t.coachSession) });
      if (t.composerSession) toolSessions.push({ taskTitle: task.title, tool: 'composer',  summary: summariseToolSession('composer', t.composerSession) });
      if (t.researchSession) toolSessions.push({ taskTitle: task.title, tool: 'research',  summary: summariseToolSession('research', t.researchSession) });
      if (t.packagerSession) toolSessions.push({ taskTitle: task.title, tool: 'packager',  summary: summariseToolSession('packager', t.packagerSession) });
    }
  }

  // Parking lot — surface verbatim, no truncation. These are
  // already capped at 280 chars per item by the parking-lot writer.
  const parkingLotItems: ParkingLotEvidence[] = [];
  if (Array.isArray(roadmap.parkingLot)) {
    for (const raw of roadmap.parkingLot as Array<Record<string, unknown>>) {
      if (typeof raw.idea === 'string') {
        parkingLotItems.push({
          idea:         raw.idea,
          surfacedFrom: typeof raw.surfacedFrom === 'string' ? raw.surfacedFrom : 'unknown',
          surfacedAt:   typeof raw.surfacedAt === 'string'   ? raw.surfacedAt   : '',
          taskContext:  typeof raw.taskContext === 'string'  ? raw.taskContext  : null,
        });
      }
    }
  }

  return {
    totalTasks:     roadmap.progress?.totalTasks     ?? 0,
    completedTasks: roadmap.progress?.completedTasks ?? 0,
    blockedTasks:   roadmap.progress?.blockedTasks   ?? 0,
    closingThought: roadmap.closingThought,
    parkingLotItems,
    checkIns,
    toolSessions,
  };
}

function summariseToolSession(
  kind: 'coach' | 'composer' | 'research' | 'packager',
  session: unknown,
): string {
  if (!session || typeof session !== 'object') return `${kind} session — opaque`;
  const s = session as Record<string, unknown>;

  switch (kind) {
    case 'coach': {
      const setup = s.setup as Record<string, unknown> | undefined;
      const debrief = s.debrief as Record<string, unknown> | undefined;
      const who       = typeof setup?.who       === 'string' ? setup.who       : null;
      const objective = typeof setup?.objective === 'string' ? setup.objective : null;
      const fear      = typeof setup?.fear      === 'string' ? setup.fear      : null;
      const takeaway  = typeof debrief?.keyTakeaway === 'string' ? debrief.keyTakeaway : null;
      return [
        who       && `prepared for ${who}`,
        objective && `objective: ${objective}`,
        fear      && `fear: ${fear}`,
        takeaway  && `debrief takeaway: ${takeaway}`,
      ].filter(Boolean).join(' · ') || 'coach session';
    }
    case 'composer': {
      const mode = typeof s.mode === 'string' ? s.mode : 'unknown';
      const messages = Array.isArray(s.messages) ? s.messages.length : 0;
      const sent = Array.isArray(s.sentMessages) ? s.sentMessages.length : 0;
      return `outreach (${mode}) — ${messages} message${messages === 1 ? '' : 's'} drafted, ${sent} marked sent`;
    }
    case 'research': {
      const query = typeof s.query === 'string' ? s.query : null;
      const report = s.report as Record<string, unknown> | undefined;
      const findings = Array.isArray(report?.findings) ? report.findings.length : 0;
      return query
        ? `researched "${query.slice(0, 120)}" — ${findings} finding${findings === 1 ? '' : 's'}`
        : `${findings} research finding${findings === 1 ? '' : 's'}`;
    }
    case 'packager': {
      const pkg = s.package as Record<string, unknown> | undefined;
      const name = typeof pkg?.serviceName === 'string' ? pkg.serviceName : null;
      const tiers = Array.isArray(pkg?.tiers) ? pkg.tiers.length : 0;
      return name
        ? `packaged "${name}" — ${tiers} tier${tiers === 1 ? '' : 's'} priced`
        : `service packaged (${tiers} tier${tiers === 1 ? '' : 's'})`;
    }
  }
}

// ---------------------------------------------------------------------------
// Validation signal aggregation — same shape as the continuation
// engine's loader. Pulls every published page tied to the venture
// and folds counts, conversion, themes, build briefs into one
// summary the engine renders into a single prompt block.
// ---------------------------------------------------------------------------

async function loadValidationSignalForVenture(input: {
  userId:            string;
  recommendationIds: string[];
  roadmapIds:        string[];
}): Promise<ValidationSignalEvidence | null> {
  const { userId, recommendationIds, roadmapIds } = input;
  if (recommendationIds.length === 0 && roadmapIds.length === 0) return null;

  const pages = await prisma.validationPage.findMany({
    where: {
      userId,
      OR: [
        ...(recommendationIds.length > 0 ? [{ recommendationId: { in: recommendationIds } }] : []),
        ...(roadmapIds.length        > 0 ? [{ roadmapId:        { in: roadmapIds        } }] : []),
      ],
    },
    select: {
      id: true, status: true,
      snapshots: {
        orderBy: { takenAt: 'desc' },
        take:    1,
        select: {
          visitorCount:       true,
          uniqueVisitorCount: true,
          ctaConversionRate:  true,
          interpretation:     true,
        },
      },
      report: {
        select: {
          signalStrength:          true,
          buildBrief:              true,
          disconfirmedAssumptions: true,
        },
      },
    },
  });

  if (pages.length === 0) return null;

  let totalVisitors  = 0;
  let uniqueVisitors = 0;
  let weightedConv   = 0;
  let convWeight     = 0;
  const surveyThemes: string[] = [];
  let buildBriefSummary: string | null = null;
  const disconfirmedAssumptions: string[] = [];
  const signalStrengths: string[] = [];

  for (const page of pages) {
    const snap = page.snapshots[0];
    if (snap) {
      totalVisitors  += snap.visitorCount;
      uniqueVisitors += snap.uniqueVisitorCount;
      const w = snap.uniqueVisitorCount > 0 ? snap.uniqueVisitorCount : 1;
      weightedConv += snap.ctaConversionRate * w;
      convWeight   += w;
    }
    if (snap?.interpretation && typeof snap.interpretation === 'object') {
      const themes = (snap.interpretation as Record<string, unknown>).surveyThemes;
      if (Array.isArray(themes)) {
        for (const t of themes) if (typeof t === 'string') surveyThemes.push(t);
      }
    }
    if (page.report) {
      if (page.report.signalStrength) signalStrengths.push(page.report.signalStrength);
      if (typeof page.report.buildBrief === 'string' && !buildBriefSummary) {
        buildBriefSummary = page.report.buildBrief.slice(0, 1500);
      }
      if (Array.isArray(page.report.disconfirmedAssumptions)) {
        for (const a of page.report.disconfirmedAssumptions) {
          if (typeof a === 'string') disconfirmedAssumptions.push(a);
        }
      }
    }
  }

  // Aggregate signal strength: pick the strongest negative reading
  // first (negative > weak > moderate > strong > absent), since for
  // a transformation report a single negative is more honest than
  // averaging it down.
  const strengthRank: Record<string, number> = {
    negative: 5, weak: 4, moderate: 3, strong: 2, absent: 1,
  };
  const aggregateStrength = signalStrengths.length === 0
    ? 'absent' as const
    : (signalStrengths.reduce((a, b) => (strengthRank[a] ?? 0) >= (strengthRank[b] ?? 0) ? a : b) as
       'strong' | 'moderate' | 'weak' | 'negative' | 'absent');

  return {
    signalStrength: aggregateStrength,
    totalVisitors,
    uniqueVisitors,
    ctaConversion: convWeight > 0 ? weightedConv / convWeight : 0,
    pagesPublished: pages.filter(p => p.status === 'LIVE' || p.status === 'ARCHIVED').length,
    surveyThemes:  Array.from(new Set(surveyThemes)).slice(0, 12),
    buildBriefSummary,
    disconfirmedAssumptions: disconfirmedAssumptions.slice(0, 8),
  };
}
