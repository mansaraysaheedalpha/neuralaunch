'use client';

import { useState } from 'react';
import { Image as ImageIcon, FileText, Trash2, AlertCircle } from 'lucide-react';
import type { CommunityResponse } from '@/lib/ideation/stage4-opportunities/schema';
import { ExtractionProgress } from './ExtractionProgress';

export interface ResponseGalleryProps {
  responses: CommunityResponse[];
  readOnly?: boolean;
  onRemove?: (responseId: string) => Promise<void>;
}

/**
 * Renders a list of captured community responses for one opportunity.
 * Text pastes show as small cards with the snippet + char count;
 * screenshots show as thumbnails + extracted-comment count or
 * extraction-status state. Failed moderations get an honest, actionable
 * error label rather than a generic "something went wrong".
 */
export function ResponseGallery({ responses, readOnly, onRemove }: ResponseGalleryProps) {
  if (responses.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-rule px-3 py-3 text-center text-xs text-muted">
        No responses captured yet. Post the script above on your own accounts and paste replies or upload screenshots back here.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {responses.map(r => (
        <ResponseRow key={r.id} response={r} readOnly={readOnly} onRemove={onRemove} />
      ))}
    </ul>
  );
}

interface ResponseRowProps {
  response: CommunityResponse;
  readOnly?: boolean;
  onRemove?: (id: string) => Promise<void>;
}

function ResponseRow({ response, readOnly, onRemove }: ResponseRowProps) {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    if (!onRemove) return;
    setRemoving(true);
    try {
      await onRemove(response.id);
    } catch {
      setRemoving(false);
    }
  };

  return (
    <li className="rounded-md border border-rule bg-bg-2/30 px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-muted" aria-hidden>
          {response.source === 'text_paste' ? <FileText className="size-4" /> : <ImageIcon className="size-4" />}
        </span>
        <div className="flex-1 min-w-0">
          {response.source === 'text_paste' ? (
            <p className="text-sm text-fg leading-snug line-clamp-3 whitespace-pre-wrap">
              {response.pastedText}
            </p>
          ) : (
            <ScreenshotSummary response={response} />
          )}
        </div>
        {!readOnly && onRemove && (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={removing}
            aria-label="Remove response"
            className="shrink-0 rounded p-1 text-muted hover:text-accent hover:bg-accent/5 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

function ScreenshotSummary({ response }: { response: CommunityResponse }) {
  // Vision pipeline outcomes drive different summaries:
  //   1. Still processing (no extractedAt yet, no moderation result)
  //   2. Moderation failed (either gate rejected or call threw)
  //   3. Extraction succeeded — show comment count + key quote count
  //   4. Extracted but unparseable — show note
  if (response.extractedAt === null && !response.moderationPassed && response.moderationReason === null) {
    return <ExtractionProgress />;
  }
  if (!response.moderationPassed) {
    return <ModerationFailureLabel reason={response.moderationReason} />;
  }
  const sig = response.extractedSignal;
  if (!sig) {
    // Unusual state — moderation passed but no signal captured.
    // Real-world this hits when the post-extract write fails.
    return <p className="text-xs italic text-muted">Screenshot processed but no comments extracted.</p>;
  }
  return (
    <div className="text-xs text-muted">
      <span className="text-fg font-medium">{sig.platformIdentified}</span>
      {' · '}
      {sig.comments.length} {sig.comments.length === 1 ? 'comment' : 'comments'}
      {sig.contradictionsToPain.length > 0 && (
        <span className="ml-1 text-amber-500">· {sig.contradictionsToPain.length} contradictions</span>
      )}
      {sig.unparseableNotes && (
        <p className="mt-1 italic text-amber-500">{sig.unparseableNotes}</p>
      )}
    </div>
  );
}

function ModerationFailureLabel({ reason }: { reason: string | null }) {
  // Founder-facing labels for vision-pipeline failures. Each names
  // WHERE in the pipeline the failure happened (moderation call vs
  // moderation rejection vs extraction) and gives an actionable
  // fallback — paste-as-text is the universal escape hatch.
  let title: string;
  let action: string;
  if (reason === 'moderation_call_failed') {
    title  = 'We couldn\'t check this screenshot.';
    action = 'The moderation service threw an error. Try uploading again in a moment.';
  } else if (reason === 'extraction_failed') {
    title  = 'We couldn\'t read this screenshot.';
    action = 'Extraction failed after the safety check passed. Try a clearer screenshot or paste the comments as text.';
  } else if (reason && reason.length > 0) {
    title  = 'Screenshot rejected.';
    action = reason;
  } else {
    title  = 'Screenshot not processed.';
    action = 'Try a different screenshot or paste the comments as text.';
  }
  return (
    <div className="flex items-start gap-1.5">
      <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
      <div className="text-xs">
        <p className="text-fg font-medium">{title}</p>
        <p className="text-muted">{action}</p>
      </div>
    </div>
  );
}
