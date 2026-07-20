import type { ServicePackage } from '@/lib/roadmap/service-packager/schemas';

export function RevenueScenarios({ scenarios }: { scenarios: ServicePackage['revenueScenarios'] }) {
  if (scenarios.length === 0) return null;
  return (
    <section className="border border-rule-strong">
      <header className="flex justify-between border-b border-rule px-5 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        <span>Revenue scenarios <i className="font-serif normal-case tracking-normal">· at realistic uptake</i></span>
        <span className="text-accent">{scenarios.at(-1)?.clients ?? 0} clients modelled</span>
      </header>
      {scenarios.map((scenario, index) => (
        <div key={`${scenario.label}-${index}`} className={`grid gap-2 border-b border-rule px-5 py-4 last:border-b-0 sm:grid-cols-[120px_1fr_150px] ${index === 1 ? 'bg-accent/[0.04]' : ''}`}>
          <strong className="font-serif text-xl italic text-fg">{scenario.label}</strong>
          <span className="font-mono text-[11px] text-muted"><b className="text-fg-2">{scenario.clients} clients</b> · {scenario.tierMix} · {scenario.weeklyHours}</span>
          <strong className="text-right font-serif text-[25px] italic text-accent">{scenario.monthlyRevenue}<small className="ml-1 font-mono text-[8px] not-italic uppercase text-muted">/ month</small></strong>
        </div>
      ))}
    </section>
  );
}
