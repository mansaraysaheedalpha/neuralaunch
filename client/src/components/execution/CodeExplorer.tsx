// src/components/execution/CodeExplorer.tsx
"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder,
  FolderOpen,
  FileCode,
  ChevronRight,
  ChevronDown,
  Code,
  Search,
  Download,
  FolderTree,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CodeViewer } from "./CodeViewer";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  content?: string;
  linesOfCode?: number;
}

interface CodeExplorerProps {
  projectId: string;
  waveNumber?: number;
  files: Array<{
    path: string;
    content: string;
    linesOfCode?: number;
  }>;
  className?: string;
}

export function CodeExplorer({
  projectId,
  waveNumber,
  files,
  className = "",
}: CodeExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["/"])
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Build file tree from flat file list
  const fileTree = useMemo(() => buildFileTree(files), [files]);

  // Filter tree by search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return fileTree;
    return filterTree(fileTree, searchQuery.toLowerCase());
  }, [fileTree, searchQuery]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleFileClick = (path: string) => {
    setSelectedFile(path);
  };

  const handleDownloadAll = () => {
    // Create a zip of all files (simplified version)
    const filesData = files.map((f) => ({
      path: f.path,
      content: f.content,
    }));

    const dataStr = JSON.stringify(filesData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project-${projectId}-wave-${waveNumber || "all"}-files.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const selectedFileData = files.find((f) => f.path === selectedFile);
  const totalFiles = files.length;
  const totalLines = files.reduce((sum, f) => sum + (f.linesOfCode || 0), 0);

  return (
    <div className={`flex gap-4 ${className}`}>
      {/* Left Sidebar - File Tree */}
      <div className="w-80 flex-shrink-0 space-y-3">
        {/* Header */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">File Explorer</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownloadAll}
              title="Download all files"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>

          {/* Stats */}
          <div className="flex gap-3 text-sm text-muted-foreground">
            <div>
              <Badge variant="secondary" className="text-xs">
                {totalFiles} files
              </Badge>
            </div>
            <div>
              <Badge variant="secondary" className="text-xs">
                {totalLines.toLocaleString()} lines
              </Badge>
            </div>
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* File Tree */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="p-2 max-h-[600px] overflow-y-auto">
            {filteredTree && filteredTree.children && filteredTree.children.length > 0 ? (
              <FileTreeNode
                node={filteredTree}
                expandedFolders={expandedFolders}
                selectedFile={selectedFile}
                onToggleFolder={toggleFolder}
                onFileClick={handleFileClick}
                level={0}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Code className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No files match your search</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Code Viewer */}
      <div className="flex-1 min-w-0">
        {selectedFileData ? (
          <CodeViewer
            file={{
              path: selectedFileData.path,
              content: selectedFileData.content,
              linesOfCode: selectedFileData.linesOfCode,
            }}
            collapsible={false}
            maxHeight="calc(100vh - 300px)"
          />
        ) : (
          <div className="rounded-lg border bg-card h-full flex items-center justify-center p-12">
            <div className="text-center text-muted-foreground">
              <FileCode className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">No file selected</p>
              <p className="text-sm">
                Select a file from the tree to view its contents
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * File Tree Node Component
 */
interface FileTreeNodeProps {
  node: FileNode;
  expandedFolders: Set<string>;
  selectedFile: string | null;
  onToggleFolder: (path: string) => void;
  onFileClick: (path: string) => void;
  level: number;
}

function FileTreeNode({
  node,
  expandedFolders,
  selectedFile,
  onToggleFolder,
  onFileClick,
  level,
}: FileTreeNodeProps) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedFile === node.path;
  const hasChildren = node.children && node.children.length > 0;

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.path)}
          className={`
            w-full flex items-center gap-2 px-2 py-1.5 rounded
            hover:bg-muted/50 transition-colors text-sm
            ${isExpanded ? "text-foreground" : "text-muted-foreground"}
          `}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0 text-blue-500" />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0 text-blue-500" />
          )}
          <span className="truncate font-medium">{node.name}</span>
          {hasChildren && (
            <Badge variant="secondary" className="text-[10px] px-1 ml-auto">
              {node.children!.length}
            </Badge>
          )}
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && hasChildren && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {node.children!.map((child) => (
                <FileTreeNode
                  key={child.path}
                  node={child}
                  expandedFolders={expandedFolders}
                  selectedFile={selectedFile}
                  onToggleFolder={onToggleFolder}
                  onFileClick={onFileClick}
                  level={level + 1}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // File node
  return (
    <button
      onClick={() => onFileClick(node.path)}
      className={`
        w-full flex items-center gap-2 px-2 py-1.5 rounded
        transition-colors text-sm
        ${
          isSelected
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-muted/50 text-muted-foreground"
        }
      `}
      style={{ paddingLeft: `${level * 12 + 32}px` }}
    >
      <FileCode className="w-4 h-4 flex-shrink-0" />
      <span className="truncate">{node.name}</span>
      {node.linesOfCode && (
        <span className="text-xs text-muted-foreground ml-auto">
          {node.linesOfCode} L
        </span>
      )}
    </button>
  );
}

/**
 * Build file tree from flat file list
 */
function buildFileTree(
  files: Array<{ path: string; content: string; linesOfCode?: number }>
): FileNode {
  const root: FileNode = {
    name: "/",
    path: "/",
    type: "directory",
    children: [],
  };

  files.forEach((file) => {
    const parts = file.path.split("/").filter(Boolean);
    let currentNode = root;

    parts.forEach((part, index) => {
      const isLastPart = index === parts.length - 1;
      const currentPath = "/" + parts.slice(0, index + 1).join("/");

      if (!currentNode.children) {
        currentNode.children = [];
      }

      let childNode = currentNode.children.find((c) => c.name === part);

      if (!childNode) {
        childNode = {
          name: part,
          path: currentPath,
          type: isLastPart ? "file" : "directory",
          children: isLastPart ? undefined : [],
          content: isLastPart ? file.content : undefined,
          linesOfCode: isLastPart ? file.linesOfCode : undefined,
        };
        currentNode.children.push(childNode);
      }

      currentNode = childNode;
    });
  });

  // Sort: directories first, then files, both alphabetically
  const sortChildren = (node: FileNode) => {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortChildren);
    }
  };

  sortChildren(root);
  return root;
}

/**
 * Filter file tree by search query
 */
function filterTree(node: FileNode, query: string): FileNode | null {
  if (node.type === "file") {
    return node.name.toLowerCase().includes(query) ? node : null;
  }

  if (!node.children) return node;

  const filteredChildren = node.children
    .map((child) => filterTree(child, query))
    .filter((n): n is FileNode => n !== null);

  if (filteredChildren.length === 0 && !node.name.toLowerCase().includes(query)) {
    return null;
  }

  return {
    ...node,
    children: filteredChildren,
  };
}
