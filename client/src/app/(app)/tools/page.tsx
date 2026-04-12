'use client';
// src/app/(app)/tools/page.tsx
//
// Tools listing page. Shows all available tools with a brief
// description and a launch button. Tools require a completed
// discovery session with a recommendation and roadmap because
// their entire value is context-awareness.

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';

const TOOLS = [
  {
    id:          'conversation-coach',
    name:        'Conversation Coach',
    description: 'Prepare for and rehearse high-stakes conversations. Get a structured script, objection handling, fallback positions, and practice with an AI role-play partner.',
    icon:        MessageSquare,
    href:        '/tools/conversation-coach',
    status:      'available' as const,
  },
  // Future tools slot in here:
  // { id: 'outreach-composer', name: 'Outreach Composer', ... status: 'coming_soon' },
  // { id: 'service-packager', name: 'Service Packager', ... status: 'coming_soon' },
];

export default function ToolsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Tools</h1>
        <p className="text-sm text-muted-foreground">
          Execution tools that use your discovery context to produce ready-to-use outputs.
        </p>
      </div>

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
    </div>
  );
}
