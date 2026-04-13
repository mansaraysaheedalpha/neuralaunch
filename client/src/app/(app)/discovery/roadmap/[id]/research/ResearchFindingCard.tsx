'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchFindingCard.tsx
//
// Renders a single research finding card. Adapts presentation per type:
//   - business/person: contact info with copy buttons and links
//   - competitor: positioning, pricing, strengths/weaknesses
//   - regulation: source document and jurisdiction
//   - datapoint/tool/insight: confidence badge + description

import { useState, useCallback } from 'react';
import { Copy, Check, ExternalLink, MapPin } from 'lucide-react';
// Import directly from schemas, not the barrel — client-safe.
import type { ResearchFinding } from '@/lib/roadmap/research-tool/schemas';

const CONFIDENCE_BADGE: Record<string, string> = {
  verified:   'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
  likely:     'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20',
  unverified: 'bg-muted text-muted-foreground border-border',
};

const TYPE_LABEL: Record<string, string> = {
  business:   'Business',
  person:     'Person',
  competitor: 'Competitor',
  datapoint:  'Data point',
  regulation: 'Regulation',
  tool:       'Tool',
  insight:    'Insight',
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [text]);

  return (
    <button
      type="button"
      onClick={() => { void handleCopy(); }}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      title={`Copy ${label}`}
    >
      {copied
        ? <Check className="size-3 text-green-500" />
        : <Copy className="size-3" />
      }
      {label}
    </button>
  );
}

export interface ResearchFindingCardProps {
  finding: ResearchFinding;
}

/**
 * ResearchFindingCard
 *
 * Adapts per finding type. Business/person cards surface contact info
 * with copy buttons. Competitor cards highlight positioning. Regulation
 * cards show source documents. All cards show a confidence badge and a
 * link to the source.
 */
export function ResearchFindingCard({ finding }: ResearchFindingCardProps) {
  const badgeClass = CONFIDENCE_BADGE[finding.confidence] ?? CONFIDENCE_BADGE.unverified;
  const typeLabel  = TYPE_LABEL[finding.type] ?? finding.type;

  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-foreground leading-snug flex-1 break-words">
          {finding.title}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[9px] uppercase tracking-wider font-medium rounded-full border px-1.5 py-0.5 ${badgeClass}`}>
            {finding.confidence}
          </span>
          <span className="text-[9px] uppercase tracking-wider font-medium text-muted-foreground">
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-foreground/80 leading-relaxed break-words">
        {finding.description}
      </p>

      {/* Location */}
      {finding.location && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span>{finding.location}</span>
        </div>
      )}

      {/* Contact info — business/person types */}
      {finding.contactInfo && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
          {finding.contactInfo.website && (
            <a
              href={finding.contactInfo.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              Website
            </a>
          )}
          {finding.contactInfo.phone && (
            <CopyButton text={finding.contactInfo.phone} label={finding.contactInfo.phone} />
          )}
          {finding.contactInfo.email && (
            <CopyButton text={finding.contactInfo.email} label={finding.contactInfo.email} />
          )}
          {finding.contactInfo.physicalAddress && (
            <CopyButton text={finding.contactInfo.physicalAddress} label="Address" />
          )}
          {finding.contactInfo.socialMedia?.map((sm, i) => (
            <a
              key={i}
              href={sm.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              {sm.platform} {sm.handle}
            </a>
          ))}
        </div>
      )}

      {/* Source link */}
      {finding.sourceUrl && (
        <a
          href={finding.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink className="size-3" />
          Source
        </a>
      )}
    </div>
  );
}
