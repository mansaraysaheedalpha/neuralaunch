// src/components/execution/ExecutionTabs.tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  FileCode,
  Terminal,
  GitMerge,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import ActivityFeed from "./ActivityFeed";
import { CodeExplorer } from "./CodeExplorer";
import { CommandTerminalList } from "./CommandTerminal";
import { WaveApprovalCard, WaveApprovalCardSkeleton } from "./WaveApprovalCard";
import { CriticalFailuresPanel } from "./CriticalFailuresPanel";

interface ExecutionTabsProps {
  projectId: string;
  conversationId: string;
  tasks: any[];
  currentWave: number;
  className?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
};

export function ExecutionTabs({
  projectId,
  conversationId,
  tasks,
  currentWave,
  className = "",
}: ExecutionTabsProps) {
  const [activeTab, setActiveTab] = useState("activity");

  // Fetch file data
  const { data: filesData, isLoading: filesLoading } = useSWR(
    `/api/projects/${projectId}/files`,
    fetcher
  );

  // Fetch wave approval status for current wave
  const { data: approvalData, isLoading: approvalLoading, mutate: refetchApproval } = useSWR(
    currentWave > 0
      ? `/api/projects/${projectId}/waves/${currentWave}/approve`
      : null,
    fetcher,
    {
      refreshInterval: 3000, // Poll every 3s
    }
  );

  // Extract commands from task outputs
  const agentCommands = tasks
    .filter((t) => t.output?.commands && t.output.commands.length > 0)
    .map((t) => ({
      agentName: t.agentName,
      commands: t.output.commands.map((cmd: any) => ({
        command: cmd.command || cmd,
        description: cmd.description,
        output: cmd.output,
        exitCode: cmd.exitCode,
        duration: cmd.duration,
        status: cmd.status || (cmd.exitCode === 0 ? "success" : "failed"),
      })),
    }));

  const files = filesData?.files || [];
  const totalCommands = agentCommands.reduce(
    (sum, ac) => sum + ac.commands.length,
    0
  );

  // Check if current wave is ready for approval
  const showApproval = approvalData?.readyForApproval;

  // Fetch critical failures count
  const { data: failuresData } = useSWR(
    `/api/projects/${projectId}/critical-failures?status=open`,
    fetcher,
    {
      refreshInterval: 5000, // Poll every 5s
    }
  );

  const openFailuresCount = failuresData?.failures?.length || 0;

  return (
    <div className={className}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="activity" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Activity
            {tasks.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {tasks.length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="code" className="flex items-center gap-2">
            <FileCode className="w-4 h-4" />
            Code Files
            {files.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {files.length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="commands" className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Commands
            {totalCommands > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {totalCommands}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="approval" className="flex items-center gap-2">
            <GitMerge className="w-4 h-4" />
            Wave Approval
            {showApproval && (
              <Badge variant="default" className="text-xs ml-1 bg-green-600">
                Ready
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="failures" className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Issues
            {openFailuresCount > 0 && (
              <Badge variant="destructive" className="text-xs ml-1">
                {openFailuresCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Activity Feed</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed projectId={projectId} tasks={tasks} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Code Files Tab */}
        <TabsContent value="code" className="mt-6">
          <Card className="border-none shadow-none">
            <CardContent className="p-0">
              {filesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-muted-foreground">
                    Loading files...
                  </span>
                </div>
              ) : files.length > 0 ? (
                <CodeExplorer
                  projectId={projectId}
                  waveNumber={currentWave}
                  files={files}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium mb-2">No files generated yet</p>
                  <p className="text-sm">
                    Files will appear here as agents complete tasks
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commands Tab */}
        <TabsContent value="commands" className="mt-6">
          {agentCommands.length > 0 ? (
            <CommandTerminalList
              agentCommands={agentCommands}
              defaultCollapsed={true}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Terminal className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-lg font-medium mb-2">
                  No commands executed yet
                </p>
                <p className="text-sm">
                  Commands will appear here as agents execute tasks
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Wave Approval Tab */}
        <TabsContent value="approval" className="mt-6">
          {approvalLoading ? (
            <WaveApprovalCardSkeleton />
          ) : approvalData && currentWave > 0 ? (
            <WaveApprovalCard
              projectId={projectId}
              waveNumber={currentWave}
              conversationId={conversationId}
              status={approvalData}
              onApprovalComplete={() => {
                refetchApproval();
                setActiveTab("activity");
              }}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <GitMerge className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-lg font-medium mb-2">No wave to approve</p>
                <p className="text-sm">
                  Wave approval will appear here when a wave completes
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Critical Failures Tab */}
        <TabsContent value="failures" className="mt-6">
          <CriticalFailuresPanel projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
