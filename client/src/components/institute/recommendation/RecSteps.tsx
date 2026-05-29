import { RecSection } from './RecSection';

/**
 * § II — First steps. Numbered ol with upper-roman serif counters.
 * Each step is a plain string (the synthesis emits string[]); we bold
 * the first sentence for the "what to do" emphasis and render the rest
 * as continuation. No per-step time/tool meta line — the schema does
 * not carry it (see PR notes).
 */
export function RecSteps({ steps }: { steps: string[] }) {
  return (
    <RecSection
      num="II."
      label="First steps"
      heading={<>Where you&rsquo;ll be by <em>Friday week.</em></>}
    >
      <ol className="grid">
        {steps.map((step, i) => {
          const { lead, rest } = splitFirstSentence(step);
          return (
            <li
              key={i}
              className="relative border-b border-dashed border-rule pb-[22px] pl-[60px] last:border-b-0 last:pb-0 [&:not(:last-child)]:mb-[22px]"
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-[-2px] font-serif text-[28px] italic leading-none tracking-[-0.01em] text-accent"
              >
                {roman(i + 1)}.
              </span>
              <p className="text-[16px] leading-[1.6] text-fg-2">
                <b className="font-medium text-fg">{lead}</b>
                {rest ? ` ${rest}` : null}
              </p>
            </li>
          );
        })}
      </ol>
    </RecSection>
  );
}

function splitFirstSentence(s: string): { lead: string; rest: string } {
  const trimmed = s.trim();
  const m = /^(.+?[.!?])(\s+)(.*)$/s.exec(trimmed);
  if (!m) return { lead: trimmed, rest: '' };
  return { lead: m[1], rest: m[3] };
}

function roman(n: number): string {
  const table: [number, string][] = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let v = n;
  for (const [val, sym] of table) {
    while (v >= val) { out += sym; v -= val; }
  }
  return out;
}
