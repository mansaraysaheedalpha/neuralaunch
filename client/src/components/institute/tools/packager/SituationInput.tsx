"use client";

import { useState } from "react";

interface SituationInputProps {
  value: string;
  disabled?: boolean;
  ventureContext?: string;
  onChange: (value: string) => void;
  onSubmit: (description: string) => void;
}

export function SituationInput({
  value,
  disabled,
  ventureContext,
  onChange,
  onSubmit,
}: SituationInputProps) {
  const [currency, setCurrency] = useState("NLe");
  const [anchor, setAnchor] = useState("");
  const canSubmit = value.trim().length > 0 && !disabled;

  function submit() {
    if (!canSubmit) return;
    const pricing = anchor.trim()
      ? `\n\nCurrency: ${currency}. Price anchor: ${anchor.trim()}`
      : `\n\nCurrency: ${currency}.`;
    onSubmit(`${value.trim()}${pricing}`);
  }

  return (
    <section className="flex min-h-full flex-col gap-7 border-r border-rule px-6 py-8 sm:px-10">
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <span>01 · Situation</span>
        <span className="text-accent">Ready</span>
      </div>
      <div className="border border-rule bg-bg-2 focus-within:border-accent">
        <textarea
          id="packager-situation"
          aria-label="Describe the offer and audience"
          aria-describedby="packager-situation-help"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
              submit();
          }}
          placeholder="What do you offer, to whom, and what's it worth? Describe it the way you'd explain it to a friend."
          className="min-h-[150px] w-full resize-none bg-transparent p-5 font-serif text-[21px] italic leading-[1.45] text-fg outline-none placeholder:text-muted-2"
        />
      </div>
      <p
        id="packager-situation-help"
        className="text-[12px] leading-relaxed text-muted"
      >
        Include what you deliver, who buys it, and any pricing evidence you
        already have.
      </p>
      <label className="grid gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        Currency &amp; price anchor
        <span className="grid grid-cols-[110px_1fr]">
          <select
            aria-label="Currency"
            aria-describedby="packager-pricing-help"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="border border-rule bg-bg-2 px-3 py-3 text-xs text-fg outline-none focus:border-accent"
          >
            {["NLe", "USD", "GHS", "NGN"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <input
            aria-label="Price anchor"
            aria-describedby="packager-pricing-help"
            value={anchor}
            onChange={(event) => setAnchor(event.target.value)}
            placeholder="~200/month felt acceptable in testing"
            className="border border-l-0 border-rule bg-bg-2 px-3 py-3 font-sans text-xs normal-case tracking-normal text-fg outline-none focus:border-accent"
          />
        </span>
        <span
          id="packager-pricing-help"
          className="font-sans text-[11px] normal-case tracking-normal"
        >
          The anchor is optional and should come from a real quote, test, or
          comparable offer.
        </span>
      </label>
      {ventureContext && (
        <div className="border-l-2 border-accent bg-accent/[0.04] px-4 py-3 text-[13px] leading-relaxed text-fg-2">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
            Pulled from this venture
          </p>
          {ventureContext}
        </div>
      )}
      <div className="sticky bottom-0 z-10 mt-auto flex items-center justify-between gap-4 border-t border-rule bg-bg py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:border-t-0 lg:pb-0">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted"
          aria-hidden="true"
        >
          Generate <kbd className="border border-rule px-1.5 py-0.5">⌘</kbd>
          <kbd className="border border-rule px-1.5 py-0.5">↵</kbd>
        </span>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="bg-accent px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-bg disabled:opacity-35"
        >
          Build the tiers →
        </button>
      </div>
    </section>
  );
}
