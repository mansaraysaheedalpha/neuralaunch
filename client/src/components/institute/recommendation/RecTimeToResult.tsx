import { RecSection } from './RecSection';

/**
 * § III — Time to first result. One short paragraph. The H2 carries
 * the timeline phrase itself; the schema gives a single string so we
 * render it as the body and keep a static italic-serif heading.
 */
export function RecTimeToResult({ timeToFirstResult }: { timeToFirstResult: string }) {
  return (
    <RecSection
      num="III."
      label="Time to first result"
      heading={<>The first <em>real signal.</em></>}
    >
      <p className="text-[16px] leading-[1.6] text-fg-2">{timeToFirstResult}</p>
    </RecSection>
  );
}
