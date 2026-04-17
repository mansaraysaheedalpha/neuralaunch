'use client';
// src/app/(app)/discovery/roadmap/[id]/continuation/BriefSections.tsx

import { useState } from 'react';
import { motion } from 'motion/react';
import { Bookmark, ChevronDown } from 'lucide-react';
import type { ContinuationBrief } from '@/lib/continuation';

/**
 * BriefSections — pure presentation of the four read-only sections
 * of the continuation brief: What Happened, What I Got Wrong, What
 * the Evidence Says, and the Parking Lot. The interactive forks
 * section is rendered separately by ForkPicker so the picker can
 * own its own selection state.
 *
 * The parking lot is visually subordinate — lighter border, smaller
 * heading, collapsed by default — so it never competes with the
 * fork picker decision moment.
 */
export function BriefSections({ brief }: { brief: ContinuationBrief }) {
  return (
    <div className="flex flex-col gap-5">
      <Section index={1} label="What happened" body={brief.whatHappened} />
      <Section index={2} label="What I got wrong" body={brief.whatIGotWrong} accent="gold" />
      <Section index={3} label="What the evidence says" body={brief.whatTheEvidenceSays} />

      {/* Section 5 — parking lot. Visually subordinate to the fork
          picker. Collapsed by default so the decision moment is the
          first thing below the evidence sections. */}
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
  accent?: 'gold';
}

function Section({ index, label, body, accent }: SectionProps) {
  const accentClass = accent === 'gold'
    ? 'border-gold/30 bg-gold/5'
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
  const [expanded, setExpanded] = useState(false);
  const count = brief.parkingLotItems.length;

  if (count === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/50 bg-card/50 px-5 py-3 flex flex-col gap-1"
      >
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
          5. Parking lot
        </p>
        <p className="text-xs text-muted-foreground/60 italic">
          Nothing parked during this roadmap.
        </p>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/50 px-5 py-3 flex flex-col gap-2"
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <Bookmark className="size-3" />
        5. Parking lot ({count} idea{count !== 1 ? 's' : ''})
        <ChevronDown className={`size-3 transition-transform duration-fast ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <motion.ul
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex flex-col gap-2 overflow-hidden"
        >
          {brief.parkingLotItems.map((item, i) => {
            const provenance = item.taskContext
              ? `from "${item.taskContext}"`
              : item.surfacedFrom
                ? `surfaced via ${item.surfacedFrom}`
                : null;
            return (
              <li
                key={i}
                className="rounded-lg border border-border/50 bg-background px-3 py-2 flex flex-col gap-1"
              >
                <p className="text-xs text-foreground/80 leading-relaxed">{item.idea}</p>
                {provenance && (
                  <p className="text-[10px] text-muted-foreground/60">{provenance}</p>
                )}
              </li>
            );
          })}
        </motion.ul>
      )}
    </motion.section>
  );
}
