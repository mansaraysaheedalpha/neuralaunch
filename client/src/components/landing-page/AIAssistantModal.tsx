// src/components/landing-page/AIAssistantModal.tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Task } from "@prisma/client";
import ReactMarkdown from "react-markdown";

interface AIAssistantModalProps {
  task: Task | null;
  onClose: () => void;
}

export default function AIAssistantModal({
  task,
  onClose,
}: AIAssistantModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      handleRunAssistant();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  const handleRunAssistant = async () => {
    if (!task) return;
    setIsLoading(true);
    setOutput("");
    setError(null);

    try {
      const response = await fetch("/api/sprint/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to get a response from the AI assistant.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        setOutput((prev) => prev + chunk);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-card border border-border rounded-2xl w-full max-w-3xl h-[80vh] flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <h2 className="font-bold text-lg text-foreground">
                🤖 {task.aiAssistantType?.replace(/_/g, " ")} Assistant
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-muted"
              >
                &times;
              </button>
            </header>

            <div className="flex-1 p-6 overflow-y-auto">
              {isLoading && !output && (
                <p className="text-muted-foreground animate-pulse">
                  AI is generating your content...
                </p>
              )}
              {error && <p className="text-red-500">{error}</p>}
              <div className="prose dark:prose-invert max-w-none">
                <ReactMarkdown>{output}</ReactMarkdown>
              </div>
            </div>

            <footer className="p-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
              <button
                className="px-4 py-2 text-sm font-semibold border rounded-lg hover:bg-muted"
                onClick={() => navigator.clipboard.writeText(output)}
              >
                Copy Output
              </button>
              <button
                className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg"
                onClick={onClose}
              >
                Done
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
