import type {
  ComposerChannel,
  ComposerMode,
} from "@/lib/roadmap/composer/constants";
import type { OutreachContext } from "@/lib/roadmap/composer/schemas";

export interface ComposerContextChatProps {
  roadmapId: string;
  taskId: string;
  standalone?: boolean;
  initialDraft?: string;
  onContextComplete: (
    context: OutreachContext,
    mode: ComposerMode,
    channel: ComposerChannel,
  ) => void;
  onCancel: () => void;
}
