// src/lib/discovery/question-generator.ts
import 'server-only';
import { streamText } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { DiscoveryContext, DiscoveryContextField } from './context-schema';
import type { AudienceType } from './constants';
import { InterviewPhase, MODELS } from './constants';

type FieldBelief = { value: unknown; confidence: number };
type HistoryMessage = { role: 'user' | 'assistant'; content: string };

// ---------------------------------------------------------------------------
// History parser — converts flat "role: content\n" string to message array
// ---------------------------------------------------------------------------

function parseHistory(raw: string): HistoryMessage[] {
  if (!raw.trim()) return [];
  return raw.trim().split('\n')
    .map(line => {
      const colonIdx = line.indexOf(': ');
      if (colonIdx === -1) return null;
      const role    = line.slice(0, colonIdx).trim();
      const content = line.slice(colonIdx + 2).trim();
      if (!content) return null;
      if (role === 'user' || role === 'assistant') return { role, content } as HistoryMessage;
      return null;
    })
    .filter((m): m is HistoryMessage => m !== null);
}

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
  conversationHistory?: string,
  askedFields?:  DiscoveryContextField[],
) {
  const system        = buildSystem(audienceType);
  const priorMessages = conversationHistory ? parseHistory(conversationHistory) : [];

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
      messages: [
        ...priorMessages,
        {
          role:    'user',
          content: `Based on what this person has shared: ${relevant || 'limited context so far'}

There are signs of a motivational or psychological barrier — not just a practical one.
Ask ONE direct but kind question probing this barrier specifically.
The question must feel like it flows naturally from their own words — personal, not clinical.
Do not use generic examples. Derive the question from what they actually said.`,
        },
      ],
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

  // Build the deterministic "already asked" list from two sources:
  // 1. askedFields — every field the engine has generated a question for (tracked server-side, never inferred)
  // 2. Extracted belief state — fields with sufficient confidence, whether or not a direct question was asked
  // These are combined and deduplicated so the audit is always complete.
  const askedLabels = [
    ...new Set([
      ...(askedFields ?? []).map(k => FIELD_LABELS[k]),
      ...Object.entries(context)
        .filter(([, f]) => f.value !== null && f.confidence > 0.3)
        .map(([k]) => FIELD_LABELS[k as DiscoveryContextField]),
    ]),
  ].join(', ');

  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system,
    messages: [
      ...priorMessages,
      {
        role:    'user',
        content: `Current interview phase: ${phase}
We need to learn about: ${FIELD_LABELS[field]}

Context gathered so far:
${knownFacts || '  (nothing yet)'}

${unclearPrefix}${thinSignalPrefix}ALREADY COVERED — do not ask about any of these again:
${askedLabels || 'nothing yet'}

These dimensions were either directly asked or established through the conversation. They are closed. Do not return to them even indirectly.

Ask one clear, direct question to learn about ${FIELD_LABELS[field]}.
Keep it natural given what we already know about this person.`,
      },
    ],
  });
}

/**
 * generateReflection
 *
 * Streams the Stage 3 "Understand" moment from the vision doc — 3-5 sentences
 * that reflect the user's situation back to them before the recommendation appears.
 * Called immediately after canSynthesise() returns true, while Inngest generates
 * the recommendation in the background.
 */
export function generateReflection(
  context:              DiscoveryContext,
  audienceType:         AudienceType | null,
  conversationHistory?: string,
) {
  const knownFacts = Object.entries(context)
    .filter(([, f]) => f.value !== null && f.confidence > 0.5)
    .map(([k, f]) => `  ${k}: ${JSON.stringify(f.value)}`)
    .join('\n');

  const priorMessages  = conversationHistory ? parseHistory(conversationHistory) : [];
  const audienceNote   = audienceType ? `\nAudience type: ${audienceType}\n` : '';

  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system: `You are closing a discovery interview. Write a short reflection — 3 to 5 sentences — that will be shown to the user before their recommendation. This reflection must make them feel genuinely heard. Use their specific words. Write in prose, not bullets.`,
    messages: [
      ...priorMessages,
      {
        role:    'user',
        content: `Context gathered:
${knownFacts || '(limited context)'}
${audienceNote}
Write the reflection. Rules:
- 3-5 sentences maximum. Prose only — no bullets, no headers.
- Sentence 1-2: state their core situation in their own language. Specific — not generic.
- Sentence 3: name the one central tension or constraint that shapes everything else for them.
- Sentence 4-5: signal the direction the recommendation will address — without revealing it.
- Do NOT use phrases like "based on what you've shared" or "from our conversation today".
- The last sentence must create a bridge to what is coming.`,
      },
    ],
  });
}

/**
 * generateMetaResponse
 *
 * Streams a brief, warm answer to a meta/off-topic question the user asked
 * mid-interview, then re-invites them to continue.
 */
export function generateMetaResponse(
  userMessage:         string,
  phase:               string,
  questionCount:       number,
  conversationHistory?: string,
) {
  const priorMessages = conversationHistory ? parseHistory(conversationHistory) : [];
  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system: `You are the NeuraLaunch discovery assistant conducting a startup discovery interview. You are currently in the ${phase} phase, question ${questionCount} of this session. The user has asked a meta-question. Answer it briefly and warmly in 1-2 sentences, then re-invite them to continue — referencing where you left off. Do NOT introduce yourself or start fresh. You are mid-interview.`,
    messages: [
      ...priorMessages,
      { role: 'user', content: userMessage },
    ],
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
  userMessage:          string,
  field:                DiscoveryContextField,
  conversationHistory?: string,
) {
  const priorMessages = conversationHistory ? parseHistory(conversationHistory) : [];
  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system: `You are the NeuraLaunch discovery assistant. The user seems frustrated or resistant. Acknowledge their feeling warmly and humanly — no platitudes or hollow phrases. In one sentence, explain why understanding ${FIELD_LABELS[field]} helps you give them a genuinely useful recommendation. Then ask the question again in a softer, more open way. Max 3 sentences total.`,
    messages: [
      ...priorMessages,
      { role: 'user', content: userMessage },
    ],
  });
}

/**
 * generateClarificationResponse
 *
 * Streams a gentle clarification request when the user's latest answer
 * contradicts a previously captured high-confidence value for the same field.
 */
export function generateClarificationResponse(
  userMessage:          string,
  field:                DiscoveryContextField,
  currentBelief:        FieldBelief,
  conversationHistory?: string,
) {
  const existing      = currentBelief.value != null ? JSON.stringify(currentBelief.value) : 'something';
  const priorMessages = conversationHistory ? parseHistory(conversationHistory) : [];
  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system: `You are the NeuraLaunch discovery assistant. The user's latest answer about ${FIELD_LABELS[field]} seems to contradict what they said earlier (${existing}). Surface this gently: "Earlier you mentioned ${existing}, but now it sounds like [new thing] — just want to make sure I understand correctly. Which reflects your situation better?" Keep it to 2 sentences.`,
    messages: [
      ...priorMessages,
      { role: 'user', content: userMessage },
    ],
  });
}
