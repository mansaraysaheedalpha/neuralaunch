import type { ServicePackage } from '@/lib/roadmap/service-packager/schemas';

export function PackagerReasoning({ tiers }: { tiers: ServicePackage['tiers'] }) {
  const reasoning = tiers.map((tier) => tier.justification).filter(Boolean);
  if (reasoning.length === 0) return null;
  return (
    <section className="grid gap-6 border-t border-rule pt-7 sm:grid-cols-[180px_1fr]">
      <div><span className="block font-serif text-3xl italic text-accent">§</span><h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">Why these three</h3></div>
      <div className="grid gap-3 text-[15px] leading-relaxed text-fg-2">
        {reasoning.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    </section>
  );
}
