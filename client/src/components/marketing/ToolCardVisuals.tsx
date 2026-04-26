import {
  Check,
  ExternalLink,
  Linkedin,
  Mail,
  MessageCircle,
} from "lucide-react";

const FRAME =
  "h-[180px] rounded-lg border border-slate-800 bg-navy-950 p-4";

export function CoachVisual() {
  return (
    <div role="presentation" aria-hidden="true" className={FRAME}>
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
          <p className="text-xs leading-snug text-slate-200">
            Hi, I&rsquo;d like to discuss bulk pricing for 200 units monthly&hellip;
          </p>
        </div>
        <span className="text-[10px] text-slate-500">You</span>
      </div>
      <div className="mt-3 flex flex-col items-start gap-1">
        <div className="max-w-[85%] rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">
          <p className="text-xs leading-snug text-slate-200">
            We don&rsquo;t usually quote until we&rsquo;ve seen a contract.
            What&rsquo;s your timeline?
          </p>
        </div>
        <span className="text-[10px] text-slate-500">
          Supplier (in character)
        </span>
      </div>
    </div>
  );
}

const COMPOSER_ROWS = [
  {
    Icon: MessageCircle,
    preview: "Hey Mariama — quick one about the Tuesday delivery.",
    day: "Day 1",
  },
  {
    Icon: Mail,
    preview: "Following up — saw you opened the proposal last week.",
    day: "Day 5",
  },
  {
    Icon: Linkedin,
    preview: "One last note before I close the loop on this.",
    day: "Day 14",
  },
] as const;

export function ComposerVisual() {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={`${FRAME} flex flex-col justify-center gap-2`}
    >
      {COMPOSER_ROWS.map(({ Icon, preview, day }) => (
        <div
          key={day}
          className="flex items-center gap-2.5 rounded-md border border-slate-800 bg-navy-900 px-2.5 py-2"
        >
          <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p className="flex-1 truncate text-xs text-slate-300">{preview}</p>
          <span className="shrink-0 rounded-full border border-gold/30 px-1.5 py-px text-[10px] text-gold">
            {day}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ResearchVisual() {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={`${FRAME} flex flex-col justify-between`}
    >
      <div>
        <p className="text-sm font-medium text-white">Mariama Trading Co.</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">freetownsuppliers.com/mariama</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-[10px] text-success">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
          verified
        </span>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-500">
          likely
        </span>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-500">
          unverified
        </span>
      </div>
    </div>
  );
}

const PACKAGER_TIERS = [
  { name: "Starter", price: "$200", features: "3 features", recommended: false },
  { name: "Pro", price: "$500", features: "6 features", recommended: true },
  { name: "Premium", price: "$1,200", features: "10 features", recommended: false },
] as const;

export function PackagerVisual() {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={`${FRAME} flex items-center`}
    >
      <div className="grid w-full grid-cols-3 gap-2">
        {PACKAGER_TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`flex flex-col items-center gap-1.5 rounded-md px-2 py-3 ${
              tier.recommended
                ? "border border-gold/40 bg-gold/5"
                : "border border-transparent"
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              {tier.name}
            </p>
            <p className="text-sm font-semibold text-white">{tier.price}</p>
            <p className="text-[10px] text-slate-400">{tier.features}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ValidationVisual() {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={`${FRAME} flex flex-col gap-2.5`}
    >
      <div className="truncate rounded-md border border-slate-700 bg-navy-800 px-2 py-1 text-[10px] text-slate-500">
        neuralaunch.app/v/freetown-supplier-search
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1.5">
        <div className="h-2 w-full rounded bg-slate-700" />
        <div className="h-2 w-3/4 rounded bg-slate-700" />
        <div className="mt-1 h-3 w-1/2 rounded border border-primary/60 bg-primary/40" />
      </div>
      <p className="text-[10px] text-success">
        847 visitors &middot; 6.2% converted
      </p>
    </div>
  );
}
