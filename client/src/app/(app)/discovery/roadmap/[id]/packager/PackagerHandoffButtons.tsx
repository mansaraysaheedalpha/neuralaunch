'use client';
// src/app/(app)/discovery/roadmap/[id]/packager/PackagerHandoffButtons.tsx
//
// Three handoff buttons rendered below the completed package.
// Each navigates to a sibling tool's standalone surface with query
// params identifying the source packager session. The receiving tool
// reads ?fromPackager=<sessionId> to pre-populate its own context.

import Link from 'next/link';
import { Mail, MessageCircle, Search } from 'lucide-react';

export interface PackagerHandoffButtonsProps {
  roadmapId:        string;
  packagerSessionId: string;
}

export function PackagerHandoffButtons({
  roadmapId, packagerSessionId,
}: PackagerHandoffButtonsProps) {
  const qs = `?roadmapId=${encodeURIComponent(roadmapId)}&fromPackager=${encodeURIComponent(packagerSessionId)}`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Next steps</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Link
          href={`/tools/outreach-composer${qs}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <Mail className="size-3 shrink-0" />
          Draft outreach with this package →
        </Link>
        <Link
          href={`/tools/conversation-coach${qs}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
        >
          <MessageCircle className="size-3 shrink-0" />
          Prepare to pitch this →
        </Link>
        <Link
          href={`/tools/research${qs}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Search className="size-3 shrink-0" />
          Research more about this market →
        </Link>
      </div>
    </div>
  );
}
