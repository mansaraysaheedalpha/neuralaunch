'use client';

import { Stage4Chat } from './Stage4Chat';
import type { Stage4Message } from './useStage4Session';
import type { Stage4AuthoringState } from '@/lib/ideation/stage4-opportunities/schema';

interface Stage4ChatClientProps {
  sessionId:       string;
  stageRunId:      string;
  firstName:       string;
  initialMessages: Stage4Message[];
  state:           Stage4AuthoringState;
}

/**
 * Thin client wrapper that mounts Stage4Chat. Mirrors the
 * Stage1/2/3 ChatClient pattern — keeps the page server component
 * free of streaming + canvas machinery.
 */
export function Stage4ChatClient(props: Stage4ChatClientProps) {
  return <Stage4Chat {...props} />;
}
