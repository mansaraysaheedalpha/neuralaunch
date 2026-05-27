"use client";

import { ChevronDown } from "lucide-react";

interface QuotaRow {
  tool: string;
  execute: string;
  compound: string;
}

const ROWS: QuotaRow[] = [
  { tool: "Research Tool",       execute: "30 / month",  compound: "100 / month" },
  { tool: "Conversation Coach",  execute: "50 / month",  compound: "150 / month" },
  { tool: "Outreach Composer",   execute: "100 / month", compound: "300 / month" },
  { tool: "Service Packager",    execute: "20 / month",  compound: "60 / month" },
  { tool: "Voice transcription", execute: "—",           compound: "30 / hour" },
];

/**
 * Native <details>/<summary> disclosure of per-tool monthly quotas.
 * Zero JS. Restyled to the Institute hairline palette so it lives
 * inside the pricing section without breaking the type system.
 */
export default function FairUseDisclosure() {
  return (
    <section
      aria-label="Tier limits and fair use"
      className="mx-auto mt-12 max-w-6xl"
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border border-rule px-5 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-rule-strong hover:text-fg">
          <span>Fair use limits — what&rsquo;s included in each tier.</span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform duration-200 group-open:rotate-180"
          />
        </summary>

        <div className="mt-3 border border-rule p-6">
          {/* Desktop — semantic data table */}
          <table className="hidden w-full text-left text-sm md:table">
            <thead>
              <tr className="border-b border-rule">
                <th
                  scope="col"
                  className="pb-3 pr-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted"
                >
                  Tool
                </th>
                <th
                  scope="col"
                  className="pb-3 pr-4 font-mono text-[10px] uppercase tracking-[0.14em] text-accent"
                >
                  Execute
                </th>
                <th
                  scope="col"
                  className="pb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted"
                >
                  Compound
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.tool} className="border-b border-rule last:border-b-0">
                  <th
                    scope="row"
                    className="py-3 pr-4 text-sm font-medium text-fg"
                  >
                    {row.tool}
                  </th>
                  <td className="py-3 pr-4 font-mono text-[12px] text-fg-2">
                    {row.execute}
                  </td>
                  <td className="py-3 font-mono text-[12px] text-fg-2">
                    {row.compound}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile — stacked card per tool */}
          <ul role="list" className="space-y-3 md:hidden">
            {ROWS.map((row) => (
              <li key={row.tool} className="border border-rule p-4">
                <p className="text-sm font-medium text-fg">{row.tool}</p>
                <dl className="mt-2 grid grid-cols-2 gap-3 font-mono text-[12px]">
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.14em] text-accent">
                      Execute
                    </dt>
                    <dd className="mt-0.5 text-fg-2">{row.execute}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">
                      Compound
                    </dt>
                    <dd className="mt-0.5 text-fg-2">{row.compound}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-xs leading-relaxed text-muted">
            These ceilings exist so paid plans stay sustainable as LLM costs
            scale. Most founders use a fraction. If you&rsquo;re consistently
            hitting them, upgrade or talk to us.
          </p>
        </div>
      </details>
    </section>
  );
}
