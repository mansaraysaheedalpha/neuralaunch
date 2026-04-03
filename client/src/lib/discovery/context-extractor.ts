// src/lib/discovery/context-extractor.ts
import 'server-only';
import { generateObject } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import { MODELS } from './constants';
import type { AudienceType } from './constants';

// ---------------------------------------------------------------------------
// Public result type returned to the turn route
// ---------------------------------------------------------------------------

export type ExtractionResult = {
  updates:     Partial<DiscoveryContext>;
  inputType:   'answer' | 'offtopic' | 'frustrated';
  contradicts: boolean;
};

// ---------------------------------------------------------------------------
// Schema — one generateObject call classifies AND extracts per turn
// ---------------------------------------------------------------------------

const ExtractionResultSchema = z.object({
  inputType: z.enum(['answer', 'offtopic', 'frustrated']).describe(
    'answer: user responded to the question (even vaguely). offtopic: user asked who you are, how this works, or any meta/unrelated question. frustrated: user expressed annoyance, resistance, or confusion ("stop", "I don\'t know", "why do you keep asking", "pointless", "whatever").',
  ),
  extracted:   z.boolean().describe('true if the user mentioned something relevant to the field being asked about'),
  value:       z.string().describe('The extracted value in the user\'s own words. For lists, separate items with " | ".'),
  confidence:  z.number().describe('Confidence: 0.9-1.0 explicit, 0.6-0.8 inferred, 0.3-0.5 weakly implied'),
  contradicts: z.boolean().describe(
    'true ONLY when: extracted is true AND an existing value with confidence > 0.7 already exists AND the new value is meaningfully different from the existing one.',
  ),
});

// ---------------------------------------------------------------------------
// Coerce raw string value to the correct DiscoveryContext field type
// ---------------------------------------------------------------------------

function parseFieldValue(field: DiscoveryContextField, raw: string): unknown {
  if (field === 'whatTriedBefore') {
    return raw.split('|').map(s => s.trim()).filter(Boolean);
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * extractContext
 *
 * Classifies the user's message (answer / offtopic / frustrated), extracts
 * a context update when it is an answer, and flags contradictions with
 * existing high-confidence values.
 *
 * @param currentFieldValue - Existing belief for the active field; used to
 *   detect contradictions. Undefined on the first turn for a field.
 */
export async function extractContext(
  userMessage:         string,
  activeField:         DiscoveryContextField,
  conversationHistory: string,
  currentFieldValue?:  { value: unknown; confidence: number },
): Promise<ExtractionResult> {
  const existingStr =
    currentFieldValue && currentFieldValue.value != null && currentFieldValue.confidence > 0.7
      ? `Existing value (confidence ${currentFieldValue.confidence.toFixed(2)}): "${JSON.stringify(currentFieldValue.value)}"`
      : 'No existing value yet.';

  const { object } = await generateObject({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    schema: ExtractionResultSchema,
    messages: [{
      role:    'user',
      content: `You are processing a message in a startup discovery interview.

FIELD BEING ASKED: ${activeField}
EXISTING VALUE FOR THIS FIELD: ${existingStr}

CONVERSATION SO FAR:
${conversationHistory}

LATEST USER MESSAGE:
"${userMessage}"

First, classify the message:
- "answer": the user responded to the interview question (vague counts)
- "offtopic": the user asked a meta question (who are you, how does this work, what is NeuraLaunch, etc.)
- "frustrated": the user expressed annoyance, resistance, or dismissal

If inputType is "answer":
  - extracted: true if they mentioned anything relevant to "${activeField}"
  - value: their words verbatim (lists: separate with " | ")
  - confidence: 0.9-1.0 explicit, 0.6-0.8 inferred, 0.3-0.5 implied
  - contradicts: true only if extracted is true, an existing value with confidence > 0.7 exists, and the new value is meaningfully different

If inputType is NOT "answer": set extracted: false, value: "", confidence: 0, contradicts: false.`,
    }],
  });

  if (object.inputType !== 'answer' || !object.extracted || !object.value) {
    return { updates: {}, inputType: object.inputType, contradicts: false };
  }

  if (object.contradicts) {
    return { updates: {}, inputType: 'answer', contradicts: true };
  }

  return {
    updates: {
      [activeField]: {
        value:       parseFieldValue(activeField, object.value),
        confidence:  object.confidence,
        extractedAt: new Date().toISOString(),
      },
    } as Partial<DiscoveryContext>,
    inputType:   'answer',
    contradicts: false,
  };
}

// ---------------------------------------------------------------------------
// Audience classification
// ---------------------------------------------------------------------------

const AudienceClassificationSchema = z.object({
  audienceType: z.enum([
    'LOST_GRADUATE',
    'STUCK_FOUNDER',
    'ESTABLISHED_OWNER',
    'ASPIRING_BUILDER',
    'MID_JOURNEY_PROFESSIONAL',
  ]).describe(
    'LOST_GRADUATE: recent grad, no clear direction. STUCK_FOUNDER: tried building, stalled. ESTABLISHED_OWNER: has running business. ASPIRING_BUILDER: clear first-time idea. MID_JOURNEY_PROFESSIONAL: employed, considering transition.',
  ),
  confidence: z.number().describe('0.6-0.8 inferred, 0.8-1.0 explicit'),
});

/**
 * detectAudienceType
 *
 * Classifies the user into one of 5 audience types using gathered context
 * and conversation history. Called silently after the 2nd exchange.
 */
export async function detectAudienceType(
  context:             DiscoveryContext,
  conversationHistory: string,
): Promise<{ audienceType: AudienceType; confidence: number }> {
  const knownFacts = Object.entries(context)
    .filter(([, f]) => f.value !== null && f.confidence > 0.5)
    .map(([k, f]) => `${k}: ${JSON.stringify(f.value)}`)
    .join('\n');

  const { object } = await generateObject({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    schema: AudienceClassificationSchema,
    messages: [{
      role:    'user',
      content: `Classify this person's audience type based on what they have shared.

CONTEXT GATHERED:
${knownFacts || '(limited so far)'}

CONVERSATION:
${conversationHistory}

Audience types:
- LOST_GRADUATE: recent graduate, unsure of direction, exploring options
- STUCK_FOUNDER: tried building before, stalled or failed, attempting again
- ESTABLISHED_OWNER: already has a running business, looking to grow or pivot
- ASPIRING_BUILDER: has a clear idea, first-time builder, wants to execute
- MID_JOURNEY_PROFESSIONAL: currently employed, considering a transition or side project

Choose the closest fit. Confidence 0.6-0.8 if inferred, 0.8-1.0 if explicit.`,
    }],
  });

  return object;
}
