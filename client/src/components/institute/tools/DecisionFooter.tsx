export interface DecisionFooterData {
  label: string;
  decision: string;
  confidence?: "low" | "medium" | "high";
  learned: string[];
  next: { action: string; successSignal: string; timing: string };
  saved: string;
  reconsiderWhen: string[];
}

export function DecisionFooter({ data }: { data: DecisionFooterData }) {
  return (
    <footer
      className="border border-accent"
      aria-label={`${data.label} decision summary`}
    >
      <header className="border-b border-accent px-5 py-4">
        <div className="flex flex-wrap justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.14em]">
          <span className="text-accent">{data.label}</span>
          {data.confidence && (
            <span className="text-muted">{data.confidence} confidence</span>
          )}
        </div>
        <p className="mt-2 font-serif text-[21px] italic leading-snug text-fg">
          {data.decision}
        </p>
      </header>
      <div className="grid border-b border-rule lg:grid-cols-2">
        <SummaryList label="What was learned" values={data.learned} />
        <div className="border-t border-rule px-5 py-4 lg:border-l lg:border-t-0">
          <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
            What to do next
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-fg">
            {data.next.action}
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Detail
              label="Evidence to continue"
              value={data.next.successSignal}
            />
            <Detail label="Timing" value={data.next.timing} />
          </dl>
        </div>
      </div>
      <div className="grid lg:grid-cols-2">
        <div className="border-b border-rule px-5 py-4 lg:border-b-0 lg:border-r">
          <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
            What was saved
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-fg-2">
            {data.saved}
          </p>
        </div>
        <SummaryList
          label="Change course when"
          values={data.reconsiderWhen}
          accent
        />
      </div>
    </footer>
  );
}

function SummaryList({
  label,
  values,
  accent = false,
}: {
  label: string;
  values: string[];
  accent?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <p
        className={`font-mono text-[8px] uppercase tracking-[0.14em] ${accent ? "text-accent" : "text-muted"}`}
      >
        {label}
      </p>
      <ul className="mt-2 grid gap-1.5 text-[11px] leading-relaxed text-fg-2">
        {values.map((value) => (
          <li key={value}>— {value}</li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-[11px] leading-relaxed text-fg-2">{value}</dd>
    </div>
  );
}
