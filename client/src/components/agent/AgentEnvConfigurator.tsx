// src/components/agent/AgentEnvConfigurator.tsx (New File)

"use client";

import { useState } from "react";
import { motion, Variants } from "framer-motion";
import {
  HelpCircle,
  Loader2,
  Lock,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { logger } from "@/lib/logger";
import toast from "react-hot-toast";
import AgentGuidanceModal from "./AgentGuidanceModal";

// --- Types ---
interface EnvConfigFormProps {
  projectId: string;
  requiredEnvKeys: string[]; // e.g., ["DATABASE_URL", "STRIPE_SECRET_KEY"]
  onActionComplete: () => void; // Callback to revalidate data after successful submission
  onSubmissionError?: (error: string) => void;
}

// --- Animation Variants ---
const fadeIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
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
  return key
    .toLowerCase()
    .replace(/_key$/, "")
    .replace(/_secret$/, "")
    .replace(/_id$/, "");
}

// --- Component ---
export default function AgentEnvConfigurator({
  projectId,
  requiredEnvKeys,
  onActionComplete,
  onSubmissionError,
}: EnvConfigFormProps) {
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // --- NEW: Modal State ---
  const [modalOpen, setModalOpen] = useState(false);
  const [currentGuidanceKey, setCurrentGuidanceKey] = useState("");
  const [currentServiceId, setCurrentServiceId] = useState("");
  // ---

  const handleInputChange = (key: string, value: string) => {
    setEnvValues((prev) => ({ ...prev, [key]: value }));
    setSubmissionError(null);
  };

  // --- NEW: Modal Trigger ---
  const handleOpenGuidance = (key: string) => {
    setCurrentGuidanceKey(key);
    setCurrentServiceId(getServiceIdentifierForKey(key));
    setModalOpen(true);
  };
  // ---

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
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

    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/env/configure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environmentVariables: envValues }),
        });

        const parsed: unknown = await res.json();
        if (
          !res.ok ||
          (parsed && typeof parsed === "object" && "error" in parsed)
        ) {
          throw new Error(
            (parsed as { error: string })?.error ||
              `Failed to save configuration (${res.status})`
          );
        }

        logger.info(
          `ENV configuration saved successfully for project ${projectId}.`
        );
        toast.success("Configuration saved securely!");
        onActionComplete();
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
    })();
  };

  // --- Render Logic ---
  return (
    <>
      {/* --- NEW: Render the Modal --- */}
      <AgentGuidanceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        serviceKey={currentGuidanceKey}
        serviceIdentifier={currentServiceId}
      />
      {/* --- End Modal --- */}

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

        <form onSubmit={handleSubmit} className="space-y-4">
          {requiredEnvKeys.map((key) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor={key}
                  className="block text-sm font-medium text-foreground"
                >
                  {key}
                </label>
                {/* --- UPDATED: Button now opens modal --- */}
                <button
                  type="button"
                  onClick={() => handleOpenGuidance(key)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  aria-label={`Get help for ${key}`}
                >
                  <HelpCircle className="w-3.5 h-3.5" /> How do I get this?
                </button>
              </div>
              <input
                id={key}
                type="password"
                value={envValues[key] || ""}
                onChange={(e) => handleInputChange(key, e.target.value)}
                disabled={isSubmitting}
                required
                className="w-full px-3 py-2 bg-background border border-border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm placeholder:text-muted-foreground/50 disabled:opacity-60"
                placeholder={`Enter your ${key}`}
              />

              {/* --- Collapsible section REMOVED --- */}
            </div>
          ))}

          {submissionError && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {submissionError}
            </p>
          )}

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
    </>
  );
}
