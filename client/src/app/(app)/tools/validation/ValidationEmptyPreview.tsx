export function ValidationEmptyPreview({ active }: { active?: boolean }) {
  return (
    <section
      className="flex min-h-[480px] flex-col px-6 py-8 sm:px-10"
      aria-live="polite"
      aria-busy={Boolean(active)}
    >
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <span>02 · Validation page</span>
        <span className={active ? "text-accent" : ""}>
          {active ? "Drafting…" : "Awaiting hypothesis"}
        </span>
      </div>
      <div className="my-auto flex min-h-[300px] flex-col items-center justify-center border border-dashed border-rule-strong text-center">
        <span
          aria-hidden="true"
          className={`font-serif text-[48px] italic ${active ? "animate-pulse text-accent" : "text-muted-2"}`}
        >
          V
        </span>
        <p className="mt-4 font-mono text-[10px] uppercase leading-[1.8] tracking-[0.16em] text-muted">
          A real page begins here.
          <br />
          Signal starts only after you publish and share.
        </p>
      </div>
    </section>
  );
}

export function formatRecommendationDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
