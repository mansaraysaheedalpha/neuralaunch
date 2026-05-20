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
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-semibold text-foreground">Layer B — community engagement</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          You post the script below on your own accounts, then bring back what real people said. Text snippets or screenshots both work.
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
        <h4 className="text-xs font-semibold text-foreground mb-2">
          Captured responses{' '}
          <span className="text-muted-foreground">({responses.length})</span>
        </h4>
        <ResponseGallery
          responses={responses}
          readOnly={readOnly}
          onRemove={onRemoveResponse}
        />
      </div>

      {sig && (
        <div className="rounded-md border border-border bg-card/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="text-foreground font-medium">
            Aggregate: {VALIDATION_STRENGTH_LABELS[sig.validationStrength]}
          </span>
          {' · '}
          {sig.sentimentBreakdown.positive} positive · {sig.sentimentBreakdown.neutral} neutral · {sig.sentimentBreakdown.negative} negative
          {sig.contradictionsRaised.length > 0 && (
            <span className="ml-1 text-amber-500">· {sig.contradictionsRaised.length} contradictions</span>
          )}
        </div>
      )}
    </section>
  );
}
