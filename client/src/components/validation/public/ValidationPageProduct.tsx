'use client';
// src/components/validation/public/ValidationPageProduct.tsx

import { useState } from 'react';
import type { ValidationPageContent } from '@/lib/validation/schemas';
import { FeatureInterestPanel } from './FeatureInterestPanel';
import { SignupForm }           from './SignupForm';
import { SurveyWidget }         from './SurveyWidget';
import { PageViewTracker }      from './PageViewTracker';

interface ValidationPageProductProps {
  content:  ValidationPageContent;
  pageSlug: string;
}

/**
 * ValidationPageProduct
 *
 * Layout variant for software / platform / SaaS ideas.
 * Structure: Hero → Problem → Features → CTA → Entry survey (post-signup).
 */
export function ValidationPageProduct({ content, pageSlug }: ValidationPageProductProps) {
  const [signedUp,       setSignedUp]       = useState(false);
  const [surveyComplete, setSurveyComplete] = useState(false);
  const [showExitSurvey, setShowExitSurvey] = useState(false);

  function handleSignup() {
    setSignedUp(true);
  }

  function handleExitIntent() {
    if (!signedUp) setShowExitSurvey(true);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PageViewTracker pageSlug={pageSlug} onExitIntent={handleExitIntent} />

      {/* Exit-intent survey overlay */}
      {showExitSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-6">
          <div className="w-full max-w-md">
            <SurveyWidget
              question={content.exitSurveyQuestion}
              options={content.exitSurveyOptions}
              pageSlug={pageSlug}
              surveyKey="exit"
              onDone={() => setShowExitSurvey(false)}
            />
            <button
              type="button"
              onClick={() => setShowExitSurvey(false)}
              className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="mx-auto max-w-2xl px-6 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
          {content.headline}
        </h1>
        <p className="mt-4 text-base text-muted-foreground leading-relaxed">
          {content.subheadline}
        </p>
      </section>

      {/* Problem + Solution */}
      <section className="mx-auto max-w-2xl px-6 pb-10 flex flex-col gap-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">The Problem</h2>
          <p className="text-sm text-foreground leading-relaxed">{content.problemStatement}</p>
        </div>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary/70">The Solution</h2>
          <p className="text-sm text-foreground leading-relaxed">{content.solutionStatement}</p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-2xl px-6 pb-12 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-muted-foreground">What we're building — tell us what matters to you</h2>
        <FeatureInterestPanel features={content.features} pageSlug={pageSlug} />
      </section>

      {/* CTA / Signup */}
      <section className="mx-auto max-w-2xl px-6 pb-12">
        {!signedUp ? (
          <SignupForm
            ctaHeadline={content.ctaHeadline}
            ctaButtonLabel={content.ctaButtonLabel}
            ctaPlaceholder={content.ctaPlaceholder}
            pageSlug={pageSlug}
            onSignup={handleSignup}
          />
        ) : !surveyComplete ? (
          <SurveyWidget
            question={content.entrySurveyQuestion}
            options={content.entrySurveyOptions}
            pageSlug={pageSlug}
            surveyKey="entry"
            onDone={() => setSurveyComplete(true)}
          />
        ) : (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-6 py-5 text-center">
            <p className="text-sm font-medium text-primary">You're all set. We'll be in touch.</p>
          </div>
        )}
      </section>
    </main>
  );
}
