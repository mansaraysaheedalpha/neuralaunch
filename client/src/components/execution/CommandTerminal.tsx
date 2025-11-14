// src/components/execution/CommandTerminal.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Command {
  command: string;
  description?: string;
  output?: string;
  exitCode?: number;
  duration?: number;
  status?: "pending" | "running" | "success" | "failed";
  timestamp?: string | Date;
}

interface CommandTerminalProps {
  agentName: string;
  commands: Command[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  showTimestamps?: boolean;
  className?: string;
}

export function CommandTerminal({
  agentName,
  commands,
  collapsible = true,
  defaultCollapsed = false,
  showTimestamps = true,
  className = "",
}: CommandTerminalProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [expandedCommands, setExpandedCommands] = useState<Set<number>>(
    new Set()
  );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const toggleCommandExpand = (index: number) => {
    setExpandedCommands((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleCopyCommand = async (command: string, index: number) => {
    await navigator.clipboard.writeText(command);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const successCount = commands.filter((c) => c.status === "success").length;
  const failedCount = commands.filter((c) => c.status === "failed").length;
  const runningCount = commands.filter((c) => c.status === "running").length;
  const totalDuration = commands.reduce((sum, c) => sum + (c.duration || 0), 0);

  if (commands.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-lg border bg-card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
        <div className="flex items-center gap-3 flex-1">
          <Terminal className="w-4 h-4 text-primary" />
          <div>
            <h4 className="font-semibold text-sm">{agentName} Commands</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="secondary" className="text-xs">
                {commands.length} {commands.length === 1 ? "command" : "commands"}
              </Badge>
              {successCount > 0 && (
                <Badge variant="default" className="text-xs bg-green-600">
                  {successCount} ✓
                </Badge>
              )}
              {failedCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {failedCount} ✗
                </Badge>
              )}
              {runningCount > 0 && (
                <Badge variant="default" className="text-xs bg-blue-600">
                  {runningCount} running
                </Badge>
              )}
              {totalDuration > 0 && (
                <span className="text-xs text-muted-foreground">
                  • {formatDuration(totalDuration)}
                </span>
              )}
            </div>
          </div>
        </div>

        {collapsible && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 p-0"
          >
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>

      {/* Commands List */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="divide-y">
              {commands.map((cmd, index) => (
                <CommandItem
                  key={index}
                  command={cmd}
                  index={index}
                  isExpanded={expandedCommands.has(index)}
                  isCopied={copiedIndex === index}
                  onToggleExpand={toggleCommandExpand}
                  onCopy={handleCopyCommand}
                  showTimestamp={showTimestamps}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed State */}
      {isCollapsed && (
        <div className="p-3 bg-muted/20 text-sm text-muted-foreground text-center">
          <Terminal className="w-4 h-4 inline-block mr-2" />
          {commands.length} {commands.length === 1 ? "command" : "commands"} •
          Click to expand
        </div>
      )}
    </div>
  );
}

/**
 * Individual Command Item
 */
interface CommandItemProps {
  command: Command;
  index: number;
  isExpanded: boolean;
  isCopied: boolean;
  onToggleExpand: (index: number) => void;
  onCopy: (command: string, index: number) => void;
  showTimestamp: boolean;
}

function CommandItem({
  command,
  index,
  isExpanded,
  isCopied,
  onToggleExpand,
  onCopy,
  showTimestamp,
}: CommandItemProps) {
  const status = command.status || "success";
  const hasOutput = !!command.output;

  const statusConfig = {
    pending: {
      icon: <Clock className="w-4 h-4 text-muted-foreground" />,
      bgColor: "bg-muted/30",
      borderColor: "border-border",
    },
    running: {
      icon: <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />,
      bgColor: "bg-blue-50/50 dark:bg-blue-950/20",
      borderColor: "border-blue-200 dark:border-blue-900",
    },
    success: {
      icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
      bgColor: "bg-green-50/50 dark:bg-green-950/20",
      borderColor: "border-green-200 dark:border-green-900",
    },
    failed: {
      icon: <XCircle className="w-4 h-4 text-red-600" />,
      bgColor: "bg-red-50/50 dark:bg-red-950/20",
      borderColor: "border-red-200 dark:border-red-900",
    },
  };

  const config = statusConfig[status];

  return (
    <div className={`border-l-4 ${config.borderColor}`}>
      <div className={`p-3 ${config.bgColor}`}>
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <div className="flex-shrink-0 mt-0.5">{config.icon}</div>

          {/* Command Info */}
          <div className="flex-1 min-w-0">
            {/* Command Text */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <code className="text-sm font-mono text-foreground break-all">
                $ {command.command}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopy(command.command, index)}
                className="h-6 w-6 p-0 flex-shrink-0"
                title="Copy command"
              >
                {isCopied ? (
                  <Check className="w-3 h-3 text-green-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
            </div>

            {/* Description */}
            {command.description && (
              <p className="text-xs text-muted-foreground mb-2">
                {command.description}
              </p>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {command.exitCode !== undefined && (
                <span>
                  Exit code: <code className="font-mono">{command.exitCode}</code>
                </span>
              )}
              {command.duration !== undefined && (
                <span>Duration: {formatDuration(command.duration)}</span>
              )}
              {showTimestamp && command.timestamp && (
                <span>
                  {new Date(command.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>

            {/* Output Toggle */}
            {hasOutput && (
              <button
                onClick={() => onToggleExpand(index)}
                className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    Hide output
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show output
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Command Output */}
        <AnimatePresence>
          {isExpanded && hasOutput && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 overflow-hidden"
            >
              <div className="rounded bg-black/80 dark:bg-black/50 p-3 max-h-60 overflow-y-auto">
                <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                  {command.output}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Format duration in ms to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Batch terminal for multiple agents
 */
interface CommandTerminalListProps {
  agentCommands: Array<{
    agentName: string;
    commands: Command[];
  }>;
  defaultCollapsed?: boolean;
  className?: string;
}

export function CommandTerminalList({
  agentCommands,
  defaultCollapsed = false,
  className = "",
}: CommandTerminalListProps) {
  if (agentCommands.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {agentCommands.map((ac, index) => (
        <CommandTerminal
          key={`${ac.agentName}-${index}`}
          agentName={ac.agentName}
          commands={ac.commands}
          defaultCollapsed={defaultCollapsed}
        />
      ))}
    </div>
  );
}
