'use client';
// src/components/validation/public/FeatureInterestPanel.tsx

import { useState } from 'react';
import type { FeatureCard } from '@/lib/validation/schemas';

interface FeatureInterestPanelProps {
  features:  FeatureCard[];
  pageSlug:  string;
}

/**
 * FeatureInterestPanel
 *
 * Renders one card per roadmap task. Each card has a "Notify me when
 * this is ready" button. Clicks are tracked via the analytics API —
 * the primary smoke test signal for the interpretation agent.
 */
export function FeatureInterestPanel({ features, pageSlug }: FeatureInterestPanelProps) {
  const [clicked, setClicked] = useState<Record<string, boolean>>({});

  async function handleFeatureClick(taskId: string, title: string) {
    if (clicked[taskId]) return;
    setClicked(prev => ({ ...prev, [taskId]: true }));
    try {
      await fetch('/api/lp/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: pageSlug, event: 'feature_click', taskId, title }),
      });
    } catch { /* non-fatal — tracking best-effort */ }
  }

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-3">
      {features.map(feature => (
        <div
          key={feature.taskId}
          className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
            <p className="text-xs text-foreground/70 leading-relaxed">{feature.benefit}</p>
          </div>
          <button
            type="button"
            onClick={() => { void handleFeatureClick(feature.taskId, feature.title); }}
            data-task-id={feature.taskId}
            className={[
              'self-start rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              clicked[feature.taskId]
                ? 'bg-primary/10 text-primary cursor-default'
                : 'bg-muted text-foreground hover:bg-primary/10 hover:text-primary',
            ].join(' ')}
          >
            {clicked[feature.taskId] ? '✓ Noted — we\'ll let you know' : 'Notify me when this is ready'}
          </button>
        </div>
      ))}
    </div>
  );
}
