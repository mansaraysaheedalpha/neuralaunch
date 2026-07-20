'use client';
// src/app/(app)/discovery/roadmap/[id]/packager/PackagerHandoffButtons.tsx
//
// Three handoff buttons rendered below the completed package.
// Each navigates to a sibling tool's standalone surface with query
// params identifying the source packager session. The receiving tool
// reads ?fromPackager=<sessionId> to pre-populate its own context.

import Link from 'next/link';

export interface PackagerHandoffButtonsProps {
  roadmapId:        string;
  packagerSessionId: string;
}

export function PackagerHandoffButtons({
  roadmapId, packagerSessionId,
}: PackagerHandoffButtonsProps) {
  const qs = `?roadmapId=${encodeURIComponent(roadmapId)}&fromPackager=${encodeURIComponent(packagerSessionId)}`;
  return (
    <section className="border border-rule-strong">
      <p className="border-b border-rule px-4 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">Continue the evidence chain</p>
      <div className="grid">
        <Link
          href={`/tools/outreach-composer${qs}`}
          className="flex items-center justify-between border-b border-rule px-4 py-3 font-serif text-[15px] italic text-fg hover:bg-accent/[0.04] hover:text-accent"
        >
          Draft outreach <span className="font-mono text-[10px] not-italic">→</span>
        </Link>
        <Link
          href={`/tools/conversation-coach${qs}`}
          className="flex items-center justify-between border-b border-rule px-4 py-3 font-serif text-[15px] italic text-fg hover:bg-accent/[0.04] hover:text-accent"
        >
          Rehearse the pitch <span className="font-mono text-[10px] not-italic">→</span>
        </Link>
        <Link
          href={`/tools/research${qs}`}
          className="flex items-center justify-between px-4 py-3 font-serif text-[15px] italic text-fg hover:bg-accent/[0.04] hover:text-accent"
        >
          Research the market <span className="font-mono text-[10px] not-italic">→</span>
        </Link>
      </div>
    </section>
  );
}
