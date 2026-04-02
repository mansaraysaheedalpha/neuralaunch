// src/lib/discovery/question-generator.ts
import { streamText } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import { InterviewPhase, MODELS } from './constants';

// ---------------------------------------------------------------------------
// Field labels — human-readable descriptions for the prompt
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<DiscoveryContextField, string> = {
  situation:            'their current situation',
  background:           'their relevant experience and skills',
  whatTriedBefore:      'what they have already attempted',
  primaryGoal:          'their primary goal',
  successDefinition:    'how they would define success',
  timeHorizon:          'their realistic timeline expectation',
  availableTimePerWeek: 'how much time they can commit per week',
  availableBudget:      'their available starting budget',
  teamSize:             'whether they are working alone or with others',
  technicalAbility:     'their technical skill level',
  geographicMarket:     'their target market or location',
  commitmentLevel:      'how committed they are to following through',
  biggestConcern:       'their biggest fear or concern',
  whyNow:               'why they are taking action at this specific moment',
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * generateQuestion
 *
 * Produces a single, conversational discovery question aimed at the given field.
 * Returns a StreamTextResult so the API route can pipe it directly to the client.
 * The stream is intentionally short: 1–3 sentences.
 */
export function generateQuestion(
  field:   DiscoveryContextField,
  phase:   InterviewPhase,
  context: DiscoveryContext,
) {
  const knownFacts = Object.entries(context)
    .filter(([, f]) => f.value !== null && f.confidence > 0.5)
    .map(([k, f]) => `  ${k}: ${JSON.stringify(f.value)}`)
    .join('\n');

  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system: `You are a sharp, empathetic discovery interviewer helping someone find their right startup path.
Your questions are short, specific, and conversational — never more than 2 sentences.
Ask ONE question only. Never list multiple questions.
Do not give praise, filler, or commentary. Just ask.`,
    messages: [{
      role:    'user',
      content: `Current interview phase: ${phase}
We need to learn about: ${FIELD_LABELS[field]}

Context gathered so far:
${knownFacts || '  (nothing yet)'}

Ask one clear, direct question to learn about ${FIELD_LABELS[field]}.
Keep it natural given what we already know about this person.`,
    }],
  });
}
