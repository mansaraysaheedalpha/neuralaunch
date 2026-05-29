import { RecSection } from './RecSection';
import { Assumption } from './Assumption';

/**
 * § IV — Assumptions. Each row is flaggable; flagging reveals the live
 * "if false" delta. The consumer supplies the delta resolver per
 * assumption text.
 */
export interface RecAssumptionsProps {
  assumptions: string[];
  /** Returns a delta resolver for a given assumption text. */
  deltaResolver: (assumption: string) => (onChunk: (acc: string) => void) => Promise<void>;
}

export function RecAssumptions({ assumptions, deltaResolver }: RecAssumptionsProps) {
  return (
    <RecSection num="IV." label="Assumptions">
      <p className="mb-[22px] text-[16px] leading-[1.6] text-fg-2">
        {assumptions.length} assumption{assumptions.length === 1 ? '' : 's'} this
        recommendation rests on. <strong className="font-medium text-fg">Flag any one</strong> to
        see how the recommendation changes if it turns out to be false.
      </p>
      <div>
        {assumptions.map((a, i) => (
          <Assumption key={i} text={a} onRequestDelta={deltaResolver(a)} />
        ))}
      </div>
    </RecSection>
  );
}
