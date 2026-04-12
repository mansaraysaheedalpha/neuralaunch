'use client';
// src/app/(app)/discovery/roadmap/[id]/continuation/BriefSections.tsx

import { motion } from 'motion/react';
import { Bookmark } from 'lucide-react';
import type { ContinuationBrief } from '@/lib/continuation';

/**
 * BriefSections — pure presentation of the four read-only sections
 * of the continuation brief: What Happened, What I Got Wrong, What
 * the Evidence Says, and the Parking Lot. The interactive forks
 * section is rendered separately by ForkPicker so the picker can
 * own its own selection state.
 *
 * Each section is a styled card with a small label header. The
 * Parking Lot is rendered last per the spec (section 5).
 */
export function BriefSections({ brief }: { brief: ContinuationBrief }) {
  return (
    <div className="flex flex-col gap-5">
      <Section index={1} label="What happened" body={brief.whatHappened} />
      <Section index={2} label="What I got wrong" body={brief.whatIGotWrong} accent="amber" />
      <Section index={3} label="What the evidence says" body={brief.whatTheEvidenceSays} />

      {/* Section 5 — parking lot. Rendered before the closing thought
          but after the read-only sections, just like the spec orders
          it. The fork picker (section 4) is mounted by the parent. */}
      <ParkingLotSection brief={brief} />

      {brief.closingThought && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70 mb-2">
            The next decision is yours
          </p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {brief.closingThought}
          </p>
        </motion.div>
      )}
    </div>
  );
}

interface SectionProps {
  index:  number;
  label:  string;
  body:   string;
  accent?: 'amber';
}

function Section({ index, label, body, accent }: SectionProps) {
  const accentClass = accent === 'amber'
    ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-border bg-card';
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={`rounded-xl border ${accentClass} px-5 py-4 flex flex-col gap-2`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
        {index}. {label}
      </p>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
        {body}
      </p>
    </motion.section>
  );
}

function ParkingLotSection({ brief }: { brief: ContinuationBrief }) {
  if (brief.parkingLotItems.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card px-5 py-4 flex flex-col gap-1"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          5. Parking lot
        </p>
        <p className="text-xs text-muted-foreground italic">
          Nothing parked during this roadmap. You can capture ideas at any time from the roadmap page.
        </p>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card px-5 py-4 flex flex-col gap-3"
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80 flex items-center gap-1">
        <Bookmark className="size-3" />
        5. Parking lot — ideas you mentioned along the way
      </p>
      <ul className="flex flex-col gap-2">
        {brief.parkingLotItems.map((item, i) => {
          // Defensive: fall back through taskContext → surfacedFrom →
          // null so a parking-lot item missing both fields never
          // renders the literal string "surfaced via undefined".
          const provenance = item.taskContext
            ? `from "${item.taskContext}"`
            : item.surfacedFrom
              ? `surfaced via ${item.surfacedFrom}`
              : null;
          return (
            <li
              key={i}
              className="rounded-lg border border-border bg-background px-3 py-2 flex flex-col gap-1"
            >
              <p className="text-xs text-foreground leading-relaxed">{item.idea}</p>
              {provenance && (
                <p className="text-[10px] text-muted-foreground">{provenance}</p>
              )}
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
