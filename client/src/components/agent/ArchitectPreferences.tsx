"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Settings,
  ChevronDown,
  Info,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";

interface ArchitectPreferencesProps {
  projectId: string;
  onComplete: () => void; // This prop now means "Agent has started, begin polling"
}

type TechStackPreferences = {
  mode: "default" | "custom";
  framework?: string;
  uiLibrary?: string;
  authentication?: string;
  database?: string;
  deployment?: string;
  additionalContext?: string;
};

// --- (All your constant options like FRAMEWORK_OPTIONS, UI_LIBRARY_OPTIONS, etc. are perfect) ---
const FRAMEWORK_OPTIONS = [
  {
    value: "nextjs",
    label: "Next.js 14+ (Recommended)",
    description: "React framework with App Router",
  },
  { value: "remix", label: "Remix", description: "Full-stack React framework" },
  { value: "nuxt", label: "Nuxt 3", description: "Vue.js framework" },
  { value: "sveltekit", label: "SvelteKit", description: "Svelte framework" },
];

const UI_LIBRARY_OPTIONS = [
  {
    value: "shadcn",
    label: "Shadcn UI (Recommended)",
    description: "Modern, accessible components",
  },
  {
    value: "mui",
    label: "Material UI",
    description: "Google's Material Design",
  },
  { value: "antd", label: "Ant Design", description: "Enterprise UI library" },
  {
    value: "chakra",
    label: "Chakra UI",
    description: "Simple, modular components",
  },
];

const AUTH_OPTIONS = [
  {
    value: "nextauth",
    label: "NextAuth v5 (Recommended)",
    description: "Open-source, flexible",
  },
  {
    value: "clerk",
    label: "Clerk",
    description: "Managed auth with UI components",
  },
  {
    value: "supabase",
    label: "Supabase Auth",
    description: "Open-source auth + database",
  },
  { value: "custom", label: "Custom JWT", description: "Build from scratch" },
];

const DATABASE_OPTIONS = [
  {
    value: "postgresql",
    label: "PostgreSQL (Recommended)",
    description: "Powerful, open-source",
  },
  { value: "mysql", label: "MySQL", description: "Popular relational DB" },
  {
    value: "mongodb",
    label: "MongoDB",
    description: "NoSQL document database",
  },
  {
    value: "supabase",
    label: "Supabase",
    description: "PostgreSQL with real-time",
  },
];

const DEPLOYMENT_OPTIONS = [
  {
    value: "vercel",
    label: "Vercel (Recommended)",
    description: "Zero-config Next.js hosting",
  },
  {
    value: "render",
    label: "Render",
    description: "Cost-effective alternative",
  },
  { value: "fly", label: "Fly.io", description: "Global edge deployment" },
  { value: "railway", label: "Railway", description: "Simple infrastructure" },
  {
    value: "selfhosted",
    label: "Self-Hosted",
    description: "Docker + your server",
  },
];
// --- (End of options) ---

