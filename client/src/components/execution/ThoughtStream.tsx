// components/execution/ThoughtStreamEnhanced.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Brain,
  Database,
  Zap,
  Search,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  Play,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Thought {
  id: string;
  agentName: string;
  projectId: string;
  type: ThoughtType;
  message: string;
  timestamp: string | Date;
  metadata?: Record<string, any>;
  mode?: "curated" | "deep_dive" | "both";
  rawReasoning?: string;
}

type ThoughtType =
  | "starting"
  | "thinking"
  | "accessing"
  | "analyzing"
  | "deciding"
  | "executing"
  | "completing"
  | "error"
  | "deep_reasoning";

const THOUGHT_ICONS: Record<ThoughtType, React.ReactNode> = {
  starting: <Play className="w-4 h-4" />,
  thinking: <Brain className="w-4 h-4" />,
  accessing: <Database className="w-4 h-4" />,
  analyzing: <Search className="w-4 h-4" />,
  deciding: <Lightbulb className="w-4 h-4" />,
  executing: <Zap className="w-4 h-4" />,
  completing: <CheckCircle className="w-4 h-4" />,
  error: <AlertTriangle className="w-4 h-4" />,
  deep_reasoning: <Brain className="w-4 h-4" />,
};

const THOUGHT_COLORS: Record<ThoughtType, string> = {
  starting:
    "text-blue-600 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
  thinking:
    "text-purple-600 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800",
  accessing:
    "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800",
  analyzing:
    "text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
  deciding:
    "text-green-600 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
  executing:
    "text-blue-700 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
  completing:
    "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
  error:
    "text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
  deep_reasoning:
    "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800",
};

const THOUGHT_LABELS: Record<ThoughtType, string> = {
  starting: "Starting",
  thinking: "Thinking",
  accessing: "Accessing",
  analyzing: "Analyzing",
  deciding: "Deciding",
  executing: "Executing",
  completing: "Completing",
  error: "Error",
  deep_reasoning: "Deep Reasoning",
};

interface ThoughtStreamEnhancedProps {
  thoughts: Thought[];
  agentName?: string;
  maxVisible?: number;
  showMetadata?: boolean;
  className?: string;
  allowDeepDive?: boolean; // ✅ NEW: Enable deep dive toggle
}

export function ThoughtStreamEnhanced({
  thoughts,
  agentName,
  maxVisible = 10,
  showMetadata = true,
  className = "",
  allowDeepDive = true,
}: ThoughtStreamEnhancedProps) {
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(
    new Set()
  );

  // Filter thoughts by agent if specified
  const filteredThoughts = agentName
    ? thoughts.filter((t) => t.agentName === agentName)
    : thoughts;

  // Filter by mode if deep dive is off
  const visibleThoughts = showDeepDive
    ? filteredThoughts
    : filteredThoughts.filter((t) => t.mode !== "deep_dive");

  // Get most recent thoughts
  const displayedThoughts = visibleThoughts.slice(-maxVisible);

  // Count deep dive thoughts
  const deepDiveCount = filteredThoughts.filter(
    (t) => t.mode === "deep_dive" || t.mode === "both"
  ).length;

  const toggleExpand = (thoughtId: string) => {
    setExpandedThoughts((prev) => {
      const next = new Set(prev);
      if (next.has(thoughtId)) {
        next.delete(thoughtId);
      } else {
        next.add(thoughtId);
      }
      return next;
    });
  };

  if (filteredThoughts.length === 0) {
    return (
      <div
        className={`text-center py-8 text-muted-foreground text-sm ${className}`}
      >
        <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No thoughts yet...</p>
        <p className="text-xs mt-1">Agent will start thinking soon</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ✅ Deep Dive Toggle */}
      {allowDeepDive && deepDiveCount > 0 && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 text-sm">
            <Brain className="w-4 h-4 text-indigo-600" />
            <span className="font-medium">Deep Dive Mode</span>
            <Badge variant="secondary" className="text-xs">
              {deepDiveCount} raw thoughts
            </Badge>
          </div>
          <Button
            variant={showDeepDive ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDeepDive(!showDeepDive)}
            className="h-8"
          >
            {showDeepDive ? (
              <>
                <EyeOff className="w-3 h-3 mr-1" />
                Hide Raw
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 mr-1" />
                Show Raw
              </>
            )}
          </Button>
        </div>
      )}

      {/* Thoughts List */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {displayedThoughts.map((thought, index) => {
            const isExpanded = expandedThoughts.has(thought.id);
            const hasRawReasoning = !!thought.rawReasoning;

            return (
              <motion.div
                key={thought.id}
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                transition={{
                  duration: 0.3,
                  delay: index * 0.03,
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                }}
                layout
                className={`
                  rounded-lg border
                  ${THOUGHT_COLORS[thought.type]}
                  transition-all duration-200
                  hover:shadow-sm
                `}
              >
                {/* Main Content */}
                <div className="flex items-start gap-3 p-3">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {THOUGHT_ICONS[thought.type]}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Type Label & Timestamp */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                        {THOUGHT_LABELS[thought.type]}
                      </span>
                      {thought.mode && thought.mode !== "curated" && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0"
                        >
                          {thought.mode === "deep_dive" ? "🧠 RAW" : "🔄 BOTH"}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatTimestamp(thought.timestamp)}
                      </span>
                    </div>

                    {/* Message */}
                    <p className="text-sm font-medium text-foreground/90 break-words leading-relaxed">
                      {thought.message}
                    </p>

                    {/* Metadata */}
                    {showMetadata &&
                      thought.metadata &&
                      Object.keys(thought.metadata).length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="mt-2 p-2 rounded bg-black/5 dark:bg-white/5"
                        >
                          <div className="text-xs text-muted-foreground font-mono space-y-1">
                            {Object.entries(thought.metadata)
                              .filter(
                                ([key]) =>
                                  !["mode", "rawReasoning"].includes(key)
                              )
                              .map(([key, value]) => (
                                <div key={key} className="flex gap-2">
                                  <span className="font-semibold">{key}:</span>
                                  <span className="break-all">
                                    {typeof value === "object"
                                      ? JSON.stringify(value)
                                      : String(value)}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </motion.div>
                      )}
                  </div>

                  {/* Expand Button for Raw Reasoning */}
                  {hasRawReasoning && (
                    <button
                      onClick={() => toggleExpand(thought.id)}
                      className="flex-shrink-0 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>

                {/* ✅ Expandable Raw Reasoning */}
                <AnimatePresence>
                  {isExpanded && thought.rawReasoning && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t overflow-hidden"
                    >
                      <div className="p-3 bg-black/5 dark:bg-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain className="w-3 h-3 text-indigo-600" />
                          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                            Raw AI Reasoning
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-white/50 dark:bg-black/20 p-2 rounded max-h-60 overflow-y-auto">
                          {thought.rawReasoning}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: string | Date): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "just now";
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Export ThoughtStream as an alias for backward compatibility
export const ThoughtStream = ThoughtStreamEnhanced;

// Export skeleton component for loading states
export function ThoughtStreamSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"
        >
          <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4" />
            <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
