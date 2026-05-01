// src/app/(app)/discovery/roadmap/[id]/time-budget-shortener.ts
//
// Pure helper that compresses a freeform RoadmapTask.timeEstimate string
// into a short hour/week/evening pill suitable for a collapsed task row.
// The full sentence ("6-8 hours spread across week 1 of this phase…")
// stays in the TIME BUDGET cell of the expanded card; this helper feeds
// only the compact chip on the row spine, where the previous full-string
// rendering was eating ~250px of horizontal real estate and forcing the
// task title to wrap.
//
// Parsing rules, applied in order — first match wins:
//   "10-12 hours …"   → "10-12h"
//   "6-8h …"          → "6-8h"
//   "3 hours …"       → "3h"
//   "1 week"          → "1w"
//   "2-3 weeks …"     → "2-3w"
//   "1 evening"       → "1 ev"
//   "3 evenings …"    → "3 ev"
//   anything else     → first 8 chars + "…" (defensive fallback so a
//                       genuinely free-form estimate like "ongoing"
//                       still renders something readable)

const HOUR_RE    = /^\s*(\d+(?:[-–]\d+)?)\s*(?:h\b|hours?\b|hrs?\b)/i;
const WEEK_RE    = /^\s*(\d+(?:[-–]\d+)?)\s*weeks?\b/i;
const EVENING_RE = /^\s*(\d+)\s*evenings?\b/i;

export function shortenTimeEstimate(s: string): string {
  if (!s) return '—';
  const trimmed = s.trim();

  const hour = trimmed.match(HOUR_RE);
  if (hour) return `${hour[1].replace('–', '-')}h`;

  const week = trimmed.match(WEEK_RE);
  if (week) return `${week[1].replace('–', '-')}w`;

  const eve = trimmed.match(EVENING_RE);
  if (eve) return `${eve[1]} ev`;

  // Defensive fallback for unrecognised phrasing.
  return trimmed.length > 10 ? `${trimmed.slice(0, 8).trimEnd()}…` : trimmed;
}
