'use client';
// src/app/(app)/tools/page.tsx
//
// Tools index — Institute ledger pattern. Replaces the tile + tinted-
// icon-square grid with the §-03-Toolkit-row layout from the landing.
// Roman index, italic-serif name accent, mono model tag, one-line
// description, arrow on hover. Tier gating (Execute+) preserved.

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopBar, Pill } from '@/components/institute';
import { ToolsLedger, type ToolListing } from '@/components/institute/tools';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';

const TOOLS: ToolListing[] = [
  {
    roman:       '001',
    name:        'Conversation',
    nameAccent:  'Coach',
    model:       'Opus',
    description:
      'Rehearse a high-stakes conversation. Channel-native opening, anticipated objections, fallback positions — then a role-play in character.',
    href:        '/tools/conversation-coach',
  },
  {
    roman:       '002',
    name:        'Outreach',
    nameAccent:  'Composer',
    model:       'Sonnet',
    description:
      'Single message, batch variations, or a D1 / D5 / D14 sequence — WhatsApp, email, LinkedIn. Each with a note on why it works.',
    href:        '/tools/outreach-composer',
  },
  {
    roman:       '003',
    name:        'Research',
    nameAccent:  'Tool',
    model:       'Opus · 25 step',
    description:
      'Plain-language query, structured findings, source URLs, confidence labels — verified, likely, unverified.',
    href:        '/tools/research',
  },
  {
    roman:       '004',
    name:        'Service',
    nameAccent:  'Packager',
    model:       'Sonnet',
    description:
      'Three priced tiers from your situation. Starter, Pro, Premium — with revenue scenarios and reasoning.',
    href:        '/tools/service-packager',
  },
  {
    roman:       '005',
    name:        'Validation',
    nameAccent:  'Page',
    model:       'Public',
    description:
      'A live landing page with surveys and analytics. Real demand signal before you write a line of code.',
    href:        '/tools/validation',
  },
];

export default function ToolsPage() {
  // Loading-state pattern matches RecommendationReveal: collapse
  // undefined / loading session to 'free' and let the UpgradePrompt
  // render. Paid users see the ledger after one render cycle.
  const { data: session } = useSession();
  const tier = session?.user?.tier ?? 'free';
  const isFreeTier = tier === 'free';

  return (
    <div className="flex h-full flex-col">
      <TopBar
        crumb={[
          { label: 'Tools', accent: true },
          { label: 'All', current: true },
        ]}
        rightStatus={<Pill accent>● 5 execution tools</Pill>}
        rightActions={
          <Link href="/discovery/recommendations" className="text-muted transition-colors hover:text-fg">
            ← Recommendations
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <header className="border-b border-rule px-6 pb-7 pt-12 sm:px-12 lg:px-16">
          <div className="mb-5 flex flex-wrap gap-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            <span>The toolkit · execute tier</span>
            <span>5 tools · for the work that decides the outcome</span>
          </div>
          <h1 className="font-sans text-fg [font-size:clamp(40px,5.2vw,72px)] [font-weight:500] [line-height:1] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
            Five tools, for the work<br />that decides the <em>outcome.</em>
          </h1>
          <p className="mt-5 max-w-[760px] text-[16px] leading-[1.55] text-fg-2 [&_em]:font-serif [&_em]:italic [&_em]:text-accent">
            Every tool reads your discovery context and produces a
            ready-to-use output. Launch from a task in your roadmap to
            scope a tool to that task, or open one standalone here.
          </p>
        </header>

        <div className="px-6 pb-20 pt-12 sm:px-12 lg:px-16">
          {isFreeTier ? (
            <UpgradePrompt
              requiredTier="execute"
              variant="hero"
              heading="Unlock the execution tools"
              description="Conversation Coach, Outreach Composer, Research Tool, Service Packager, and Validation Page are part of Execute. Upgrade to use them on any task in your roadmap — or open them standalone from this page."
            />
          ) : (
            <ToolsLedger tools={TOOLS} />
          )}
        </div>
      </div>
    </div>
  );
}
