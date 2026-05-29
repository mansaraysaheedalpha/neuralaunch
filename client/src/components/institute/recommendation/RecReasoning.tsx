import { RecSection } from './RecSection';

/**
 * § I — Reasoning. The "why this, for you" argument. The reasoning
 * string may contain blank-line-separated paragraphs; split and render
 * each as its own <p>.
 */
export function RecReasoning({ reasoning }: { reasoning: string }) {
  const paragraphs = reasoning.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <RecSection
      first
      num="I."
      label="Reasoning"
      heading={<>Why this — <em>for you</em> — and not anyone with the same idea.</>}
    >
      <div className="grid gap-3">
        {(paragraphs.length > 0 ? paragraphs : [reasoning]).map((p, i) => (
          <p key={i} className="text-[16px] leading-[1.6] text-fg-2">
            {p}
          </p>
        ))}
      </div>
    </RecSection>
  );
}
