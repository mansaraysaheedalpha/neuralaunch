'use client';
// src/app/(app)/tools/page.tsx
//
// Tools listing page. Shows all available tools with a brief
// description and a launch button. Tools require a completed
// discovery session with a recommendation and roadmap because
// their entire value is context-awareness.
//
// Tier gate: the four tools are Execute+ entitlements (server-side
// gating already exists on every /api/discovery/roadmaps/[id]/{coach,
// composer,research,packager}/* route per the Paddle delivery report).
// This page mirrors that boundary in the UI so Free users do not see
// tiles they cannot use — they get an UpgradePrompt instead.

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MessageSquare, Mail, Search, Package } from 'lucide-react';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';

const TOOLS = [
  {
    id:          'conversation-coach',
    name:        'Conversation Coach',
    description: 'Prepare for and rehearse high-stakes conversations. Get a structured script, objection handling, fallback positions, and practice with an AI role-play partner.',
    icon:        MessageSquare,
    href:        '/tools/conversation-coach',
    status:      'available' as const,
  },
  {
    id:          'outreach-composer',
    name:        'Outreach Composer',
    description: 'Draft ready-to-send outreach messages for WhatsApp, email, and LinkedIn. Three modes: single message to a specific person, batch messages to similar people, and multi-touch follow-up sequences.',
    icon:        Mail,
    href:        '/tools/outreach-composer',
    status:      'available' as const,
  },
  {
    id:          'research',
    name:        'Research Tool',
    description: 'Ask any question about your market, competitors, potential customers, regulations, or pricing. The tool conducts a deep, multi-source investigation and returns a structured, cited report specific to your context.',
    icon:        Search,
    href:        '/tools/research',
    status:      'available' as const,
  },
  {
    id:          'service-packager',
    name:        'Service Packager',
    description: 'Turn your skill into a structured service offering with tiered pricing, revenue scenarios, and a one-page brief you can share with prospects today. Especially useful when your recommendation is to build a service.',
    icon:        Package,
    href:        '/tools/service-packager',
    status:      'available' as const,
  },
];

export default function ToolsPage() {
  // Match the loading-state pattern used in RecommendationReveal:
  // collapse undefined / loading session to 'free' and let the
  // UpgradePrompt render. Once the session resolves to execute or
  // compound, the tiles render. A free user never sees the tiles;
  // a paid user sees a brief UpgradePrompt flash on cold load that
  // resolves to the tiles within one render cycle.
  const { data: session } = useSession();
  const tier        = session?.user?.tier ?? 'free';
  const isFreeTier  = tier === 'free';

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Tools</h1>
        <p className="text-sm text-muted-foreground">
          Execution tools that use your discovery context to produce ready-to-use outputs.
        </p>
      </div>

      {isFreeTier ? (
        <UpgradePrompt
          requiredTier="execute"
          variant="hero"
          heading="Unlock the execution tools"
          description="Conversation Coach, Outreach Composer, Research Tool, and Service Packager are part of Execute. Upgrade to use them on any task in your roadmap — or open them standalone from this page."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {TOOLS.map(tool => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.id}
                href={tool.href}
                className="rounded-xl border border-border bg-card p-4 flex items-start gap-4 hover:border-primary/40 hover:bg-primary/5 transition-colors"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{tool.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
