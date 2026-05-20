'use client';

import { useState, useTransition, useRef, type FormEvent, type ChangeEvent } from 'react';
import { ImagePlus, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ALLOWED_SCREENSHOT_CONTENT_TYPES,
  MAX_SCREENSHOT_BYTES,
  type AllowedScreenshotContentType,
} from '@/lib/ideation/stage4-opportunities/constants';

export interface SubmitTextArgs   { opportunityId: string; pastedText: string }
export interface SubmitImageArgs  { opportunityId: string; s3Key: string; s3Url: string }

export interface CommunityResponseUploaderProps {
  opportunityId: string;
  disabled?:     boolean;
  /** Hits POST /community-response with source='text_paste'. */
  onSubmitText:  (args: SubmitTextArgs) => Promise<void>;
  /** Two-step: presign → S3 PUT → submit s3Key. */
  onPresign:     (input: { opportunityId: string; contentType: AllowedScreenshotContentType }) => Promise<{ uploadUrl: string; s3Key: string; s3Url: string }>;
  onSubmitImage: (args: SubmitImageArgs) => Promise<void>;
}

/**
 * Founder-input surface for capturing community-engagement responses.
 * Two paths: paste comment text directly, or upload a screenshot of
 * the thread. Screenshot flow uses presigned S3 PUT (browser → S3
 * directly; the file never touches our server) and then submits the
 * s3Key + s3Url so the route can fire the vision pipeline.
 */
export function CommunityResponseUploader({
  opportunityId,
  disabled,
  onSubmitText,
  onPresign,
  onSubmitImage,
}: CommunityResponseUploaderProps) {
  const [mode, setMode] = useState<'text' | 'screenshot'>('text');
  const [text, setText] = useState('');
  const [busy, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmitText = !disabled && !busy && text.trim().length > 0;

  const submitText = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmitText) return;
    startTransition(async () => {
      setError(null);
      try {
        await onSubmitText({ opportunityId, pastedText: text.trim() });
        setText('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save response');
      }
    });
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);

    if (!(ALLOWED_SCREENSHOT_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setError('Only PNG, JPEG, or WebP screenshots are supported.');
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError(`Screenshot is too large (max ${Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)} MB).`);
      return;
    }

    setUploading(true);
    try {
      const { uploadUrl, s3Key, s3Url } = await onPresign({
        opportunityId,
        contentType: file.type as AllowedScreenshotContentType,
      });
      const putRes = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': file.type },
        body:    file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (HTTP ${putRes.status}). Try again, or paste the comments as text.`);
      }
      await onSubmitImage({ opportunityId, s3Key, s3Url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card/40 px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <ModeTab active={mode === 'text'}        onClick={() => setMode('text')}        icon={<FileText className="size-3" />}  label="Paste text" />
        <ModeTab active={mode === 'screenshot'}  onClick={() => setMode('screenshot')}  icon={<ImagePlus className="size-3" />} label="Upload screenshot" />
      </div>

      {mode === 'text' ? (
        <form onSubmit={submitText} className="space-y-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={disabled || busy}
            maxLength={2400}
            rows={3}
            placeholder="Paste the comment text you got back. Keep handles in if they were visible."
            className="w-full resize-none rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
          />
          {error && <div className="text-xs text-destructive">{error}</div>}
          <Button type="submit" size="sm" disabled={!canSubmitText} className="w-full">
            {busy ? 'Saving…' : 'Add text response'}
          </Button>
        </form>
      ) : (
        <div className="space-y-2">
          <label className={`block rounded-md border border-dashed px-3 py-4 text-center text-xs ${disabled || uploading ? 'border-border text-muted-foreground' : 'border-border text-foreground hover:bg-card/30 cursor-pointer'}`}>
            <input
              ref={fileRef}
              type="file"
              accept={ALLOWED_SCREENSHOT_CONTENT_TYPES.join(',')}
              disabled={disabled || uploading}
              onChange={e => void handleFile(e)}
              className="sr-only"
            />
            {uploading ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Uploading…</span>
            ) : (
              <>
                <ImagePlus className="size-5 mx-auto mb-1 text-muted-foreground" />
                <span className="block">Click to upload a screenshot (PNG / JPEG / WebP, up to {Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)} MB)</span>
              </>
            )}
          </label>
          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>
      )}
    </div>
  );
}

interface ModeTabProps { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }
function ModeTab({ active, onClick, icon, label }: ModeTabProps) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs';
  const cls  = active ? `${base} bg-primary/10 text-primary font-medium` : `${base} bg-card/40 text-muted-foreground hover:text-foreground`;
  return (
    <button type="button" onClick={onClick} className={cls} aria-pressed={active}>
      {icon}{label}
    </button>
  );
}
