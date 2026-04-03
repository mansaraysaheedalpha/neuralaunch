// src/lib/discovery/question-generator.ts
import 'server-only';
import { streamText } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import type { AudienceType } from './constants';
import { InterviewPhase, MODELS } from './constants';

type FieldBelief = { value: unknown; confidence: number };

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

// Audience-specific framing injected into the interviewer system prompt.
// Tells the model WHO it is talking to so it can match tone and frame questions
// in terms that resonate with that person's actual situation.
const AUDIENCE_CONTEXT: Record<AudienceType, string> = {
  LOST_GRADUATE:
    'You are talking to a recent graduate who is unsure what direction to take. They may feel overwhelmed by options and lack of experience. Frame questions around what excites or frustrates them, not around business metrics they may not understand yet.',
  STUCK_FOUNDER:
    'You are talking to someone who has tried building something before and stalled or failed. They carry experience but also likely some self-doubt or fatigue. Frame questions to acknowledge what they have already learned, and probe gently on what is genuinely different this time.',
  ESTABLISHED_OWNER:
    'You are talking to someone who already has a running business. They are not a beginner. Frame questions at a strategic level — around growth levers, leverage points, bottlenecks, and decision trade-offs rather than basics.',
  ASPIRING_BUILDER:
    'You are talking to a first-time builder with a clear idea who wants to execute. They are motivated and relatively focused. Frame questions to sharpen their thinking on feasibility, first customers, and realistic constraints — not to challenge whether they should try.',
  MID_JOURNEY_PROFESSIONAL:
    'You are talking to someone currently employed who is considering a transition or side project. Time and risk tolerance are their primary constraints. Frame questions around what they can realistically do given employment constraints, and what the decision is actually costing them by waiting.',
};

function buildSystem(audienceType?: AudienceType): string {
  const base = `You are a sharp, empathetic discovery interviewer helping someone find their right startup path.
Your questions are short, specific, and conversational — never more than 2 sentences.
Ask ONE question only. Never list multiple questions.
Do not give praise, filler, or commentary. Just ask.`;
  if (!audienceType) return base;
  return `${base}\n\n${AUDIENCE_CONTEXT[audienceType]}`;
}

/**
 * generateQuestion
 *
 * Produces a single, conversational discovery question aimed at the given field,
 * OR a context-derived psychological probe when field is 'psych_probe'.
 * Returns a StreamTextResult so the API route can pipe it directly to the client.
 *
 * @param options.unclear            - Re-ask the same field more specifically (extraction miss)
 * @param options.insufficientSignal - Ask a more focused, concrete version (terse user)
 */
export function generateQuestion(
  field:        DiscoveryContextField | 'psych_probe',
  phase:        InterviewPhase,
  context:      DiscoveryContext,
  options:      { unclear?: boolean; insufficientSignal?: boolean } = {},
  audienceType?: AudienceType,
) {
  const system = buildSystem(audienceType);

  // Psychological probe — question derived from what the user has already said
  if (field === 'psych_probe') {
    const relevant = (['whatTriedBefore', 'situation', 'biggestConcern'] as const)
      .map(k => context[k])
      .filter(f => f.value !== null && f.confidence > 0.4)
      .map(f => (Array.isArray(f.value) ? f.value.join(', ') : String(f.value)))
      .join('. ');

    return streamText({
      model:  aiSdkAnthropic(MODELS.INTERVIEW),
      system,
      messages: [{
        role:    'user',
        content: `Based on what this person has shared: ${relevant || 'limited context so far'}

There are signs of a motivational or psychological barrier — not just a practical one.
Ask ONE direct but kind question probing this barrier specifically.
The question must feel like it flows naturally from their own words — personal, not clinical.
Do not use generic examples. Derive the question from what they actually said.`,
      }],
    });
  }

  const knownFacts = Object.entries(context)
    .filter(([, f]) => f.value !== null && f.confidence > 0.5)
    .map(([k, f]) => `  ${k}: ${JSON.stringify(f.value)}`)
    .join('\n');

  const unclearPrefix = options.unclear
    ? `Note: the person's previous answer about ${FIELD_LABELS[field]} wasn't clear enough to extract useful information. Gently acknowledge that you'd like to understand better, then ask a more specific question about ${FIELD_LABELS[field]}.\n\n`
    : '';

  const thinSignalPrefix = options.insufficientSignal && !options.unclear
    ? `Note: answers have been very brief so far. Ask a more focused, concrete version of this question — give them a specific angle to respond to rather than a broad open-ended one.\n\n`
    : '';

  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system,
    messages: [{
      role:    'user',
      content: `Current interview phase: ${phase}
We need to learn about: ${FIELD_LABELS[field]}

Context gathered so far:
${knownFacts || '  (nothing yet)'}

${unclearPrefix}${thinSignalPrefix}Ask one clear, direct question to learn about ${FIELD_LABELS[field]}.
Keep it natural given what we already know about this person.`,
    }],
  });
}

/**
 * generateMetaResponse
 *
 * Streams a brief, warm answer to a meta/off-topic question the user asked
 * mid-interview, then re-invites them to continue.
 */
export function generateMetaResponse(userMessage: string) {
  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system: `You are the NeuraLaunch discovery assistant. The user has asked a meta-question mid-interview. Answer it briefly and warmly in 1-2 sentences, then invite them to continue the interview.`,
    messages: [{ role: 'user', content: userMessage }],
  });
}

/**
 * generateFrustrationResponse
 *
 * Streams an empathetic, human response when the user expresses resistance
 * or frustration. Acknowledges their feeling, explains why the field matters,
 * and gently re-asks. Never robotic.
 */
export function generateFrustrationResponse(
  userMessage: string,
  field:       DiscoveryContextField,
) {
  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system: `You are the NeuraLaunch discovery assistant. The user seems frustrated or resistant. Acknowledge their feeling warmly and humanly — no platitudes or hollow phrases. In one sentence, explain why understanding ${FIELD_LABELS[field]} helps you give them a genuinely useful recommendation. Then ask the question again in a softer, more open way. Max 3 sentences total.`,
    messages: [{ role: 'user', content: userMessage }],
  });
}

/**
 * generateClarificationResponse
 *
 * Streams a gentle clarification request when the user's latest answer
 * contradicts a previously captured high-confidence value for the same field.
 */
export function generateClarificationResponse(
  userMessage:    string,
  field:          DiscoveryContextField,
  currentBelief:  FieldBelief,
) {
  const existing = currentBelief.value != null ? JSON.stringify(currentBelief.value) : 'something';
  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system: `You are the NeuraLaunch discovery assistant. The user's latest answer about ${FIELD_LABELS[field]} seems to contradict what they said earlier (${existing}). Surface this gently: "Earlier you mentioned ${existing}, but now it sounds like [new thing] — just want to make sure I understand correctly. Which reflects your situation better?" Keep it to 2 sentences.`,
    messages: [{ role: 'user', content: userMessage }],
  });
}
