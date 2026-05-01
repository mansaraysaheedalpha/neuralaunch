'use client';
// src/app/(app)/discovery/roadmap/[id]/RoadmapProgressHeader.tsx

interface RoadmapProgressHeaderProps {
  totalTasks:     number;
  completedTasks: number;
  blockedTasks:   number;
  totalPhases:    number;
  currentPhase:   number;
  totalWeeks:     number | null;
}

interface StatProps {
  label:          string;
  value:          string;
  /** Optional accent color for the value digits — primary for stage
   *  context, destructive for blocked. Numbers default to slate-100. */
  valueClass?:    string;
}

function Stat({ label, value, valueClass }: StatProps) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </p>
      {/* Stat values sized to design-tool spec: 16px / 600. Was
          text-lg (18px) before — tighter scale matches the rest of
          the band's more-compact rhythm. Mono so digits align across
          stats. */}
      <p className={`text-base font-mono font-semibold tabular-nums leading-none ${valueClass ?? 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * RoadmapProgressHeader — sticky horizontal stat band at the top of
 * the roadmap canvas. Replaces the prior inline run-on caption with
 * a four-stat layout that matches the design tool spec: TASKS / PHASE
 * / WEEKS LEFT / BLOCKED on the left, big primary percentage on the
 * right, gradient progress bar at the bottom.
 *
 * Each stat carries:
 *   - eyebrow label in uppercase muted-foreground
 *   - large tabular-nums value beneath
 *
 * The big percentage on the right is the most-glanced metric on the
 * page and gets the most weight (text-3xl primary, success-green at
 * 100%). Below it a small uppercase "complete" caption anchors the
 * meaning. The gradient progress bar (primary→gold→success) shifts
 * naturally as the founder progresses across the journey.
 *
 * Stat columns are separated by thin slate dividers — keeps the band
 * legible at a glance without forcing the eye to read commas.
 */
export function RoadmapProgressHeader({
  totalTasks,
  completedTasks,
  blockedTasks,
  totalPhases,
  currentPhase,
  totalWeeks,
}: RoadmapProgressHeaderProps) {
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const isDone = pct === 100;

  const remaining = totalWeeks && totalTasks > 0
    ? Math.max(0, Math.round(totalWeeks * (1 - completedTasks / totalTasks)))
    : null;

  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-6">
        {/* Stat columns — TASKS · PHASE · WEEKS LEFT · BLOCKED.
            BLOCKED is omitted entirely when zero so the band stays
            visually quiet during normal execution and only surfaces
            the destructive accent when there's something to act on. */}
        <div className="flex items-center divide-x divide-border min-w-0 flex-1 overflow-x-auto">
          <div className="pr-6">
            <Stat
              label="Tasks"
              value={`${completedTasks}/${totalTasks}`}
            />
          </div>
          <div className="px-6">
            <Stat
              label="Phase"
              value={`${currentPhase}/${totalPhases}`}
            />
          </div>
          {remaining !== null && (
            <div className="px-6">
              <Stat
                label="Weeks left"
                value={isDone ? '0' : `~${remaining}`}
              />
            </div>
          )}
          {blockedTasks > 0 && (
            <div className="px-6">
              <Stat
                label="Blocked"
                value={String(blockedTasks)}
                valueClass="text-destructive"
              />
            </div>
          )}
        </div>

        {/* Big percentage on the right — design-tool spec: 24px / 600.
            Was text-3xl (30px) before; the spec calls for a more
            restrained 24px so the percentage feels deliberate, not
            a billboard. Switches from primary to success at 100% so
            the completion moment is felt across the band. */}
        <div className="flex items-baseline gap-2 shrink-0">
          <span className={`text-2xl font-mono font-semibold tabular-nums leading-none ${isDone ? 'text-success' : 'text-primary'}`}>
            {pct}%
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            complete
          </span>
        </div>
      </div>

      {/* Gradient progress bar — primary → gold → success. As the
          founder progresses, the visible colour at their position
          naturally shifts from primary (early) toward success (late)
          without per-state branching. */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-slow ${isDone ? 'bg-success' : 'bg-gradient-to-r from-primary via-gold to-success'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
