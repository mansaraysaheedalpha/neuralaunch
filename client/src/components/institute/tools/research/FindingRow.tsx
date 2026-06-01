// src/components/institute/tools/research/FindingRow.tsx
//
// One row in the findings ledger. Two-column grid (claim + sources on
// the left, confidence stamp on the right). Sources render as mono
// underlined links; an unverified finding with no source surfaces
// "No authoritative source found" honestly rather than blanking out.

import { ExternalLink } from 'lucide-react';
import type { ResearchFinding } from '@/lib/roadmap/research-tool/schemas';
import { ConfidenceStamp } from './ConfidenceStamp';

export interface FindingRowProps {
  finding: ResearchFinding;
}

export function FindingRow({ finding }: FindingRowProps) {
  const hasSource = finding.sourceUrl && finding.sourceUrl.trim().length > 0;
  return (
    <li className="grid grid-cols-[1fr_auto] items-start gap-[18px] border-b border-rule py-[18px] last:border-b-0">
      <div className="min-w-0 flex flex-col gap-2">
        <p className="text-[15.5px] leading-[1.55] text-fg [&_b]:font-medium [&_b]:text-fg">
          <b className="block mb-1 text-fg">{finding.title}</b>
          {finding.description}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {hasSource ? (
            <SourceLink url={finding.sourceUrl} type={finding.type} location={finding.location} />
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              — · No authoritative source found
            </span>
          )}
        </div>
      </div>
      <ConfidenceStamp level={finding.confidence} />
    </li>
  );
}

function SourceLink({ url, type, location }: { url: string; type: string; location?: string }) {
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 border-b border-rule pb-px font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <span className="normal-case tracking-normal font-sans text-[12px] text-fg-2">{host}</span>
      <span aria-hidden="true">·</span>
      <span>{type}{location ? ` · ${location}` : ''}</span>
      <ExternalLink aria-hidden="true" className="size-3" />
    </a>
  );
}
