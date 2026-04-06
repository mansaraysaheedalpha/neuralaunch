'use client';
// src/components/validation/public/SignupForm.tsx

import { useState } from 'react';

interface SignupFormProps {
  ctaHeadline:    string;
  ctaButtonLabel: string;
  ctaPlaceholder: string;
  pageSlug:       string;
  onSignup:       (email: string) => void;
}

/**
 * SignupForm
 *
 * Email capture form on the public validation page. On submit, fires a
 * best-effort analytics event (event: 'cta_signup') then calls onSignup
 * so the parent can show the entry survey.
 */
export function SignupForm({
  ctaHeadline,
  ctaButtonLabel,
  ctaPlaceholder,
  pageSlug,
  onSignup,
}: SignupFormProps) {
  const [email,     setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();

    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await fetch('/api/lp/analytics', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ slug: pageSlug, event: 'cta_signup', email: trimmed }),
      });
    } catch { /* non-fatal — tracking best-effort */ }

    setSubmitted(true);
    setLoading(false);
    onSignup(trimmed);
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 px-6 py-5 text-center">
        <p className="text-sm font-medium text-primary">You're on the list.</p>
        <p className="mt-1 text-xs text-muted-foreground">We'll reach out as soon as we're ready for you.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground text-center">{ctaHeadline}</h2>
      <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={ctaPlaceholder}
          autoComplete="email"
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Saving…' : ctaButtonLabel}
        </button>
      </form>
      <p className="text-center text-xs text-muted-foreground">No spam. No obligations. Just early access.</p>
    </div>
  );
}
