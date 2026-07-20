import type { DispatchPlan } from "@/lib/roadmap/composer";

export function ComposerDispatchPlan({ plan }: { plan: DispatchPlan }) {
  const signals = [
    { label: "Strong interest", values: plan.responseSignals.strongInterest },
    { label: "Weak interest", values: plan.responseSignals.weakInterest },
    { label: "Rejection", values: plan.responseSignals.rejection },
  ];
  return (
    <section
      className="border border-accent"
      aria-labelledby="dispatch-plan-heading"
    >
      <header className="border-b border-accent px-5 py-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
          Recommended dispatch
        </p>
        <h3
          id="dispatch-plan-heading"
          className="mt-2 font-serif text-[22px] italic text-fg"
        >
          {plan.recommendationReason}
        </h3>
      </header>
      <div className="grid border-b border-rule md:grid-cols-2">
        <Timing label="Send by" value={plan.timing.sendBy} />
        <Timing
          label="Follow up after"
          value={plan.timing.followUpAfter}
          last
        />
      </div>
      <div className="border-b border-rule px-5 py-4">
        <p className="mb-3 font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
          Start with
        </p>
        <ol className="grid gap-2">
          {[...plan.firstRecipients]
            .sort((a, b) => a.priority - b.priority)
            .map((recipient) => (
              <li
                key={`${recipient.priority}-${recipient.description}`}
                className="grid gap-2 sm:grid-cols-[28px_160px_1fr]"
              >
                <span className="font-serif text-lg italic text-accent">
                  {recipient.priority}
                </span>
                <strong className="text-[12px] text-fg">
                  {recipient.description}
                </strong>
                <span className="text-[12px] leading-relaxed text-fg-2">
                  {recipient.reason}
                </span>
              </li>
            ))}
        </ol>
      </div>
      <div className="grid border-b border-rule lg:grid-cols-3">
        {signals.map((signal) => (
          <div
            key={signal.label}
            className="border-b border-rule px-5 py-4 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
              {signal.label}
            </p>
            <ul className="mt-2 grid gap-1.5 text-[11px] leading-relaxed text-fg-2">
              {signal.values.map((value) => (
                <li key={value}>— {value}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="grid gap-4 px-5 py-4 md:grid-cols-3">
        <DecisionRule label="Stop when" values={[plan.stopRule]} />
        <DecisionRule
          label="Change message when"
          values={plan.changeMessageWhen}
        />
        <DecisionRule
          label="Change audience when"
          values={plan.changeAudienceWhen}
        />
      </div>
    </section>
  );
}

function Timing({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`border-b border-rule px-5 py-4 md:border-b-0 ${last ? "" : "md:border-r"}`}
    >
      <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-[13px] text-fg">{value}</p>
    </div>
  );
}

function DecisionRule({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-accent">
        {label}
      </p>
      <ul className="mt-2 grid gap-1 text-[11px] leading-relaxed text-fg-2">
        {values.map((value) => (
          <li key={value}>— {value}</li>
        ))}
      </ul>
    </div>
  );
}
