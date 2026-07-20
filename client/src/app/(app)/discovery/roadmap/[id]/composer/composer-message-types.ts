import type { ComposerMessage } from "@/lib/roadmap/composer/schemas";
export interface ComposerMessageCardProps {
  message: ComposerMessage;
  roadmapId: string;
  taskId: string;
  sessionId?: string;
  isSent: boolean;
  onMarkSent: (id: string) => void;
  onRegenerate: (id: string, instruction: string) => void;
  isRecommended?: boolean;
}
