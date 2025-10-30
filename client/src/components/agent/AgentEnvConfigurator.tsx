// src/components/agent/AgentEnvConfigurator.tsx (New File)

"use client";

import { useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  HelpCircle,
  ChevronDown,
  Loader2,
  Lock,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { logger } from "@/lib/logger";
import toast from "react-hot-toast";

// --- Types ---
interface EnvConfigFormProps {
  projectId: string;
  requiredEnvKeys: string[]; // e.g., ["DATABASE_URL", "STRIPE_SECRET_KEY"]
  onActionComplete: () => void; // Callback to revalidate data after successful submission
  onSubmissionError?: (error: string) => void;
}

interface EnvGuidance {
  [key: string]: {
    isLoading: boolean;
    error: string | null;
    content: string | null;
    isOpen: boolean;
  };
}

// --- Animation Variants ---
const fadeIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const collapsibleContent: Variants = {
  collapsed: { height: 0, opacity: 0, marginTop: 0 },
  open: {
    height: "auto",
    opacity: 1,
    marginTop: "0.5rem", // Add some space when open
    transition: { duration: 0.3, ease: "easeInOut" },
  },
};

/**
 * Maps an environment variable key (e.g., "STRIPE_SECRET_KEY") to a
 * generic service identifier (e.g., "stripe") for fetching API key guidance.
 *
 * This version uses a RegExp map for precise, maintainable, and robust matching.
 */

// This Map stores [RegExp, identifier] pairs.
// We use regex to match keys with precision (e.G., /^STRIPE_/ checks
// that the key *starts with* "STRIPE_").
const keyMappings = new Map<RegExp, string>([
  [/^STRIPE_/, "stripe"], // Matches STRIPE_SECRET_KEY, STRIPE_PUBLIC_KEY, etc.
  [/^GOOGLE_CLIENT_ID$/, "google_oauth_client_id"], // Exact match
  [/^GOOGLE_CLIENT_SECRET$/, "google_oauth_client_secret"], // Exact match
  [/^GITHUB_CLIENT_ID$/, "github_oauth_client_id"],
  [/^GITHUB_CLIENT_SECRET$/, "github_oauth_client_secret"],
  [/^RESEND_API_KEY$/, "resend_api_key"],
  [/^OPENAI_API_KEY$/, "openai_api_key"],
  [/^ANTHROPIC_API_KEY$/, "anthropic_api_key"],
  [/^PUSHER_/, "pusher"], // Matches PUSHER_KEY, PUSHER_SECRET, etc.
  [/^DATABASE_URL$/, "database_url_generic"],
  [/^NEXTAUTH_SECRET$/, "nextauth_secret_generation"],
  [/^UPSTASH_REDIS_/, "upstash_redis"], // Matches UPSTASH_REDIS_URL, etc.
  [/^AWS_/, "aws_s3"], // Matches AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, etc.
  // Add more robust patterns here...
]);

/**
 * Gets the service identifier for a given environment variable key.
 * @param key The environment variable key (e.g., "STRIPE_SECRET_KEY").
 * @returns A service identifier string (e.g., "stripe").
 */
function getServiceIdentifierForKey(key: string): string {
  const upperKey = key.toUpperCase();

  // Iterate over our precise regex map
  for (const [regex, identifier] of keyMappings) {
    if (regex.test(upperKey)) {
      return identifier;
    }
  }

  // Fallback: If no precise match, use the original regex fallback.
  // This is good for keys the agent discovers but aren't in our map yet.
  return key.toLowerCase().replace(/_key$/, '').replace(/_secret$/, '').replace(/_id$/, '');
}

// --- Component ---
export default function AgentEnvConfigurator({
  projectId,
  requiredEnvKeys,
  onActionComplete,
  onSubmissionError,
}: EnvConfigFormProps) {
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [guidance, setGuidance] = useState<EnvGuidance>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // --- Handlers ---

  const handleInputChange = (key: string, value: string) => {
    setEnvValues((prev) => ({ ...prev, [key]: value }));
    setSubmissionError(null); // Clear error on input
  };

  const toggleGuidance = async (key: string) => {
    // If opening and content not loaded yet, fetch it
    if (!guidance[key]?.isOpen && !guidance[key]?.content) {
      setGuidance((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          isLoading: true,
          error: null,
          isOpen: true,
        },
      }));

      try {
        const service = getServiceIdentifierForKey(key);

        logger.info(`Fetching guidance for key: ${key}, service: ${service}`); // Log identified service

        const res = await fetch(
          `/api/agent/guidance?service=${encodeURIComponent(service)}`
        );
        if (!res.ok) {
          const errData: unknown = await res
            .json()
            .catch(() => ({ message: `HTTP Error ${res.status}` }));
          const errorMessage = 
            errData && typeof errData === "object" && "message" in errData && typeof errData.message === "string"
              ? errData.message
              : "Failed to fetch guidance.";
          throw new Error(errorMessage);
        }
        const data: unknown = await res.json();
        const guidance = 
          data && typeof data === "object" && "guidance" in data && typeof data.guidance === "string"
            ? data.guidance
            : "No guidance available.";
        setGuidance((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            isLoading: false,
            content: guidance,
          },
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Error fetching guidance.";
        logger.error(
          `Error fetching guidance for ${key}:`,
          error instanceof Error ? error : undefined
        );
        setGuidance((prev) => ({
          ...prev,
          [key]: { ...prev[key], isLoading: false, error: message },
        }));
      }
    } else {
      // Just toggle open/closed state if already loaded or closed
      setGuidance((prev) => ({
        ...prev,
        [key]: { ...prev[key], isOpen: !prev[key]?.isOpen },
      }));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    // Basic validation: ensure all required keys have a value
    const missingKeys = requiredEnvKeys.filter(
      (key) => !envValues[key]?.trim()
    );
    if (missingKeys.length > 0) {
      setSubmissionError(
        `Please provide values for: ${missingKeys.join(", ")}`
      );
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);
    logger.info(`Submitting ENV configuration for project ${projectId}`);

    try {
      const res = await fetch(`/api/projects/${projectId}/env/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environmentVariables: envValues }), // Send the key-value map
      });

      const parsed: unknown = await res.json();

      // Simple response check, adjust based on your actual API response
      if (
        !res.ok ||
        (parsed && typeof parsed === "object" && "error" in parsed)
      ) {
        const errorMessage = 
          parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string"
            ? parsed.error
            : `Failed to save configuration (${res.status})`;
        throw new Error(errorMessage);
      }

      logger.info(
        `ENV configuration saved successfully for project ${projectId}.`
      );
      toast.success("Configuration saved securely!"); // Use react-hot-toast or similar
      onActionComplete(); // Notify parent to revalidate (will update agent status)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error saving configuration.";
      logger.error(
        `Error saving ENV config for ${projectId}:`,
        error instanceof Error ? error : undefined
      );
      setSubmissionError(message);
      if (onSubmissionError) {
        onSubmissionError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render Logic ---
  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="p-6 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-lg shadow-sm space-y-4 mb-6"
    >
      <div className="flex items-center gap-3 mb-3">
        <Lock className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-semibold text-foreground">
          Configure Environment Variables
        </h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        The agent needs these secrets to deploy your application. They will be
        stored securely (encrypted).
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {requiredEnvKeys.map((key) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor={key}
                className="block text-sm font-medium text-foreground"
              >
                {key}
              </label>
              <button
                type="button"
                onClick={() => void toggleGuidance(key)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                aria-label={`Get help for ${key}`}
              >
                <HelpCircle className="w-3.5 h-3.5" /> How do I get this?
              </button>
            </div>
            <input
              id={key}
              type="password" // Use password type to obscure secrets
              value={envValues[key] || ""}
              onChange={(e) => handleInputChange(key, e.target.value)}
              disabled={isSubmitting}
              required // Make inputs required by HTML5
              className="w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm placeholder:text-muted-foreground/50 disabled:opacity-60"
              placeholder={`Enter your ${key}`}
            />

            {/* Collapsible Guidance Section */}
            <AnimatePresence>
              {guidance[key]?.isOpen && (
                <motion.div
                  key={`${key}-guidance`}
                  variants={collapsibleContent}
                  initial="collapsed"
                  animate="open"
                  exit="collapsed"
                  className="overflow-hidden p-3 bg-muted/50 border border-border rounded-md text-xs text-muted-foreground"
                >
                  {guidance[key].isLoading && (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" /> Fetching
                      guidance...
                    </div>
                  )}
                  {guidance[key].error && (
                    <div className="flex items-center gap-2 text-red-500">
                      <AlertCircle className="w-3 h-3" /> {guidance[key].error}
                    </div>
                  )}
                  {guidance[key].content && (
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{
                        __html: guidance[key].content || "",
                      }}
                    />
                    // Using dangerouslySetInnerHTML assuming guidance might contain simple markdown links/formatting. Sanitize server-side if needed.
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        {submissionError && (
          <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {submissionError}
          </p>
        )}

        {/* Submit Button */}
        <motion.button
          type="submit"
          disabled={isSubmitting}
          whileHover={{ scale: isSubmitting ? 1 : 1.03 }}
          whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
          className="w-full mt-4 inline-flex items-center justify-center px-6 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-all"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4 mr-2" />
          )}
          {isSubmitting
            ? "Saving Configuration..."
            : "Save Configuration & Proceed"}
        </motion.button>
      </form>
    </motion.div>
  );
}
