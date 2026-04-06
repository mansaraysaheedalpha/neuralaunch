// src/lib/validation/metrics-collector.ts
import 'server-only';
import prisma     from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type {
  FeatureClickData,
  SurveyResponse,
} from './schemas';

/**
 * RawMetrics — aggregated analytics for one validation page over a reporting cycle.
 */
export interface RawMetrics {
  visitorCount:       number;
  uniqueVisitorCount: number;
  ctaConversionRate:  number;
  featureClicks:      FeatureClickData[];
  surveyResponses:    SurveyResponse[];
  trafficSources:     Array<{ source: string; count: number }>;
  scrollDepthData:    Array<{ depth: number; reachedPercentage: number }>;
}

// Hard cap: we never load more than this many rows of any single kind into
// memory. Real pages peak at a few thousand events; the cap prevents a
// malicious flood from OOM-ing the worker.
const MAX_ROWS_PER_EVENT_TYPE = 10_000;

/**
 * collectMetricsForPage
 *
 * Aggregates ValidationEvent rows for one page using database-side groupBy
 * where possible and bounded per-type limits where row-level detail matters.
 *
 * Returns zero-filled metrics for pages with no events yet.
 */
export async function collectMetricsForPage(pageId: string): Promise<RawMetrics> {
  const log = logger.child({ module: 'metrics-collector', pageId });

  // Aggregate counts per eventType in a single query
  const counts = await prisma.validationEvent.groupBy({
    by:      ['eventType'],
    where:   { validationPageId: pageId },
    _count:  { _all: true },
  });

  const countMap = new Map(counts.map(c => [c.eventType, c._count._all]));
  const visitorCount = countMap.get('page_view') ?? 0;
  const signupCount  = countMap.get('cta_signup') ?? 0;

  if (visitorCount === 0 && countMap.size === 0) {
    log.debug('No events yet for page');
    return {
      visitorCount:       0,
      uniqueVisitorCount: 0,
      ctaConversionRate:  0,
      featureClicks:      [],
      surveyResponses:    [],
      trafficSources:     [],
      scrollDepthData:    [],
    };
  }

  // Unique visitors — distinct visitorId among page_view events
  const uniqueRows = await prisma.validationEvent.findMany({
    where:    { validationPageId: pageId, eventType: 'page_view' },
    select:   { visitorId: true },
    distinct: ['visitorId'],
    take:     MAX_ROWS_PER_EVENT_TYPE,
  });
  const uniqueVisitorCount = uniqueRows.filter(r => r.visitorId !== null).length || visitorCount;

  const ctaConversionRate = visitorCount > 0 ? signupCount / visitorCount : 0;

  // Feature clicks aggregated by taskId — loaded in bounded batch, grouped in JS
  // (we need both the count and the human-readable title from properties).
  const featureClickRows = await prisma.validationEvent.findMany({
    where:  { validationPageId: pageId, eventType: 'feature_click' },
    select: { properties: true },
    take:   MAX_ROWS_PER_EVENT_TYPE,
  });
  const featureClickMap = new Map<string, { taskId: string; title: string; clicks: number }>();
  for (const row of featureClickRows) {
    const p = row.properties as { taskId?: unknown; title?: unknown };
    if (typeof p.taskId !== 'string' || typeof p.title !== 'string') continue;
    const existing = featureClickMap.get(p.taskId);
    if (existing) existing.clicks += 1;
    else featureClickMap.set(p.taskId, { taskId: p.taskId, title: p.title, clicks: 1 });
  }
  const featureClicks: FeatureClickData[] = Array.from(featureClickMap.values())
    .sort((a, b) => b.clicks - a.clicks);

  // Survey responses
  const surveyRows = await prisma.validationEvent.findMany({
    where:   { validationPageId: pageId, eventType: 'survey_response' },
    select:  { properties: true, createdAt: true },
    take:    MAX_ROWS_PER_EVENT_TYPE,
    orderBy: { createdAt: 'asc' },
  });
  const surveyResponses: SurveyResponse[] = [];
  for (const row of surveyRows) {
    const p = row.properties as { question?: unknown; answer?: unknown };
    if (typeof p.question !== 'string' || typeof p.answer !== 'string') continue;
    if (p.answer.length === 0) continue;
    surveyResponses.push({
      question: p.question,
      answer:   p.answer,
      takenAt:  row.createdAt.toISOString(),
    });
  }

  // Scroll depth — % of unique visitors who reached each milestone
  const scrollRows = await prisma.validationEvent.findMany({
    where:  { validationPageId: pageId, eventType: 'scroll_depth' },
    select: { properties: true, visitorId: true },
    take:   MAX_ROWS_PER_EVENT_TYPE,
  });
  const depthVisitorSets = new Map<number, Set<string>>();
  for (const row of scrollRows) {
    const p = row.properties as { depth?: unknown };
    if (typeof p.depth !== 'number') continue;
    const visitorKey = row.visitorId ?? 'unknown';
    if (!depthVisitorSets.has(p.depth)) depthVisitorSets.set(p.depth, new Set());
    depthVisitorSets.get(p.depth)!.add(visitorKey);
  }
  const scrollDenominator = uniqueVisitorCount || visitorCount || 1;
  const scrollDepthData = Array.from(depthVisitorSets.entries())
    .map(([depth, set]) => ({
      depth,
      reachedPercentage: Math.min(100, Math.round((set.size / scrollDenominator) * 100)),
    }))
    .sort((a, b) => a.depth - b.depth);

  log.info('Metrics aggregated', {
    pageId,
    visitorCount,
    uniqueVisitorCount,
    totalFeatureClicks: featureClicks.reduce((s, c) => s + c.clicks, 0),
    surveyCount:        surveyResponses.length,
  });

  return {
    visitorCount,
    uniqueVisitorCount,
    ctaConversionRate,
    featureClicks,
    surveyResponses,
    trafficSources: [],
    scrollDepthData,
  };
}

