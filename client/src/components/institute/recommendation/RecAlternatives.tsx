import { RecSection } from './RecSection';

export interface RecAlternative {
  alternative: string;
  whyNotForThem: string;
}

/**
 * § VII — Considered & rejected. One card per rejected alternative:
 * struck-through serif title + reasoning, with a ✕ glyph top-right.
 */
export function RecAlternatives({ alternatives }: { alternatives: RecAlternative[] }) {
  return (
    <RecSection
      num="VII."
      label="Considered & rejected"
    >
      <div className="grid gap-3">
        {alternatives.map((alt, i) => (
          <div key={i} className="relative border border-rule px-[26px] py-[22px]">
            <span
              aria-hidden="true"
              className="absolute right-[26px] top-[22px] font-serif text-[24px] text-muted"
            >
              ✕
            </span>
            <h4 className="mb-2 max-w-[540px] font-serif text-[22px] font-normal leading-[1.2] tracking-[-0.01em] text-fg-2 line-through decoration-muted-2">
              {alt.alternative}
            </h4>
            <p className="max-w-[540px] text-[14.5px] leading-[1.55] text-fg-2">
              {alt.whyNotForThem}
            </p>
          </div>
        ))}
      </div>
    </RecSection>
  );
}
