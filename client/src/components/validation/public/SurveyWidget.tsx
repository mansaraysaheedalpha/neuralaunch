'use client';
// src/components/validation/public/SurveyWidget.tsx

import { useState } from 'react';

interface SurveyOption {
  id:    string;
  label: string;
}

interface SurveyWidgetProps {
  question:  string;
  options:   SurveyOption[];
  pageSlug:  string;
  surveyKey: 'entry' | 'exit';
  onDone:    () => void;
}

/**
 * SurveyWidget
 *
 * Single-select survey with one question and up to four options.
 * Used for both entry (shown after signup) and exit-intent (scroll-away) surveys.
 * Fires a best-effort analytics event on submission.
 */
export function SurveyWidget({
  question,
  options,
  pageSlug,
  surveyKey,
  onDone,
}: SurveyWidgetProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [done,     setDone]     = useState(false);

  async function handleSubmit() {
    if (!selected) return;
    try {
      await fetch('/api/lp/analytics', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          slug:      pageSlug,
          event:     'survey_response',
          surveyKey,
          answerId:  selected,
          answer:    options.find(o => o.id === selected)?.label ?? selected,
          question,
        }),
      });
    } catch { /* non-fatal */ }
    setDone(true);
    onDone();
  }

  if (done) {
    return (
      <div className="rounded-xl border border-rule bg-bg-2 px-5 py-4 text-center">
        <p className="text-sm text-muted">Thanks — that helps us build the right thing.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rule bg-bg-2 p-5 flex flex-col gap-4">
      <p className="text-sm font-medium text-fg">{question}</p>
      <div className="flex flex-col gap-2">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setSelected(opt.id)}
            className={[
              'rounded-lg border px-4 py-2.5 text-left text-sm transition-colors',
              selected === opt.id
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-rule bg-bg text-fg hover:border-accent/40',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => { void handleSubmit(); }}
        disabled={!selected}
        className="self-end rounded-lg bg-accent px-4 py-2 text-xs font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        Submit
      </button>
    </div>
  );
}
