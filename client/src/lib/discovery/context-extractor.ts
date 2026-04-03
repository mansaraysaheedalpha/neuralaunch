// src/lib/discovery/context-extractor.ts
import 'server-only';
import { generateObject } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import { MODELS } from './constants';

// ---------------------------------------------------------------------------
// Extraction result schema — all fields optional, typed correctly
// ---------------------------------------------------------------------------

// Claude's structured output rejects minimum/maximum on number types —
// range is enforced via the prompt instead.
const fieldUpdate = (valueSchema: z.ZodTypeAny) =>
  z.object({ value: valueSchema, confidence: z.number() }).optional();

const ExtractionResultSchema = z.object({
  situation:            fieldUpdate(z.string()),
  background:           fieldUpdate(z.string()),
  whatTriedBefore:      fieldUpdate(z.array(z.string())),
  primaryGoal:          fieldUpdate(z.string()),
  successDefinition:    fieldUpdate(z.string()),
  timeHorizon:          fieldUpdate(z.string()),
  availableTimePerWeek: fieldUpdate(z.string()),
  availableBudget:      fieldUpdate(z.string()),
  teamSize:             fieldUpdate(z.enum(['solo', 'small_team', 'established_team'])),
  technicalAbility:     fieldUpdate(z.enum(['none', 'basic', 'intermediate', 'strong'])),
  geographicMarket:     fieldUpdate(z.string()),
  commitmentLevel:      fieldUpdate(z.enum(['exploring', 'committed', 'all_in'])),
  biggestConcern:       fieldUpdate(z.string()),
  whyNow:               fieldUpdate(z.string()),
});

type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toContextUpdate(extraction: ExtractionResult): Partial<DiscoveryContext> {
  const now    = new Date().toISOString();
  const update: Partial<DiscoveryContext> = {};

  for (const key of Object.keys(extraction) as DiscoveryContextField[]) {
    const field = (extraction as Record<string, { value: unknown; confidence: number } | undefined>)[key];
    if (field !== undefined) {
      (update as Record<string, unknown>)[key] = {
        value:       field.value,
        confidence:  field.confidence,
        extractedAt: now,
      };
    }
  }

  return update;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * extractContext
 *
 * Parses a user's free-text message and maps it to typed DiscoveryContext fields.
 * Primarily extracts `activeField`; opportunistically extracts any other fields mentioned.
 *
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
      content: `You are extracting structured information from a person's message during a startup discovery interview.

CONVERSATION SO FAR:
${conversationHistory}

LATEST USER MESSAGE:
"${userMessage}"

PRIMARY FIELD TO EXTRACT: ${activeField}

Rules:
- Confidence 0.9–1.0: user stated it explicitly and clearly
- Confidence 0.6–0.8: reasonably inferred from what they said
- Confidence 0.3–0.5: only weakly implied
- Omit a field entirely if it was not mentioned

Extract the ${activeField} field. Also extract any other fields the user happened to mention.
Be conservative — prefer lower confidence when in doubt.`,
    }],
  });

  return toContextUpdate(object);
}
