'use client';
// src/components/institute/tools/TaskContextStrip.tsx
//
// Hairline strip above the body when a tool is launched from a roadmap
// task (`?task={id}` in the URL). Reminds the founder which task
// they're serving. Purely presentational — resolving the task title +
// phase name would need a dedicated GET endpoint; until that exists
// the strip shows the short task id and routes back to the tools
// index. The task title is left as a "Task" stamp so the founder
// knows the context is wired without seeing a placeholder.

import Link from 'next/link';

export interface TaskContextStripProps {
  taskId: string;
}

export function TaskContextStrip({ taskId }: TaskContextStripProps) {
  // taskIds in this codebase use the `p{N}-t{M}` shape minted by
  // buildTaskId (lib/roadmap/checkin-types). Surface the human-readable
  // shorthand (Phase N · Task M) when the id parses; fall back to the
  // raw short id otherwise.
  const parsed = /^p(\d+)-t(\d+)$/.exec(taskId);
  const human = parsed
    ? `Phase ${toRoman(Number(parsed[1]))} · Task ${Number(parsed[2]) + 1}`
    : `Task ${taskId.slice(0, 8)}`;

  return (
    <div className="border-b border-rule bg-bg-2 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted sm:px-12 lg:px-16">
      <span className="text-accent">Serving</span> · {human}
      <Link
        href="/discovery/recommendations"
        className="ml-3 underline underline-offset-2 transition-colors hover:text-fg"
      >
        ← Back to roadmap
      </Link>
    </div>
  );
}

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function toRoman(n: number): string {
  return ROMAN_NUMERALS[n - 1] ?? String(n);
}
