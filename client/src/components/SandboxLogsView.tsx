// src/components/SandboxLogsViewer.tsx (Example Frontend Component)

"use client"; // Needs to be a client component

import { useEffect, useState, useRef } from "react";
import Pusher from "pusher-js";

interface SandboxLogsViewerProps {
  projectId: string; // The ID of the LandingPage/Project
}

export default function SandboxLogsViewer({
  projectId,
}: SandboxLogsViewerProps) {
  const [logs, setLogs] = useState<string>(""); // Store logs as a single string
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const logsEndRef = useRef<null | HTMLDivElement>(null);
  const channelName = `sandbox-logs-${projectId}`;

  useEffect(() => {
    // Ensure environment variables are set
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!pusherKey || !pusherCluster) {
      console.error("Pusher environment variables not set.");
      setLogs("Error: Pusher configuration missing.\n");
      return;
    }

    let pusherClient: Pusher | null = null;

    try {
      pusherClient = new Pusher(pusherKey, {
        cluster: pusherCluster,
      });

      const channel = pusherClient.subscribe(channelName);

      channel.bind("pusher:subscription_succeeded", () => {
        console.log(
          `Successfully subscribed to Pusher channel: ${channelName}`
        );
        setIsConnected(true);
        setLogs((prev) => prev + "[Connected to sandbox logs...]\n");
      });

      channel.bind("pusher:subscription_error", (status: any) => {
        console.error(`Pusher subscription error for ${channelName}:`, status);
        setIsConnected(false);
        setLogs(
          (prev) => prev + `[Error subscribing to logs: ${status.status}]\n`
        );
      });

      channel.bind("log-message", (data: { message: string }) => {
        // Append new message, keeping existing logs
        setLogs((prev) => prev + data.message);
      });

      console.log(`Attempting to subscribe to Pusher channel: ${channelName}`);
    } catch (error) {
      console.error("Failed to initialize Pusher:", error);
      setLogs((prev) => prev + "[Error initializing log connection.]\n");
    }

    // Cleanup function
    return () => {
      if (pusherClient) {
        console.log(`Unsubscribing from Pusher channel: ${channelName}`);
        pusherClient.unsubscribe(channelName);
        pusherClient.disconnect();
      }
    };
  }, [projectId, channelName]); // Rerun effect if projectId changes

  useEffect(() => {
    // Auto-scroll to bottom whenever logs update
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="bg-gray-900 text-gray-200 font-mono p-4 rounded-lg h-96 overflow-y-auto text-sm border border-gray-700 relative">
      <div
        className={`absolute top-2 right-2 w-3 h-3 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
        title={isConnected ? "Connected" : "Disconnected"}
      ></div>
      <pre className="whitespace-pre-wrap break-words">
        <code>
          {logs || (isConnected ? "Waiting for logs..." : "Connecting...")}
        </code>
      </pre>
      <div ref={logsEndRef} />
    </div>
  );
}
