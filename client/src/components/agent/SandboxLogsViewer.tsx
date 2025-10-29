// src/components/agent/SandboxLogsViewer.tsx (New File or update existing placeholder)

"use client"; // Required for hooks like useEffect, useState, useRef

import { useEffect, useState, useRef } from "react";
import Pusher from "pusher-js";
import { motion } from "framer-motion";
import { logger } from "@/lib/logger"; // Assuming client-side logger or use console

interface SandboxLogsViewerProps {
  projectId: string; // The ID of the LandingPage/Project
}

export default function SandboxLogsViewer({
  projectId,
}: SandboxLogsViewerProps) {
  const [logs, setLogs] = useState<string>(""); // Store logs as a single string
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const logsEndRef = useRef<null | HTMLDivElement>(null);
  const channelName = `sandbox-logs-${projectId}`; // Pusher channel name specific to this project

  useEffect(() => {
    // Ensure Pusher environment variables are available on the client
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!pusherKey || !pusherCluster) {
      logger.error(
        "[SandboxLogsViewer] Pusher environment variables (NEXT_PUBLIC_PUSHER_KEY, NEXT_PUBLIC_PUSHER_CLUSTER) are not set."
      );
      setLogs("[Error: Pusher configuration missing. Cannot display logs.]\n");
      setIsConnected(false);
      return;
    }

    let pusherClient: Pusher | null = null;

    try {
      pusherClient = new Pusher(pusherKey, {
        cluster: pusherCluster,
      });

      const channel = pusherClient.subscribe(channelName);

      // --- Event Bindings ---

      // Successful subscription
      channel.bind("pusher:subscription_succeeded", () => {
        logger.info(
          `[SandboxLogsViewer] Successfully subscribed to Pusher channel: ${channelName}`
        );
        setIsConnected(true);
        // Add connection message only if logs are currently empty, otherwise it's a reconnect
        setLogs((prev) => prev || "[Connected to sandbox logs...]\n");
      });

      // Failed subscription
      channel.bind(
        "pusher:subscription_error",
        (status: { error?: { message?: string }; status?: string | number }) => {
          logger.error(
            `[SandboxLogsViewer] Pusher subscription error for ${channelName}:`,
            undefined,
            { status }
          );
          setIsConnected(false);
          setLogs(
            (prev) =>
              prev +
              `\n[Error subscribing to logs: ${status.error?.message ?? status.status}]\n`
          );
        }
      );

      // Receiving log messages
      channel.bind("log-message", (data: { message: string }) => {
        // Append new message, ensuring it exists and is a string
        if (data && typeof data.message === "string") {
          setLogs((prev) => prev + data.message);
        }
      });

      logger.info(
        `[SandboxLogsViewer] Attempting to subscribe to Pusher channel: ${channelName}`
      );
      setLogs("[Connecting to sandbox logs...]\n"); // Initial connecting message
    } catch (error) {
      logger.error(
        "[SandboxLogsViewer] Failed to initialize Pusher:",
        error instanceof Error ? error : undefined
      );
      setLogs((prev) => prev + "[Error initializing log connection.]\n");
      setIsConnected(false);
    }

    // --- Cleanup Function ---
    return () => {
      if (pusherClient) {
        logger.info(
          `[SandboxLogsViewer] Unsubscribing from Pusher channel: ${channelName}`
        );
        pusherClient.unsubscribe(channelName);
        pusherClient.disconnect();
        setIsConnected(false);
      }
    };
  }, [projectId, channelName]); // Rerun effect if projectId changes

  // Auto-scroll effect
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]); // Scroll whenever logs update

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
            (isConnected ? "Waiting for logs..." : "Attempting to connect...")}
        </code>
      </pre>
      {/* Invisible element to target for scrolling */}
      <div ref={logsEndRef} />
    </motion.div>
  );
}
