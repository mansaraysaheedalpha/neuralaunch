// src/components/agent/SandboxLogsViewer.tsx

"use client";

import { useEffect, useState, useRef } from "react";
import Pusher from "pusher-js";
import { motion } from "framer-motion";
import { logger } from "@/lib/logger";
import { publicEnv } from "@/lib/env.public";

interface SandboxLogsViewerProps {
  projectId: string;
}

export default function SandboxLogsViewer({
  projectId,
}: SandboxLogsViewerProps) {
  const [logs, setLogs] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const logsEndRef = useRef<null | HTMLDivElement>(null);
  const channelName = `sandbox-logs-${projectId}`;

  useEffect(() => {
    const pusherKey = publicEnv.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = publicEnv.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!pusherKey || !pusherCluster) {
      logger.error("[SandboxLogsViewer] Pusher configuration missing");
      setLogs("[Error: Pusher configuration missing. Cannot display logs.]\n");
      setIsConnected(false);
      return;
    }

    logger.info(`[SandboxLogsViewer] Initializing Pusher for ${channelName}`);

    // Initialize Pusher with proper configuration
    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
      enabledTransports: ["ws", "wss"],
    });

    // Connection state monitoring
    pusher.connection.bind("connected", () => {
      logger.info("[SandboxLogsViewer] Pusher connected");
    });

    pusher.connection.bind("error", (err: unknown) => {
      logger.error(
        "[SandboxLogsViewer] Pusher connection error:",
        err instanceof Error ? err : undefined
      );
    });

    const channel = pusher.subscribe(channelName);

    channel.bind("pusher:subscription_succeeded", () => {
      logger.info(`[SandboxLogsViewer] Subscribed to ${channelName}`);
      setIsConnected(true);
      setLogs("[Connected to sandbox logs...]\n");
    });

    channel.bind(
      "pusher:subscription_error",
      (status: { error?: { message?: string }; status?: string | number }) => {
        logger.error(`[SandboxLogsViewer] Subscription error:`, undefined, {
          status,
        });
        setIsConnected(false);
        setLogs(
          (prev) =>
            prev +
            `\n[Error subscribing to logs: ${status.error?.message ?? status.status}]\n`
        );
      }
    );

    channel.bind("log-message", (data: { message: string }) => {
      if (data?.message) {
        setLogs((prev) => prev + data.message);
      }
    });

    // Cleanup
    return () => {
      logger.info(`[SandboxLogsViewer] Cleaning up Pusher connection`);
      channel.unbind_all();
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [channelName]); // Only depend on channelName

  // Auto-scroll effect
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      className="bg-gray-900 text-gray-200 font-mono p-4 rounded-lg h-96 overflow-y-auto text-sm border border-gray-700 relative shadow-inner"
    >
      {/* Connection Status Indicator */}
      <div
        className={`absolute top-3 right-3 w-3 h-3 rounded-full transition-colors duration-300 ${
          isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
        }`}
        title={isConnected ? "Connected to Logs" : "Disconnected from Logs"}
      />

      {/* Log Content */}
      <pre className="whitespace-pre-wrap break-words">
        <code>
          {logs ||
            (isConnected ? "Waiting for logs..." : "Connecting to sandbox...")}
        </code>
      </pre>

      {/* Invisible element to target for scrolling */}
      <div ref={logsEndRef} />
    </motion.div>
  );
}
