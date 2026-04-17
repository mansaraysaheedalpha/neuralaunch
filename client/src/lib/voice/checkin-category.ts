/**
 * Voice-transcription → check-in category auto-suggestion.
 *
 * Spec § 8.2: after transcription, pre-select the category based on
 * keywords in the transcribed text. The founder can still override
 * before submitting.
 *
 * Keyword lists are intentionally short and literal. The goal is
 * surfacing a sensible default, not perfect classification — anything
 * smarter (LLM classification, for instance) would be overkill for a
 * hint the founder can override with one tap.
 */

// Local copy of the CheckInForm category union. Importing from the
// form component would create a client → server → client cycle in the
// Next.js module graph; the union is small and rarely changes, so a
// local declaration is the pragmatic choice here.
type CheckInCategory = 'completed' | 'blocked' | 'unexpected' | 'question';

const BLOCKED_HINTS = [
  'blocked',
  'stuck',
  "can't figure out",
  'cannot figure out',
  "can't work out",
  'no idea how',
  "don't know how to",
  'need help',
];

const COMPLETED_HINTS = [
  'finished',
  'done',
  'completed',
  'wrapped up',
  'shipped it',
  'shipped',
  'got it done',
];

export function suggestCheckInCategory(transcription: string): CheckInCategory | null {
  const text = transcription.toLowerCase();
  if (!text.trim()) return null;

  for (const phrase of BLOCKED_HINTS) {
    if (text.includes(phrase)) return 'blocked';
  }
  for (const phrase of COMPLETED_HINTS) {
    if (text.includes(phrase)) return 'completed';
  }
  return null;
}
