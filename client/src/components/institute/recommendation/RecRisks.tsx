import { RecSection } from './RecSection';

export interface RecRisk {
  risk: string;
  mitigation: string;
}

/**
 * § V — Risks. A hairline ledger, one row per risk: the risk in --fg
 * with its mitigation beneath in --fg-2.
 *
 * Note: the schema's risks carry { risk, mitigation } only — no
 * severity field — so the high/med/low severity column from the
 * reference is not rendered (see PR notes). A neutral accent marker
 * stands in its place.
 */
export function RecRisks({ risks }: { risks: RecRisk[] }) {
  return (
    <RecSection num="V." label="Risks">
      <div className="grid border border-rule">
        {risks.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[14px_1fr] gap-4 border-b border-rule px-[22px] py-3.5 last:border-b-0"
          >
            <span aria-hidden="true" className="mt-[6px] text-[10px] leading-none text-accent">
              ●
            </span>
            <div>
              <p className="text-[14.5px] font-medium leading-[1.5] text-fg">{row.risk}</p>
              <p className="mt-1 text-[14px] leading-[1.55] text-fg-2">{row.mitigation}</p>
            </div>
          </div>
        ))}
      </div>
    </RecSection>
  );
}
