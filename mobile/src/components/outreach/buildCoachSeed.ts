// src/components/outreach/buildCoachSeed.ts
//
// Client-side mirror of web's buildCoachSeedFromComposerMessage
// (client/src/app/(app)/tools/composer-handoff.ts). When a founder
// taps "Prepare for this conversation" on a Composer message, we
// want the Coach's setup chat to land pre-populated with the context
// of the outreach they just drafted instead of a blank prompt.
//
// Mobile builds the seed client-side because:
//   - the ComposerOutput already has the message + channel + context
//     everything we need
//   - avoids a round-trip through a standalone-sessions endpoint mobile
//     doesn't otherwise need
//   - keeps the handoff purely navigational (URL param only)
//
// Keep the structure and copy aligned with the web helper so the
// founder's experience reads the same across platforms.

import type { ComposerMessage } from './ComposerMessageCard';

interface ComposerContextLike {
  goal?:              string | null;
  targetDescription?: string | null;
}

interface BuildSeedInput {
  message:       ComposerMessage;
  channel:       string; // 'whatsapp' | 'linkedin' | 'email' | etc.
  context?:      ComposerContextLike | null;
}

function channelLabel(channel: string): string {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'linkedin') return 'LinkedIn';
  if (channel === 'email')    return 'email';
  return channel;
}

export function buildCoachSeedFromComposerMessage({
  message,
  channel,
  context,
}: BuildSeedInput): string {
  const activeBody    = message.variations?.at(-1)?.body ?? message.body;
  const recipientHint = message.recipientPlaceholder ?? 'the recipient';
  const targetLine    = context?.targetDescription
    ? ` (${context.targetDescription})`
    : '';

  // Trim the message body — the Coach only needs the gist to anchor
  // the rehearsal, not the full draft. Matches the 500-char ceiling
  // used by the web helper.
  const bodyPreview = activeBody.length > 500
    ? `${activeBody.slice(0, 500)}…`
    : activeBody;

  const goalLine = context?.goal || 'moving them to a first meeting or commitment';

  return `I just drafted an outreach message over ${channelLabel(channel)} to ${recipientHint}${targetLine}. Here is the message I sent:

${bodyPreview}

Help me prepare for the conversation that follows if they reply — what they are likely to ask, where I'll stumble, and how I close toward my goal: ${goalLine}.`;
}
