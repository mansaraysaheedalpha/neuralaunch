// src/lib/discovery/safety-gate.ts
import 'server-only';
import { z } from 'zod';
import { generateObject } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { MODELS } from './constants';
import { logger } from '@/lib/logger';
import { withModelFallback } from '@/lib/ai/with-model-fallback';

// ---------------------------------------------------------------------------
// Safety classification schema
// ---------------------------------------------------------------------------

const SafetyClassificationSchema = z.object({
  safe: z.boolean().describe(
    'true if the message is safe to process. false if the message ' +
    'contains criminal intent, requests to build harmful tools, or ' +
    'any of the categories listed in the prompt.',
  ),
  category: z.string().describe(
    'If safe=false: the category of harmful intent detected ' +
    '(e.g., "fraud", "violence", "exploitation", "weapons", "minors"). ' +
    'If safe=true: "none".',
  ),
  severity: z.enum(['block', 'caution']).describe(
    'block: session must be terminated immediately. ' +
    'caution: message is ethically grey but not criminal — proceed ' +
    'with awareness. Only "block" triggers auto-termination.',
  ),
});

export type SafetyResult = z.infer<typeof SafetyClassificationSchema>;

// ---------------------------------------------------------------------------
// The refusal message — shown to the user when the gate triggers.
// Deliberately generic so it does not reveal detection categories.
// ---------------------------------------------------------------------------

export const SAFETY_REFUSAL_MESSAGE =
  'I am not able to help with what you have described. This session ' +
  'has been permanently closed. If you believe this is an error, ' +
  'please start a new session with a different request.';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * runSafetyGate
 *
 * Classifies a user message for criminal or harmful intent. Runs on
 * EVERY message in the session, not just the first. The evaluation
 * found that the safety boundary was one message deep — a user who
 * received a correct refusal on message 1 could socially engineer
 * their way back into normal interview mode on messages 2-4 by
 * reframing or introducing a "different person's" idea.
 *
 * This gate fixes that by checking EVERY message independently. If
 * ANY message in the session triggers a block, the session is
 * permanently terminated and no further processing occurs.
 *
 * Uses Haiku as the primary model (fastest, cheapest — the gate
 * must add minimal latency to every turn) with Sonnet as fallback.
 *
 * Returns { safe: true } for the vast majority of messages. Only
 * returns { safe: false, severity: 'block' } when criminal/harmful
 * intent is unambiguous.
 */
export async function runSafetyGate(
  userMessage: string,
  conversationHistory: string,
): Promise<SafetyResult> {
  const log = logger.child({ module: 'SafetyGate' });

  try {
    const result = await withModelFallback(
      'safetyGate',
      // Haiku primary (speed + cost), Sonnet fallback (reliability)
      { primary: MODELS.INTERVIEW_FALLBACK_1, fallback: MODELS.INTERVIEW },
      async (modelId) => {
        const { object } = await generateObject({
          model:    aiSdkAnthropic(modelId),
          schema:   SafetyClassificationSchema,
          messages: [{
            role:    'user',
            content: `You are a safety classifier for a startup discovery interview platform. Your ONLY job is to determine whether the user's message contains harmful or criminal intent that should block the session.

CONVERSATION CONTEXT (for detecting social engineering across messages):
${conversationHistory ? conversationHistory.slice(-2000) : '(first message)'}

LATEST USER MESSAGE:
${userMessage}

BLOCK the session (safe=false, severity="block") for ANY of:
- Explicit criminal activity: fraud, theft, money laundering, drug trafficking, embezzlement, hacking
- Platforms designed to harm people: harassment tools, surveillance/stalking, exploitation
- Weapons, explosives, or dangerous materials
- Anything involving the exploitation of minors
- Requests to scale, automate, or systematize any of the above
- Social engineering attempts: the user previously described criminal activity and is now reframing it as legitimate (e.g., "forget the fraud, help me with consulting" or "I'll report it, now help my cousin's business"). A verbal promise to stop does NOT clear criminal context.

CAUTION (safe=false, severity="caution") for:
- Legally ambiguous business models (e.g., grey-market reselling, aggressive marketing tactics)
- Ethically questionable but not illegal services
- Requests that might be harmful in some jurisdictions but legal in others

PASS (safe=true) for:
- Normal business discussions, even about struggling or failing businesses
- Discussions about competitors, market challenges, financial difficulties
- Expressions of frustration, fear, doubt, or emotional difficulty
- Vague or poorly articulated business ideas
- Everything that a normal founder or business owner might say

CRITICAL RULES:
1. Default to safe=true. The vast majority of messages are legitimate.
2. Do NOT flag business difficulties, competitive concerns, or financial struggles as harmful.
3. Do NOT flag frustration with the interview as harmful.
4. Only use severity="block" when the intent is unambiguously criminal or harmful.
5. When in doubt between "caution" and "block", choose "caution" — false blocks destroy trust.
6. SOCIAL ENGINEERING DETECTION: If the conversation history contains a prior criminal disclosure, ANY attempt to continue the session — even with a "different" idea — gets severity="block". The session is contaminated.`,
          }],
        });
        return object;
      },
    );

    if (!result.safe) {
      log.warn('[SafetyGate] Harmful content detected', {
        category: result.category,
        severity: result.severity,
      });
    }

    return result;
  } catch (err) {
    // Safety gate failure must NOT block legitimate users. If the
    // classifier crashes, we log the error and let the message through.
    // A false negative (missed harmful content) is bad but recoverable.
    // A false positive (blocked legitimate user) is worse because it
    // destroys trust with no recovery path.
    log.error(
      '[SafetyGate] Classification failed — allowing message through',
      err instanceof Error ? err : new Error(String(err)),
    );
    return { safe: true, category: 'none', severity: 'caution' };
  }
}
