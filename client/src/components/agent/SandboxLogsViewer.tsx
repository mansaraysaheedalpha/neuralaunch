"use client";
import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { logger } from "@/lib/logger";

interface SandboxLogsViewerProps {
  projectId: string;
}

export default function SandboxLogsViewer({
  projectId,
}: SandboxLogsViewerProps) {
  const [logs, setLogs] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const logsEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;

    const eventSource = new EventSource(
      `/api/projects/${projectId}/agent/events`
    );

    eventSource.onopen = () => {
      logger.info("[LogsViewer SSE] Connection opened.");
      setIsConnected(true);
      setLogs((prev) => prev || "[Connected to sandbox logs...]\n");
    };

    eventSource.onmessage = (event) => {
      const eventData = JSON.parse(event.data);

      // We only care about 'log' events here
      if (eventData.type === "log" && typeof eventData.message === "string") {
        setLogs((prev) => prev + eventData.message + "\n");
      }
    };

    eventSource.onerror = (err) => {
      logger.error("[LogsViewer SSE] Connection error:", err);
      setIsConnected(false);
      setLogs((prev) => prev + "[Error: Lost connection to logs.]\n");
      eventSource.close();
    };

    setLogs("[Connecting to sandbox logs...]\n");

    return () => {
      logger.info("[LogsViewer SSE] Closing connection.");
      eventSource.close();
      setIsConnected(false);
    };
  }, [projectId]);

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
      <div
        className={`absolute top-3 right-3 w-3 h-3 rounded-full transition-colors duration-300 ${
          isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
        }`}
        title={isConnected ? "Connected to Logs" : "Disconnected from Logs"}
      />
      <pre className="whitespace-pre-wrap break-words">
        <code>
          {logs ||
            (isConnected ? "Waiting for logs..." : "Attempting to connect...")}
        </code>
      </pre>
      <div ref={logsEndRef} />
    </motion.div>
  );
}
