'use client';

import type { OpportunityEvaluation, CommunityResponse } from '@/lib/ideation/stage4-opportunities/schema';
import type { AllowedScreenshotContentType } from '@/lib/ideation/stage4-opportunities/constants';
import { TestScriptViewer } from './TestScriptViewer';
import { CommunityResponseUploader } from './CommunityResponseUploader';
import { ResponseGallery } from './ResponseGallery';
import { VALIDATION_STRENGTH_LABELS } from './labels';

export interface LayerBSectionProps {
  opportunity:   OpportunityEvaluation;
  responses:     CommunityResponse[];
  generating:    boolean;
  readOnly?:     boolean;
  onGenerate?:   () => Promise<void>;
  onSubmitText?: (args: { opportunityId: string; pastedText: string }) => Promise<void>;
  onPresign?:    (input: { opportunityId: string; contentType: AllowedScreenshotContentType }) => Promise<{ uploadUrl: string; s3Key: string; s3Url: string }>;
  onSubmitImage?: (args: { opportunityId: string; s3Key: string; s3Url: string }) => Promise<void>;
  onRemoveResponse?: (id: string) => Promise<void>;
}

/**
 * Layer B founder-community-engagement surface. Composes the test
 * script viewer (with regenerate), the uploader (text or screenshot
 * via S3 presign), and the gallery of captured responses. Aggregate
 * signal (validationStrength + sentiment counts) is summarised at
 * the bottom when at least one response has been extracted.
 */
export function LayerBSection({
  opportunity,
  responses,
  generating,
  readOnly,
  onGenerate,
  onSubmitText,
  onPresign,
  onSubmitImage,
  onRemoveResponse,
}: LayerBSectionProps) {
  const sig = opportunity.layerBExtractedSignal;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Layer B · community engagement
        </p>
        <p className="max-w-[680px] text-[13px] leading-[1.55] text-fg-2">
          Post the script below on your own accounts, then bring back what real people said. Text snippets or screenshots both work.
        </p>
      </header>

      <TestScriptViewer
        script={opportunity.layerBScript}
        generating={generating}
        readOnly={readOnly}
        onGenerate={onGenerate}
      />

      {!readOnly && opportunity.layerBScript !== null && onSubmitText && onPresign && onSubmitImage && (
        <CommunityResponseUploader
          opportunityId={opportunity.id}
          onSubmitText={onSubmitText}
          onPresign={onPresign}
          onSubmitImage={onSubmitImage}
        />
      )}

      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-2">
          Captured responses · <span className="text-accent">{responses.length}</span>
        </p>
        <ResponseGallery
          responses={responses}
          readOnly={readOnly}
          onRemove={onRemoveResponse}
        />
      </div>

      {sig && (
        <div className="border-l-2 border-accent bg-bg px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span className="text-fg">
            Aggregate · {VALIDATION_STRENGTH_LABELS[sig.validationStrength]}
          </span>
          {' · '}
          <span className="text-success">{sig.sentimentBreakdown.positive} positive</span>
          {' · '}
          {sig.sentimentBreakdown.neutral} neutral
          {' · '}
          <span className="text-amber">{sig.sentimentBreakdown.negative} negative</span>
          {sig.contradictionsRaised.length > 0 && (
            <span className="ml-1 text-amber">· {sig.contradictionsRaised.length} contradictions</span>
          )}
        </div>
      )}
    </section>
  );
}
