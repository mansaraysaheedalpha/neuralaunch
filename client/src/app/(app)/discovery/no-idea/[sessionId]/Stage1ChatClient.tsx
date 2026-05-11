'use client';

import { Stage1Chat } from './Stage1Chat';
import type { Stage1Message } from './useStage1Session';

interface Stage1ChatClientProps {
  sessionId:        string;
  firstName:        string;
  initialMessages:  Stage1Message[];
  editingDimension: 'timeHorizon' | 'financialGoal' | 'riskTolerance' | 'lifestylePreference' | null;
  hasPriorSnapshot: boolean;
  documentLoadError?: boolean;
}

/**
 * Thin client wrapper that mounts Stage1Chat. Mirrors the
 * DiscoveryChatClient pattern in /discovery — keeps the page server
 * component free of useState / useEffect / streaming machinery.
 */
export function Stage1ChatClient(props: Stage1ChatClientProps) {
  return <Stage1Chat {...props} />;
}
