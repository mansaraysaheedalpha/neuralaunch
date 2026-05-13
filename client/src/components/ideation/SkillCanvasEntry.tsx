'use client';

import { LayoutGrid, FileText, MessageSquare } from 'lucide-react';

export type SkillCanvasEntryMode = 'canvas' | 'prose' | 'chat';

interface SkillCanvasEntryProps {
  /** Called with the chosen mode. The parent owns mode state after. */
  onChoose: (mode: SkillCanvasEntryMode) => void;
}

/**
 * Mode selector shown on the first Stage 2 turn (before the founder
 * has touched the canvas or sent a message). Three entry surfaces —
 * canvas direct manipulation, prose self-description, pure
 * conversational chat. Whatever they pick, the canvas remains the
 * single source of truth across all three modes.
 *
 * TODO(copy): final wording on the headers + descriptions pending
 * product-voice approval.
 */
export function SkillCanvasEntry({ onChoose }: SkillCanvasEntryProps) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">How do you want to start?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick whichever feels natural. We can switch surfaces anytime — the canvas updates from prose and chat too.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ModeCard
          icon={<LayoutGrid className="size-5" />}
          label="Sort the chips"
          description="Drag each of the 14 skills into Good, Acceptable, Bad, or set aside. Fast if you know your levels."
          onClick={() => onChoose('canvas')}
        />
        <ModeCard
          icon={<FileText className="size-5" />}
          label="Describe yourself"
          description="Write a paragraph or two about what you're good and bad at. We'll fill in the canvas from your words."
          onClick={() => onChoose('prose')}
        />
        <ModeCard
          icon={<MessageSquare className="size-5" />}
          label="Just chat with me"
          description="The agent asks you about your experience one skill at a time. Slower, but you don't have to self-assess in a vacuum."
          onClick={() => onChoose('chat')}
        />
      </div>
    </div>
  );
}

function ModeCard({
  icon,
  label,
  description,
  onClick,
}: {
  icon:        React.ReactNode;
  label:       string;
  description: string;
  onClick:     () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-xl border border-border bg-card/70 hover:bg-card hover:border-primary/40 px-4 py-4 transition-colors"
    >
      <div className="text-primary group-hover:scale-110 transition-transform mb-2">
        {icon}
      </div>
      <div className="text-sm font-medium text-foreground group-hover:text-primary">
        {label}
      </div>
      <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
        {description}
      </div>
    </button>
  );
}
