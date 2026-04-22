// src/app/(app)/tools/composer-handoff.ts
//
// Client-side helpers for the Composer → Coach handoff. When a
// founder clicks "Prepare for this conversation →" on a generated
// outreach message, the Coach needs to know which message they're
// about to follow up on so its setup chat can land pre-populated
// instead of empty.
//
// Mirror of packager-handoff.ts but sourced from a composer session
// and a specific messageId. Keeping them separate files rather than
// one shared handoff module so each tool owns its own source shape
// and can evolve independently.

import type { ComposerSession, ComposerMessage } from '@/lib/roadmap/composer/schemas';

export interface ComposerHandoff {
  session: ComposerSession;
  message: ComposerMessage;
}

/**
 * Read fromComposer + messageId + roadmapId from window.location.search.
 * Returns null when any are absent — receiving tools should degrade
 * gracefully to their usual empty-state.
 */
export function readComposerHandoffParams(): {
  roadmapId: string;
  sessionId: string;
  messageId: string;
} | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('fromComposer');
  const messageId = params.get('messageId');
  const roadmapId = params.get('roadmapId');
  if (!sessionId || !messageId || !roadmapId) return null;
  return { sessionId, messageId, roadmapId };
}

/**
 * Fetch the composer session by id and find the referenced message
 * inside it. Returns null on any fetch failure OR when the messageId
 * no longer resolves (founder regenerated the message after linking).
 */
export async function fetchComposerHandoff(
  roadmapId: string,
  sessionId: string,
  messageId: string,
): Promise<ComposerHandoff | null> {
  try {
    const res = await fetch(
      `/api/discovery/roadmaps/${roadmapId}/composer/sessions/${sessionId}`,
      { headers: { 'Accept': 'application/json' } },
    );
    if (!res.ok) return null;
    const json = await res.json() as { session: ComposerSession };
    const message = json.session.output?.messages.find(m => m.id === messageId);
    if (!message) return null;
    return { session: json.session, message };
  } catch {
    return null;
  }
}

/**
 * Build the founder's first message for the Conversation Coach's
 * setup chat when arriving from a Composer → Coach handoff. Pulls
 * the recipient name + what the outreach is about so the Coach can
 * frame the rehearsal against the real conversation the founder is
 * about to have.
 */
export function buildCoachSeedFromComposerMessage(handoff: ComposerHandoff): string {
  const { session, message } = handoff;
  const activeBody    = message.variations?.at(-1)?.body ?? message.body;
  const recipientHint = message.recipientPlaceholder ?? 'the recipient';
  const channelLabel  = session.channel === 'whatsapp' ? 'WhatsApp'
    : session.channel === 'linkedin' ? 'LinkedIn'
    : session.channel === 'email'    ? 'email'
    : session.channel;

  const targetLine = session.context.targetDescription
    ? ` (${session.context.targetDescription})`
    : '';

  // Trim the message body — the Coach only needs the gist to anchor
  // the rehearsal, not the full draft.
  const bodyPreview = activeBody.length > 500
    ? `${activeBody.slice(0, 500)}…`
    : activeBody;

  return `I just drafted an outreach message over ${channelLabel} to ${recipientHint}${targetLine}. Here is the message I sent:

${bodyPreview}

Help me prepare for the conversation that follows if they reply — what they are likely to ask, where I'll stumble, and how I close toward my goal: ${session.context.goal || 'moving them to a first meeting or commitment'}.`;
}
