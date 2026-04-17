'use client';

import * as React from 'react';
import { AlertTriangle, RotateCcw, Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * VoiceTranscriptionReview — displays the transcribed text in an editable
 * textarea with Send, Edit, and Re-record controls. Matches the "edit before
 * send" principle from § 2.3 of the voice spec.
 *
 * The component is lightly controlled: it holds its own edit buffer seeded
 * from `transcription`. Parents reset the buffer by changing the
 * `transcription` prop (e.g. after a fresh recording).
 */

export interface VoiceTranscriptionReviewProps {
  transcription:  string;
  confidence?:    number;
  onSend:         (text: string) => void;
  onRecordAgain:  () => void;
  /** Called whenever the user edits the buffer. Optional. */
  onEdit?:        (text: string) => void;
  disabled?:      boolean;
  className?:     string;
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;

export function VoiceTranscriptionReview({
  transcription,
  confidence,
  onSend,
  onRecordAgain,
  onEdit,
  disabled,
  className,
}: VoiceTranscriptionReviewProps) {
  const [text, setText]        = React.useState(transcription);
  const [editing, setEditing]  = React.useState(false);
  const textareaRef            = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    setText(transcription);
    setEditing(false);
  }, [transcription]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    onEdit?.(e.target.value);
  };

  const enterEditMode = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  const canSend    = text.trim().length > 0 && !disabled;
  const lowConfidence =
    typeof confidence === 'number' && confidence < LOW_CONFIDENCE_THRESHOLD;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        readOnly={!editing}
        disabled={disabled}
        aria-label="Voice transcription"
        className={cn(
          'min-h-[96px]',
          !editing && 'bg-muted/30',
        )}
      />

      {lowConfidence && (
        <p className="inline-flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-destructive/80" aria-hidden />
          <span>The transcription may contain errors. Please review before sending.</span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onSend(text)}
          disabled={!canSend}
          className="gap-1.5"
        >
          <Send className="size-3.5" aria-hidden />
          Send
        </Button>

        {!editing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={enterEditMode}
            disabled={disabled}
          >
            Edit
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRecordAgain}
          disabled={disabled}
          className="ml-auto gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Re-record
        </Button>
      </div>
    </div>
  );
}
