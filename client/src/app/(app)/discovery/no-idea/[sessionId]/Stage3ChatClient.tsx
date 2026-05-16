'use client';

import { Stage3Chat } from './Stage3Chat';
import type { Stage3Message } from './useStage3Session';
import type { Stage3AuthoringState } from '@/lib/ideation/stage3-opportunities/schema';

interface Stage3ChatClientProps {
  sessionId:       string;
  stageRunId:      string;
  firstName:       string;
  initialMessages: Stage3Message[];
  state:           Stage3AuthoringState;
}

/**
 * Thin client wrapper that mounts Stage3Chat. Mirrors Stage1ChatClient
 * + Stage2ChatClient — keeps the page server component free of
 * streaming machinery.
 */
export function Stage3ChatClient(props: Stage3ChatClientProps) {
  return <Stage3Chat {...props} />;
}
