'use client';

import type { ParkingLotItem } from '@/lib/continuation';

/**
 * ParkingLot — dashed-border list of parked "what if" ideas surfaced
 * during check-ins. Read-only display (capture happens in check-ins).
 * Visual grammar: roadmap.html .parking.
 */
export interface ParkingLotProps {
  items: ParkingLotItem[];
}

const SOURCE_LABEL: Record<string, string> = {
  check_in:       'check-in',
  task_diagnostic: 'task diagnostic',
  pushback:       'pushback',
  interview:      'interview',
};

export function ParkingLot({ items }: ParkingLotProps) {
  if (items.length === 0) {
    return (
      <div className="border border-dashed border-rule-strong px-4 py-3.5 font-mono text-[11px] tracking-[0.04em] text-muted">
        Nothing parked yet.
      </div>
    );
  }
  return (
    <div className="border border-dashed border-rule-strong px-4 py-3.5">
      {items.map((item) => (
        <div key={item.id} className="border-b border-dashed border-rule py-2 last:border-b-0">
          <q className="font-serif text-[13px] italic text-fg">{item.idea}</q>
          <div className="mt-[3px] font-mono text-[9px] tracking-[0.04em] text-muted">
            {formatWhen(item.surfacedAt)} · {item.taskContext ?? SOURCE_LABEL[item.surfacedFrom] ?? item.surfacedFrom}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'parked';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
