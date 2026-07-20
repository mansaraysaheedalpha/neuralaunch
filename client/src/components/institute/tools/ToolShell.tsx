"use client";
// src/components/institute/tools/ToolShell.tsx
//
// Shared Institute chrome for every tool page (/tools/*). Renders the
// TopBar + header band + (optional) task-context strip, then yields
// the body to its children. Per-tool input/output layout lives inside
// children — the interior structure is a per-tool decision (each tool
// has different UX: chat for Coach, segmented form for Composer, query
// + findings for Research, etc.).
//
// Task-scoped invocations: read `?task={id}` from the URL. When set,
// TaskContextStrip renders above the body with a ← Back to roadmap
// link. The strip is purely presentational — task title resolution
// would need a dedicated GET endpoint; this PR keeps the strip light
// (short task id only) and flags the fuller resolution for later.

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { TopBar, Pill, type BreadcrumbItem } from "@/components/institute";
import { TaskContextStrip } from "./TaskContextStrip";
import { ToolHeader, type ToolHeaderProps } from "./ToolHeader";

export interface ToolShellProps extends ToolHeaderProps {
  /**
   * Crumb left of the tool name. Defaults to "Tools" (the standalone
   * entry surface). When task-scoped, the parent can pass a richer
   * crumb (e.g. Ventures / {venture} / {task title} / {tool name}) —
   * the spec calls for that shape when launched from a roadmap, but
   * resolving venture / task names needs a server fetch; until that
   * exists, the default keeps the crumb honest.
   */
  crumbHead?: BreadcrumbItem[];
  /** Pill model label, e.g. "Opus" / "Sonnet" / "Public". */
  model: string;
  /** Display name in the crumb tail + Pill caption. */
  toolName: string;
  /**
   * Skip the standard body padding around children. Tools that want
   * to render a full-bleed multi-column layout (Research's two-column
   * shell, for example) opt in to this and own their own gutters and
   * centre rule. Defaults to false.
   */
  flush?: boolean;
  /** Children render below the header (and below the optional task strip). */
  children: ReactNode;
}

export function ToolShell({
  crumbHead,
  model,
  toolName,
  roman,
  description,
  heading,
  lede,
  flush,
  children,
}: ToolShellProps) {
  // Read the launched-from-task signal. When present, render the task
  // strip + adjust the crumb to read "Tools / {tool} / Task {short}".
  // PR 16 added the optional &roadmap= param so the task strip's back
  // link can route to the precise roadmap rather than the index.
  const crumb: BreadcrumbItem[] = [
    ...(crumbHead ?? [{ label: "Tools", accent: true, href: "/tools" }]),
    { label: toolName, current: true },
  ];

  // Right-rail action — the All-tools fallback is identical whether
  // task-scoped or standalone (the precise roadmap link lives in the
  // task strip below). One link instead of two identical branches.
  const rightActions = (
    <Link href="/tools" className="text-muted transition-colors hover:text-fg">
      ← All tools
    </Link>
  );

  return (
    <div className="tool-a11y flex h-full flex-col">
      <a
        href="#tool-workspace"
        className="sr-only z-50 bg-accent px-4 py-3 text-bg focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Skip to tool workspace
      </a>
      <TopBar
        crumb={crumb}
        rightStatus={<Pill accent>{model}</Pill>}
        rightActions={rightActions}
      />

      <main id="tool-workspace" className="flex-1 overflow-y-auto">
        <ToolHeader
          roman={roman}
          name={toolName}
          model={model}
          description={description}
          heading={heading}
          lede={lede}
        />

        <Suspense fallback={null}>
          <TaskContextFromUrl />
        </Suspense>

        {flush ? (
          <>{children}</>
        ) : (
          <div className="px-6 pb-20 pt-8 sm:px-12 lg:px-16">{children}</div>
        )}
      </main>
    </div>
  );
}

function TaskContextFromUrl() {
  const params = useSearchParams();
  const taskId = params.get("task");
  if (!taskId) return null;
  return <TaskContextStrip taskId={taskId} roadmapId={params.get("roadmap")} />;
}
