import { RecSection } from './RecSection';

/**
 * § VI — What would make this wrong. The accent-left-border block from
 * index.html: a single paragraph on an accent-rgba fill.
 */
export function RecWrong({ wrong }: { wrong: string }) {
  return (
    <RecSection
      num="VI."
      label="What would make this wrong"
      heading={<>The condition for <em>changing course.</em></>}
    >
      <div
        className="border-l-2 border-accent px-[26px] py-[22px]"
        style={{ background: 'rgba(255,90,60,0.06)' }}
      >
        <p className="text-[16px] leading-[1.6] text-fg">{wrong}</p>
      </div>
    </RecSection>
  );
}
