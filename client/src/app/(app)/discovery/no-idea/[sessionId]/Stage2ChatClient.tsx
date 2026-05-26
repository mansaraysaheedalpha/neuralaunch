'use client';

import { Stage2Chat } from './Stage2Chat';
import type { Stage2Message } from './useStage2Session';
import type {
  SkillInventory,
  ExpectedProfileEntry,
} from '@/lib/ideation/stage2-requirements/schema';

interface Stage2ChatClientProps {
  sessionId:            string;
  stageRunId:           string;
  firstName:            string;
  initialMessages:      Stage2Message[];
  inventory:            SkillInventory;
  /**
   * Derived Expected Profile entries from the authoring state. Null
   * when the founder hasn't fired the derive route yet. Surfaced
   * read-only inside the canvas column so the founder can compare
   * their inventory against what the outcome demands.
   */
  expectedProfile:      ExpectedProfileEntry[] | null;
  hasExpectedProfile:   boolean;
  requiresRederivation: boolean;
  showEntryPicker:      boolean;
}

/**
 * Thin client wrapper that mounts Stage2Chat. Mirrors the
 * Stage1ChatClient pattern — keeps the page server component free
 * of streaming machinery.
 */
export function Stage2ChatClient(props: Stage2ChatClientProps) {
  return <Stage2Chat {...props} />;
}
