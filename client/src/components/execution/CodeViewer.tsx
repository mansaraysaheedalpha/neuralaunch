// src/components/execution/CodeViewer.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code,
  Copy,
  Check,
  Download,
  ChevronDown,
  ChevronUp,
  FileCode,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeViewerProps {
  file: {
    path: string;
    content: string;
    language?: string;
    linesOfCode?: number;
  };
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  showLineNumbers?: boolean;
  maxHeight?: string;
  className?: string;
}

export function CodeViewer({
  file,
  collapsible = true,
  defaultCollapsed = false,
  showLineNumbers = true,
  maxHeight = "600px",
  className = "",
}: CodeViewerProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const language = file.language || detectLanguage(file.path);
  const fileName = file.path.split("/").pop() || file.path;
  const fileExt = fileName.split(".").pop() || "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const linesCount = file.content.split("\n").length;

  return (
    <div
      className={`rounded-lg border bg-card overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <FileCode className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm font-medium truncate">
              {file.path}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="secondary" className="text-xs">
                {language}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {linesCount} {linesCount === 1 ? "line" : "lines"}
              </span>
              {file.linesOfCode && (
                <span className="text-xs text-muted-foreground">
                  • {file.linesOfCode} LOC
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="h-8 w-8 p-0"
            title={isDarkMode ? "Light theme" : "Dark theme"}
          >
            {isDarkMode ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
          </Button>

          {/* Copy */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-8 w-8 p-0"
            title="Copy code"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </Button>

          {/* Download */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-8 w-8 p-0"
            title="Download file"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>

          {/* Collapse Toggle */}
          {collapsible && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-8 w-8 p-0"
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Code Content */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="overflow-auto"
              style={{ maxHeight }}
            >
              <SyntaxHighlighter
                language={language}
                style={isDarkMode ? vscDarkPlus : vs}
                showLineNumbers={showLineNumbers}
                wrapLines={true}
                customStyle={{
                  margin: 0,
                  padding: "1rem",
                  fontSize: "0.875rem",
                  background: isDarkMode ? "transparent" : "#ffffff",
                }}
                lineNumberStyle={{
                  minWidth: "3em",
                  paddingRight: "1em",
                  color: isDarkMode ? "#6e7681" : "#999",
                  userSelect: "none",
                }}
              >
                {file.content}
              </SyntaxHighlighter>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed Preview */}
      {isCollapsed && (
        <div className="p-3 bg-muted/20 text-sm text-muted-foreground text-center">
          <Code className="w-4 h-4 inline-block mr-2" />
          Code collapsed • Click to expand
        </div>
      )}
    </div>
  );
}

/**
 * Detect programming language from file path
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    cs: "csharp",
    php: "php",
    html: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    sh: "bash",
    bash: "bash",
    sql: "sql",
    graphql: "graphql",
    prisma: "prisma",
    dockerfile: "dockerfile",
    env: "bash",
  };

  return languageMap[ext || ""] || "javascript";
}

/**
 * Batch viewer for multiple files
 */
interface CodeViewerListProps {
  files: Array<{
    path: string;
    content: string;
    language?: string;
    linesOfCode?: number;
  }>;
  defaultCollapsed?: boolean;
  maxHeight?: string;
  className?: string;
}

export function CodeViewerList({
  files,
  defaultCollapsed = true,
  maxHeight = "600px",
  className = "",
}: CodeViewerListProps) {
  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>No files to display</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {files.map((file, index) => (
        <CodeViewer
          key={`${file.path}-${index}`}
          file={file}
          collapsible={true}
          defaultCollapsed={defaultCollapsed}
          maxHeight={maxHeight}
        />
      ))}
    </div>
  );
}
