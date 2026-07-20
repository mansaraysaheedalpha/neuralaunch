import type { ConversationSetup } from "@/lib/roadmap/coach";

export interface CoachSetupChatProps {
  roadmapId: string;
  taskId: string;
  initialDraft?: string;
  standalone?: boolean;
  onSetupComplete: (setup: ConversationSetup, sessionId?: string) => void;
  onCancel: () => void;
}

export interface RolePlayChatProps {
  roadmapId: string;
  taskId: string;
  otherPartyName: string;
  standalone?: boolean;
  sessionId?: string;
  onEnd: () => void;
  onToolCallComplete?: () => void;
}
