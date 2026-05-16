'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FOUNDER_CONTEXT_TAGS, type FounderContextTag } from '@neuralaunch/constants';
import { FOUNDER_CONTEXT_LABELS } from './labels';

interface FounderPainPointFormProps {
  disabled?: boolean;
  onAdd: (input: {
    description:    string;
    founderContext: FounderContextTag | null;
    founderNotes:   string | null;
  }) => Promise<void>;
}

/**
 * Add-a-pain-point form. Human Scout layer — the founder enters a pain
 * point they sourced themselves (own life, close circle, industry
 * observation, or existing-solution gap) plus optional notes.
 *
 * Resets on successful submit so the founder can keep adding without
 * remounting. The agent-sourced rows from the Pain Scout don't pass
 * through here.
 */
export function FounderPainPointForm({ disabled, onAdd }: FounderPainPointFormProps) {
  const [description, setDescription] = useState('');
  const [context, setContext] = useState<FounderContextTag | ''>('');
  const [notes, setNotes] = useState('');
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !disabled && !busy && description.trim().length > 0 && context !== '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    startTransition(async () => {
      setError(null);
      try {
        await onAdd({
          description:    description.trim(),
          founderContext: context as FounderContextTag,
          founderNotes:   notes.trim().length > 0 ? notes.trim() : null,
        });
        setDescription('');
        setContext('');
        setNotes('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add pain point');
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-border bg-card/40 px-3 py-3 space-y-3"
      aria-label="Add a pain point you sourced yourself"
    >
      <header>
        <h3 className="text-sm font-semibold text-foreground">Add your own pain point</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your own life is the strongest signal. Add a pain you, someone close to you, or your industry actually hits.
        </p>
      </header>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-foreground">
          What is the pain?
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={disabled || busy}
            maxLength={600}
            rows={2}
            placeholder="One concrete frustration — keep it specific."
            className="mt-1 w-full resize-none rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
          />
        </label>

        <label className="block text-xs font-medium text-foreground">
          Where did this come from?
          <select
            value={context}
            onChange={e => setContext(e.target.value as FounderContextTag | '')}
            disabled={disabled || busy}
            className="mt-1 w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40"
          >
            <option value="">Choose one…</option>
            {FOUNDER_CONTEXT_TAGS.map(tag => (
              <option key={tag} value={tag}>{FOUNDER_CONTEXT_LABELS[tag]}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-foreground">
          Notes (optional)
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={disabled || busy}
            maxLength={600}
            rows={2}
            placeholder="Who hits this, when, what they've tried — anything useful for later."
            className="mt-1 w-full resize-none rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
          />
        </label>
      </div>

      {error && <div className="text-xs text-destructive">{error}</div>}

      <Button type="submit" size="sm" disabled={!canSubmit} className="w-full">
        <Plus className="size-3 mr-1" />
        {busy ? 'Adding…' : 'Add pain point'}
      </Button>
    </form>
  );
}
