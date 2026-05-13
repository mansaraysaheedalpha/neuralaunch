'use client';

import { Stage2Chat } from './Stage2Chat';
import type { Stage2Message } from './useStage2Session';
import type { SkillInventory } from '@/lib/ideation';

interface Stage2ChatClientProps {
  sessionId:            string;
  stageRunId:           string;
  firstName:            string;
  initialMessages:      Stage2Message[];
  inventory:            SkillInventory;
  hasExpectedProfile:   boolean;
  requiresRederivation: boolean;
}

/**
 * Thin client wrapper that mounts Stage2Chat. Mirrors the
 * Stage1ChatClient pattern — keeps the page server component free
 * of streaming machinery.
 */
export function Stage2ChatClient(props: Stage2ChatClientProps) {
  return <Stage2Chat {...props} />;
}
