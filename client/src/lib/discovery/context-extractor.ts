// src/lib/discovery/context-extractor.ts
import 'server-only';
import { generateObject } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import { MODELS } from './constants';

// ---------------------------------------------------------------------------
// Minimal flat schema — one field at a time to stay within Claude's complexity limit.
// Value is always a string; array/enum fields are coerced in parseFieldValue().
// ---------------------------------------------------------------------------

const ExtractionResultSchema = z.object({
  extracted:  z.boolean().describe('true if the user mentioned this field, false if not'),
  value:      z.string().describe('The extracted value. For lists, separate items with " | ".'),
  confidence: z.number().describe('How confident: 0.9-1.0 explicit, 0.6-0.8 inferred, 0.3-0.5 implied'),
});

// ---------------------------------------------------------------------------
// Coerce the raw string value to the correct DiscoveryContext field type
// ---------------------------------------------------------------------------

function parseFieldValue(field: DiscoveryContextField, raw: string): unknown {
  if (field === 'whatTriedBefore') {
    return raw.split('|').map(s => s.trim()).filter(Boolean);
  }
  return raw; // strings and enum fields are returned as-is
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * extractContext
 *
 * Extracts one field at a time from the user's message using a minimal flat schema.
 * Returns a Partial<DiscoveryContext> ready to pass to applyUpdate().
 */
export async function extractContext(
  userMessage:         string,
  activeField:         DiscoveryContextField,
  conversationHistory: string,
): Promise<Partial<DiscoveryContext>> {
  const { object } = await generateObject({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    schema: ExtractionResultSchema,
    messages: [{
      role:    'user',
      content: `You are extracting one piece of information from a user's message in a startup discovery interview.

FIELD TO EXTRACT: ${activeField}

CONVERSATION SO FAR:
${conversationHistory}

LATEST USER MESSAGE:
"${userMessage}"

Extract the value for "${activeField}" from the user's message.
- extracted: true only if the user actually mentioned something relevant to this field
- value: the relevant content in the user's own words (for lists, separate with " | ")
- confidence: 0.9-1.0 if explicit, 0.6-0.8 if inferred, 0.3-0.5 if weakly implied
If the user did not mention anything relevant to "${activeField}", set extracted to false and value to "".`,
    }],
  });

  if (!object.extracted || !object.value) {
    return {};
  }

  return {
    [activeField]: {
      value:       parseFieldValue(activeField, object.value),
      confidence:  object.confidence,
      extractedAt: new Date().toISOString(),
    },
  } as Partial<DiscoveryContext>;
}
