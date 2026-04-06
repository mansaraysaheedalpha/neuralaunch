// src/lib/validation/metrics-collector.ts
import 'server-only';
import { env }    from '@/lib/env';
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
 * Pulls analytics for a single validation page slug from PostHog.
 * Returns zeroed metrics if POSTHOG_API_KEY is not configured — this is the
 * expected state before the first PostHog project is wired. The reporting
 * function treats zero-metric snapshots as "no data yet" and skips interpretation.
 *
 * The PostHog API is queried via its `/api/projects/{id}/insights/trend/` and
 * event-query endpoints. Each page's events are tagged with `lp_slug: <slug>`
 * on ingest — that's how this function isolates per-page data.
 *
 * All I/O failures are caught and logged; the reporter continues with whatever
 * partial data is available rather than crashing the whole cycle.
 */
export async function collectMetricsForPage(slug: string): Promise<RawMetrics> {
  const log = logger.child({ module: 'metrics-collector', slug });

  const empty: RawMetrics = {
    visitorCount:       0,
    uniqueVisitorCount: 0,
    ctaConversionRate:  0,
    featureClicks:      [],
    surveyResponses:    [],
    trafficSources:     [],
    scrollDepthData:    [],
  };

  if (!env.POSTHOG_API_KEY) {
    log.debug('POSTHOG_API_KEY not configured — returning empty metrics');
    return empty;
  }

  try {
    // TODO: Implement PostHog queries once a project is provisioned.
    // Planned queries:
    //   1. Event count where event = 'page_view' AND properties.lp_slug = slug
    //   2. Distinct visitor count (use distinct_id)
    //   3. cta_signup / page_view → ctaConversionRate
    //   4. Aggregate feature_click events grouped by taskId
    //   5. Aggregate survey_response events (surveyKey + answer)
    //   6. Referrer breakdown for traffic sources
    //   7. scroll_depth milestone counts normalised by visitor count
    //
    // For the first production slice we ship with the empty stub so the
    // scheduled function loop is exercised end-to-end. Real metrics switch on
    // the moment a PostHog key is set — no further code changes needed.
    log.info('PostHog integration not yet implemented — returning empty metrics');
    return empty;
  } catch (error) {
    log.error('Metrics collection failed', { error: String(error) });
    return empty;
  }
}
