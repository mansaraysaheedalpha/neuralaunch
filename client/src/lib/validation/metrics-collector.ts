// src/lib/validation/metrics-collector.ts
import 'server-only';
import prisma    from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type {
  FeatureClickData,
  SurveyResponse,
} from './schemas';

/**
 * RawMetrics — aggregated analytics for one validation page over a reporting cycle.
 * Matches the ValidationSnapshot shape 1:1.
 */
export interface RawMetrics {
  visitorCount:       number;
  uniqueVisitorCount: number;
  ctaConversionRate:  number; // 0.0 – 1.0
  featureClicks:      FeatureClickData[];
  surveyResponses:    SurveyResponse[];
  trafficSources:     Array<{ source: string; count: number }>;
  scrollDepthData:    Array<{ depth: number; reachedPercentage: number }>;
}

/**
 * collectMetricsForPage
 *
 * Aggregates all ValidationEvent rows for a page into a cycle snapshot.
 * Pulls data directly from Postgres — no external analytics dependency.
 *
 * Expected traffic per page is 50–500 visitors over its lifetime, so the
 * full event history comfortably fits in one query. If that assumption
 * changes later we can add a takenAfter parameter and snapshot deltas.
 */
export async function collectMetricsForPage(pageId: string): Promise<RawMetrics> {
  const log = logger.child({ module: 'metrics-collector', pageId });

  const events = await prisma.validationEvent.findMany({
    where:  { validationPageId: pageId },
    select: {
      eventType:  true,
      visitorId:  true,
      properties: true,
    },
  });

  if (events.length === 0) {
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

  // Visitor counts
  const pageViews      = events.filter(e => e.eventType === 'page_view');
  const visitorCount   = pageViews.length;
  const uniqueVisitors = new Set(pageViews.map(e => e.visitorId).filter(Boolean)).size;
  const uniqueVisitorCount = uniqueVisitors || visitorCount;

  // CTA conversion
  const signups          = events.filter(e => e.eventType === 'cta_signup').length;
  const ctaConversionRate = visitorCount > 0 ? signups / visitorCount : 0;

  // Feature clicks — aggregate by taskId
  const featureClickMap = new Map<string, { taskId: string; title: string; clicks: number }>();
  for (const e of events) {
    if (e.eventType !== 'feature_click') continue;
    const p = e.properties as { taskId?: string; title?: string };
    if (!p.taskId || !p.title) continue;
    const existing = featureClickMap.get(p.taskId);
    if (existing) {
      existing.clicks += 1;
    } else {
      featureClickMap.set(p.taskId, { taskId: p.taskId, title: p.title, clicks: 1 });
    }
  }
  const featureClicks: FeatureClickData[] = Array.from(featureClickMap.values())
    .sort((a, b) => b.clicks - a.clicks);

  // Survey responses
  const surveyResponses: SurveyResponse[] = events
    .filter(e => e.eventType === 'survey_response')
    .map(e => {
      const p = e.properties as { question?: string; answer?: string };
      return {
        question: p.question ?? '',
        answer:   p.answer   ?? '',
        takenAt:  new Date().toISOString(),
      };
    })
    .filter(s => s.answer.length > 0);

  // Scroll depth — what % of visitors reached each milestone
  const scrollByDepth = new Map<number, number>();
  for (const e of events) {
    if (e.eventType !== 'scroll_depth') continue;
    const p = e.properties as { depth?: number };
    if (typeof p.depth !== 'number') continue;
    scrollByDepth.set(p.depth, (scrollByDepth.get(p.depth) ?? 0) + 1);
  }
  const scrollDepthData = Array.from(scrollByDepth.entries())
    .map(([depth, count]) => ({
      depth,
      reachedPercentage: visitorCount > 0 ? Math.round((count / visitorCount) * 100) : 0,
    }))
    .sort((a, b) => a.depth - b.depth);

  // Traffic sources — not yet collected on the client side; placeholder
  const trafficSources: Array<{ source: string; count: number }> = [];

  log.info('Metrics aggregated', {
    pageId,
    eventCount:        events.length,
    visitorCount,
    uniqueVisitorCount,
    totalFeatureClicks: featureClicks.reduce((s, c) => s + c.clicks, 0),
    surveyCount:       surveyResponses.length,
  });

  return {
    visitorCount,
    uniqueVisitorCount,
    ctaConversionRate,
    featureClicks,
    surveyResponses,
    trafficSources,
    scrollDepthData,
  };
}
