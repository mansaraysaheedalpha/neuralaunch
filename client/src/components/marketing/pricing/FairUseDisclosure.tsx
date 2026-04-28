"use client";

import { ChevronDown, Info } from "lucide-react";

interface QuotaRow {
  tool:     string;
  execute:  string;
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
 * Native <details>/<summary> disclosure that surfaces per-tool monthly
 * quotas without burdening the tier cards. Users who care can read,
 * users who don't aren't burdened — same pattern Stripe / Linear /
 * Vercel use for fair-use details.
 *
 * Zero JS — open/close handled by the browser. The table uses
 * semantic markup (thead/tbody, scope=col/row) so screen readers
 * navigate it as a real data table on lg/md, and falls back to a
 * stacked card layout per tool on sm.
 */
export default function FairUseDisclosure() {
  return (
    <section
      aria-label="Tier limits and fair use"
      className="mx-auto mt-12 max-w-6xl"
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-800 bg-navy-900 px-5 py-3 text-sm text-slate-300 transition-colors hover:border-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950">
          <span className="flex items-center gap-2.5">
            <Info className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span>Fair use limits — what&rsquo;s included in each tier.</span>
          </span>
          <ChevronDown
            className="h-4 w-4 text-slate-400 transition-transform duration-200 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="mt-3 rounded-lg border border-slate-800 bg-navy-950 p-6">
          {/* Desktop / tablet — semantic data table */}
          <table className="hidden w-full text-left text-sm md:table">
            <thead>
              <tr className="border-b border-slate-800">
                <th
                  scope="col"
                  className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
                >
                  Tool
                </th>
                <th
                  scope="col"
                  className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wider text-primary"
                >
                  Execute
                </th>
                <th
                  scope="col"
                  className="pb-3 text-[11px] font-semibold uppercase tracking-wider text-gold"
                >
                  Compound
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr
                  key={row.tool}
                  className="border-b border-slate-800/60 last:border-b-0"
                >
                  <th
                    scope="row"
                    className="py-3 pr-4 text-sm font-medium text-white"
                  >
                    {row.tool}
                  </th>
                  <td className="py-3 pr-4 text-sm text-slate-300">{row.execute}</td>
                  <td className="py-3 text-sm text-slate-300">{row.compound}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile — stacked card per tool */}
          <ul role="list" className="space-y-3 md:hidden">
            {ROWS.map((row) => (
              <li
                key={row.tool}
                className="rounded-md border border-slate-800 bg-navy-900 p-4"
              >
                <p className="text-sm font-medium text-white">{row.tool}</p>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Execute
                    </dt>
                    <dd className="mt-0.5 text-slate-300">{row.execute}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                      Compound
                    </dt>
                    <dd className="mt-0.5 text-slate-300">{row.compound}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-xs leading-relaxed text-slate-500">
            These ceilings exist so paid plans stay sustainable as LLM costs
            scale. Most founders use a fraction. If you&rsquo;re consistently
            hitting them, upgrade or talk to us.
          </p>
        </div>
      </details>
    </section>
  );
}