export default function ArchitectPreferences({
  projectId,
  onComplete,
}: ArchitectPreferencesProps) {
  const [mode, setMode] = useState<"default" | "custom">("default");
  const [preferences, setPreferences] = useState<TechStackPreferences>({
    mode: "default",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleModeSelect = (selectedMode: "default" | "custom") => {
    setMode(selectedMode);
    setPreferences({ ...preferences, mode: selectedMode });
  };

  /**
   * ✅ REFACTORED: This now calls the single, robust "generate-plan" endpoint.
   * It no longer needs to know about `analyzedStack`. It just sends preferences.
   */
  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      // Call the new single API endpoint
      const res = await fetch(
        `/api/projects/${projectId}/agent/generate-plan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences }),
        }
      );

      // The new API returns 202 (Accepted) on success
      if (res.status !== 202) {
        const errorData = await res.json() as { error?: string };
        throw new Error(
          errorData.error || `Failed to start agent (${res.status})`
        );
      }

      // Show success and update the button text
      toast.success(
        "Agent started! The architect is analyzing your blueprint..."
      );

      // Tell the parent component to start polling the /state endpoint
      onComplete();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start the agent"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- (All of your JSX and UI logic below is perfect and requires no changes) ---

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto p-6"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-4"
        >
          <Sparkles className="w-8 h-8 text-white" />
        </motion.div>
        <h2 className="text-3xl font-bold text-foreground mb-2">
          Configure Your Architect
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Our Senior Software Architect is ready to design your system. Choose
          how you want to work together.
        </p>
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg inline-block">
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <Info className="w-4 h-4" />
            <strong>Important:</strong> This choice starts the planning process.
          </p>
        </div>
      </div>

      {/* Mode Selection Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Default Mode */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleModeSelect("default")}
          className={`p-6 rounded-xl border-2 transition-all text-left ${
            mode === "default"
              ? "border-primary bg-primary/5 shadow-lg"
              : "border-border hover:border-primary/50"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Let AI Architect Decide
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Perfect for non-technical founders. The AI will choose modern,
                production-ready technologies based on industry best practices.
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>✓ Next.js 14 + Shadcn UI</div>
                <div>✓ NextAuth v5 + PostgreSQL</div>
                <div>✓ Vercel deployment</div>
              </div>
            </div>
          </div>
        </motion.button>

        {/* Custom Mode */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleModeSelect("custom")}
          className={`p-6 rounded-xl border-2 transition-all text-left ${
            mode === "custom"
              ? "border-primary bg-primary/5 shadow-lg"
              : "border-border hover:border-primary/50"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Custom Tech Stack
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                For technical founders. Specify your preferred frameworks,
                libraries, and deployment targets. The architect will follow
                your choices.
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>✓ Choose your framework</div>
                <div>✓ Pick UI libraries</div>
                <div>✓ Control deployment</div>
              </div>
            </div>
          </div>
        </motion.button>
      </div>

      {/* Custom Configuration Form */}
      <AnimatePresence>
        {mode === "custom" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-card border border-border rounded-xl p-6 mb-6 space-y-6"
          >
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Tech Stack Preferences
            </h3>

            {/* Framework */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Framework *
              </label>
              <select
                value={preferences.framework || ""}
                onChange={(e) =>
                  setPreferences({ ...preferences, framework: e.target.value })
                }
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select a framework...</option>
                {FRAMEWORK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} - {opt.description}
                  </option>
                ))}
              </select>
            </div>

            {/* UI Library */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                UI Component Library *
              </label>
              <select
                value={preferences.uiLibrary || ""}
                onChange={(e) =>
                  setPreferences({ ...preferences, uiLibrary: e.target.value })
                }
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select UI library...</option>
                {UI_LIBRARY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} - {opt.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Advanced Options Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
              />
              {showAdvanced ? "Hide" : "Show"} Advanced Options
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-6 pt-4 border-t border-border"
                >
                  {/* Authentication */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Authentication
                    </label>
                    <select
                      value={preferences.authentication || ""}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          authentication: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="">Select auth provider...</option>
                      {AUTH_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} - {opt.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Database */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Database
                    </label>
                    <select
                      value={preferences.database || ""}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          database: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="">Select database...</option>
                      {DATABASE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} - {opt.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Deployment */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Deployment Platform
                    </label>
                    <select
                      value={preferences.deployment || ""}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          deployment: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="">Select deployment...</option>
                      {DEPLOYMENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} - {opt.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Additional Context */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Additional Context (Optional)
                    </label>
                    <textarea
                      value={preferences.additionalContext || ""}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          additionalContext: e.target.value,
                        })
                      }
                      rows={4}
                      placeholder="Any specific requirements, patterns, or constraints the architect should know about..."
                      className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Example: &quot;Use TypeScript strict mode&quot;,
                      &quot;Prefer server actions over API routes&quot;,
                      &quot;Must support offline mode&quot;
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit Button */}
      <motion.button
        onClick={() => void handleSubmit()}
        disabled={
          isSubmitting ||
          (mode === "custom" &&
            (!preferences.framework || !preferences.uiLibrary))
        }
        whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
        whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
        className="w-full py-4 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Starting Agent...
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5" />
            {mode === "default"
              ? "Proceed with AI Recommendations"
              : "Save Preferences & Start Agent"}
          </>
        )}
      </motion.button>

      {mode === "custom" &&
        (!preferences.framework || !preferences.uiLibrary) && (
          <p className="text-center text-sm text-amber-600 dark:text-amber-400 mt-2">
            Please select at least Framework and UI Library
          </p>
        )}
    </motion.div>
  );
}
