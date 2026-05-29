/**
 * PaceMeter — stated vs derived weekly hours with the delta. Big
 * serif-italic delta figure, two rows, a progress bar, and an honest
 * note. Visual grammar: roadmap.html .pace.
 *
 * NOTE: the roadmap data model does not currently track actual hours
 * per task, so `derivedHours` is usually null and the meter renders an
 * honest "not enough data yet" state rather than inventing a figure
 * (see PR notes). When a derived figure exists, the delta is computed
 * here from stated vs derived.
 */
export interface PaceMeterProps {
  statedHours: number | null;
  derivedHours: number | null;
  completionPct: number;
}

export function PaceMeter({ statedHours, derivedHours, completionPct }: PaceMeterProps) {
  const hasDerived = statedHours != null && statedHours > 0 && derivedHours != null;
  const deltaPct = hasDerived
    ? Math.round(((derivedHours - statedHours) / statedHours) * 100)
    : null;
  const deltaHours = hasDerived ? Math.round((derivedHours - statedHours) * 10) / 10 : null;

  return (
    <div className="border border-rule bg-bg-2 px-5 py-[18px]">
      <div className="font-serif text-[32px] italic leading-none tracking-[-0.01em] text-accent">
        {deltaPct == null ? '—' : `${deltaPct >= 0 ? '+' : ''}${deltaPct}%`}
      </div>
      <div className="mt-3.5 flex justify-between text-[13px] text-fg-2">
        <span>Stated · {statedHours ?? '—'} h / week</span>
        <span className="font-mono text-[11px] tracking-[0.04em] text-fg">
          {hasDerived ? 'Actual' : 'No data yet'}
        </span>
      </div>
      <div className="mt-2 flex justify-between text-[13px] text-fg-2">
        <span>Derived · {derivedHours == null ? '—' : `${derivedHours} h / week`}</span>
        <span className="font-mono text-[11px] tracking-[0.04em] text-fg">
          {deltaHours == null ? '—' : `${deltaHours >= 0 ? '+' : ''}${deltaHours} h`}
        </span>
      </div>
      <div className="relative mt-3.5 h-1 bg-rule">
        <div
          className="absolute inset-y-0 left-0 bg-accent"
          style={{ width: `${Math.max(0, Math.min(100, completionPct))}%` }}
        />
      </div>
      <p className="mt-2.5 font-mono text-[10px] leading-[1.55] tracking-[0.04em] text-muted">
        {hasDerived
          ? 'Pace is honest — the continuation brief will use derived hours to size the next cycle.'
          : 'Derived pace appears once enough tasks are completed with timing. The continuation brief will use it to size the next cycle.'}
      </p>
    </div>
  );
}
