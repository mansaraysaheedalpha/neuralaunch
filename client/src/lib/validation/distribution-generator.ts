// src/lib/validation/distribution-generator.ts
import 'server-only';
import { generateObject } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { MODELS } from '@/lib/discovery/constants';
import { DISTRIBUTION_BRIEF_CONFIG } from './constants';
import { DistributionBriefSchema, type DistributionBrief } from './schemas';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';
import type { AudienceType } from '@/lib/discovery/constants';
import type { Recommendation } from '@/lib/discovery/recommendation-schema';

// ---------------------------------------------------------------------------
// Channel guidance by audience type — injected into the prompt
// ---------------------------------------------------------------------------

const AUDIENCE_CHANNEL_GUIDANCE: Record<AudienceType, string> = {
  LOST_GRADUATE:
    'University alumni WhatsApp groups, graduate Facebook groups, LinkedIn first-degree connections (classmates, lecturers), student union channels. Prioritise groups where the target user actively participates, not just lurks.',
  STUCK_FOUNDER:
    'Founder and startup WhatsApp groups in their city, local startup Slack/Discord communities, previous customers or users from prior attempts (highest yield — warm audience), entrepreneur Facebook groups.',
  ESTABLISHED_OWNER:
    'Existing customer base via direct message (highest yield — trust already exists), supplier and partner networks, local business association groups, industry-specific WhatsApp groups.',
  ASPIRING_BUILDER:
    'Developer WhatsApp and Telegram groups, local tech meetup channels, IndieHackers community, LinkedIn tech connections. Product Hunt only if the market is international and the product is clearly technical.',
  MID_JOURNEY_PROFESSIONAL:
    'LinkedIn first-degree connections in the same industry, professional association forums or WhatsApp groups, industry-specific Slack communities, alumni networks from previous employers.',
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * generateDistributionBrief
 *
 * Generates a three-channel distribution brief at publish time.
 * Fired once when ValidationPage status changes DRAFT → LIVE.
 * Stored on the ValidationPage record.
 *
 * Each channel entry includes: specific channel name, exact message copy,
 * realistic yield estimate, and the reason this channel fits this person.
 */
export async function generateDistributionBrief(
  recommendation: Recommendation,
  context:        DiscoveryContext,
  audienceType:   AudienceType | null,
  pageUrl:        string,
  sessionId:      string,
): Promise<DistributionBrief> {
  const log = logger.child({ module: 'DistributionGenerator', sessionId });

  const market   = context.geographicMarket?.value ? String(context.geographicMarket.value) : 'their local market';
  const goal     = context.primaryGoal?.value      ? String(context.primaryGoal.value)      : '';
  const tried    = context.whatTriedBefore?.value
    ? Array.isArray(context.whatTriedBefore.value)
      ? context.whatTriedBefore.value.join(', ')
      : String(context.whatTriedBefore.value)
    : 'nothing yet';

  const channelGuidance = audienceType
    ? AUDIENCE_CHANNEL_GUIDANCE[audienceType]
    : 'Local WhatsApp groups, LinkedIn first-degree connections, relevant Facebook groups in their market.';

  const { object } = await generateObject({
    model:  aiSdkAnthropic(MODELS.INTERVIEW), // Sonnet 4.6
    schema: z.object({ channels: DistributionBriefSchema }),
    messages: [{
      role:    'user',
      content: `You are generating a three-channel distribution brief for a founder who has just published their validation landing page.
The brief tells them exactly where to share the page and exactly what to say. It must be specific — not advice, not suggestions. Instructions.

FOUNDER CONTEXT:
- Recommended path: ${recommendation.path}
- Market / location: ${market}
- Audience type: ${audienceType ?? 'unknown'}
- Goal: ${goal}
- What they have tried before: ${tried}

PAGE URL: ${pageUrl}

CHANNEL GUIDANCE FOR THIS AUDIENCE TYPE:
${channelGuidance}

Generate exactly ${DISTRIBUTION_BRIEF_CONFIG.CHANNEL_COUNT} distribution channels. Rules:
- Each channel must be specific — name the actual platform and group type, not a category. "Accra Startup Hub WhatsApp group" not "WhatsApp groups".
- Each message must be written in the founder's voice — personal, direct, referencing their specific product. Not a template.
- Each message must include the page URL naturally within the copy.
- Expected yield must be honest and realistic — based on typical engagement rates for the channel type and group size. Do not over-promise.
- Audience reason must be one sentence: why this channel reaches the right person for this specific recommendation.
- Do NOT recommend channels the founder has already tried and failed with (tried: ${tried}).
- Do NOT recommend Product Hunt or international communities if the market is local.
- Rank channels by expected yield — highest yield first.`,
    }],
  });

  log.info('Distribution brief generated', { sessionId, channelCount: object.channels.length });

  return object.channels;
}
