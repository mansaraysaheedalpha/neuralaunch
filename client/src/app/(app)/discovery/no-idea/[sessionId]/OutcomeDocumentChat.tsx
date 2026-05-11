'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OutcomeDocumentChatProps {
  sessionId: string;
  /** When true, renders the affordance disabled with a Coming Soon
   *  tooltip. The stub is the only mode shipped in this batch — the
   *  scoped ask-chat itself lives in a follow-up. */
  disabled: boolean;
}

/**
 * Stub for "Ask a question about this".
 *
 * Approved scope (2026-05-11): render the affordance as a visible-but-
 * disabled button so the founder can see what's coming. The real
 * implementation needs its own prompt, rate limit, persistence model,
 * and CSRF route — it lives in a follow-up batch with its own brief.
 *
 * sessionId is captured here so the future implementation has the
 * session context it'll need; today's render reads nothing from it.
 */
export function OutcomeDocumentChat({ sessionId: _sessionId, disabled }: OutcomeDocumentChatProps) {
  if (!disabled) {
    // Real implementation not yet shipped — guard against an
    // accidental enabled prop slipping through during follow-up work.
    throw new Error('OutcomeDocumentChat: only the disabled stub is implemented in this batch');
  }

  return (
    <Button
      variant="ghost"
      disabled
      title="Coming soon"
      aria-label="Ask a question about this — coming soon"
      className="text-muted-foreground"
    >
      <MessageCircle className="size-4 mr-1" />
      Ask a question about this
    </Button>
  );
}
