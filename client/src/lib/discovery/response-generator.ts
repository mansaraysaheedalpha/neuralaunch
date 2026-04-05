// src/lib/discovery/response-generator.ts
// Streams conversational responses for edge-case user inputs:
// off-topic questions, frustration, contradictions, and pricing-change follow-ups.
import 'server-only';
import { streamText } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { DiscoveryContextField } from './context-schema';
import { MODELS } from './constants';
import type { AudienceType } from './constants';
import { parseHistory, buildSystem, FIELD_LABELS } from './question-generator';

type FieldBelief = { value: unknown; confidence: number };

/**
 * generateClarificationConfirmation
 *
 * Streams a 1-2 sentence response when the user is asking whether they
 * understood the question correctly, rather than answering it.
 * Confirms or corrects their interpretation, then re-asks in simpler terms.
 * No state advance — the session stays on the same field.
 */
export function generateClarificationConfirmation(
  userMessage:          string,
  originalQuestion:     string,
  field:                DiscoveryContextField,
  conversationHistory?: string,
  audienceType?:        AudienceType,
) {
  const system        = buildSystem(audienceType);
  const priorMessages = conversationHistory ? parseHistory(conversationHistory) : [];
  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system,
    messages: [
      ...priorMessages,
      {
        role:    'user',
        content: `The person is checking whether they understood your question correctly before answering.
Their message: "${userMessage}"
The question you asked was about: ${FIELD_LABELS[field]}
The original question: "${originalQuestion}"

Respond in 1-2 sentences:
- If their interpretation is correct: confirm it warmly and briefly, then invite them to answer.
- If their interpretation is off: gently correct it and restate the question in simpler, more direct language.
Do not repeat the question word-for-word. Do not praise them for asking. Keep it natural and brief.`,
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
  userMessage:          string,
  phase:                string,
  questionCount:        number,
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

/**
 * generatePricingFollowUp
 *
 * Streams a single natural follow-up question when the engine detects a
 * historical pricing change in the user's answer. Captures three things:
 * the original price/model, the new price/model, and the observed effect.
 * Called immediately — same turn as the signal — before moving to the next field.
 */
export function generatePricingFollowUp(
  userMessage:          string,
  conversationHistory?: string,
  audienceType?:        AudienceType,
) {
  const system        = buildSystem(audienceType);
  const priorMessages = conversationHistory ? parseHistory(conversationHistory) : [];
  return streamText({
    model:  aiSdkAnthropic(MODELS.INTERVIEW),
    system,
    messages: [
      ...priorMessages,
      {
        role:    'user',
        content: `The person just mentioned a pricing change in their answer: "${userMessage}"

Ask ONE follow-up question — in a single sentence — that captures all three things we need to know:
1. What was the price or pricing model before the change
2. What is it now (or what did they change it to)
3. What observable effect, if any, did the change have on their business

The question must feel like a natural continuation of what they just said — not a pivot. Reference their specific words. Do not ask three separate questions. Weave the three into one direct, conversational sentence.`,
      },
    ],
  });
}
