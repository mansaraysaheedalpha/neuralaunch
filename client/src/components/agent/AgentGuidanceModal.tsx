// src/components/agent/AgentGuidanceModal.tsx

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, AlertCircle } from "lucide-react";
import useSWR from "swr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // Plugin for tables, links, etc.
import { logger } from "@/lib/logger";

interface GuidanceResponse {
  guidance: string;
}
interface ApiErrorResponse {
  error: string;
}

// SWR fetcher for the guidance
const fetcher = async (url: string): Promise<GuidanceResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = (await res.json()) as ApiErrorResponse;
    logger.error(
      `[AgentGuidanceModal] Failed to fetch guidance: ${errorData.error}`
    );
    throw new Error(errorData.error || "Failed to load guidance.");
  }
  return res.json() as Promise<GuidanceResponse>;
};

interface AgentGuidanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceKey: string; // The ENV key name (e.g., "STRIPE_SECRET_KEY")
  serviceIdentifier: string; // The service ID (e.g., "stripe")
}

export default function AgentGuidanceModal({
  isOpen,
  onClose,
  serviceKey,
  serviceIdentifier,
}: AgentGuidanceModalProps) {
  const apiUrl = `/api/agent/guidance?service=${encodeURIComponent(serviceIdentifier)}`;

  // Fetch data only when the modal is open
  const { data, error, isLoading } = useSWR<GuidanceResponse, Error>(
    isOpen ? apiUrl : null, // Only fetch if isOpen
    fetcher
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()} // Prevent modal close on content click
          >
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                How to get:{" "}
                <code className="text-primary bg-primary/10 px-2 py-1 rounded">
                  {serviceKey}
                </code>
              </h2>
              <button
                onClick={onClose}
                className="p-2 -m-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-grow p-6 overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Fetching guidance...</span>
                </div>
              )}
              {error && (
                <div className="flex items-center gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5" />
                  <span>Error: {error.message}</span>
                </div>
              )}
              {data && (
                <article className="prose prose-sm dark:prose-invert max-w-none">
                  {/* Render the markdown content */}
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ node: _node, ...props }) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" />
                      ),
                    }}
                  >
                    {data.guidance}
                  </ReactMarkdown>
                </article>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
