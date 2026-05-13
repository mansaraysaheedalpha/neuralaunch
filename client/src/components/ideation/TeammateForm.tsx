'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TeammateFormProps {
  /** Existing teammate names — used to dedupe locally before hitting the route. */
  existingNames: ReadonlyArray<string>;
  /** Called when the founder adds a teammate. Returns when the API write completes. */
  onAdd: (name: string) => Promise<void>;
  /** Disabled when the stage row is not in 'authoring'. */
  disabled?: boolean;
}

/**
 * Inline "+ Add a teammate" affordance. Validates non-empty + dedup
 * client-side; the route is the authoritative validator.
 */
export function TeammateForm({ existingNames, onAdd, disabled = false }: TeammateFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (cleaned.length === 0) {
      setError('Name required');
      return;
    }
    const lc = cleaned.toLowerCase();
    if (existingNames.some(n => n.toLowerCase() === lc)) {
      setError(`"${cleaned}" is already on the team`);
      return;
    }
    startTransition(async () => {
      setError(null);
      try {
        await onAdd(cleaned);
        setName('');
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add teammate');
      }
    });
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3 mr-1" />
        Add a teammate
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-2 py-1">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        disabled={busy || disabled}
        autoFocus
        maxLength={80}
        placeholder="Teammate's name"
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none px-2 py-1"
      />
      <Button type="submit" size="sm" disabled={busy || disabled || name.trim().length === 0}>
        Add
      </Button>
      <button
        type="button"
        onClick={() => { setOpen(false); setName(''); setError(null); }}
        disabled={busy}
        aria-label="Cancel"
        className="p-1 rounded text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </button>
      {error && (
        <span className="text-xs text-destructive ml-2">{error}</span>
      )}
    </form>
  );
}
