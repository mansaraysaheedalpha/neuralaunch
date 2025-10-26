// src/components/landing-page/MvpGenerationModal.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Database, Code, Zap, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

interface MvpGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (options: MvpGenerationOptions) => Promise<void>;
  landingPageId: string;
  blueprintPreview?: string;
}

export interface MvpGenerationOptions {
  primaryModel: string;
  includeAuth: boolean;
  includePayments: boolean;
  databaseProvider: "postgresql" | "mysql" | "sqlite";
  additionalFeatures: string[];
}

const COMMON_MODELS = [
  { value: "User", label: "User", icon: "👤" },
  { value: "Project", label: "Project", icon: "📁" },
  { value: "Task", label: "Task", icon: "✅" },
  { value: "Post", label: "Post", icon: "📝" },
  { value: "Product", label: "Product", icon: "🛍️" },
];

const ADDITIONAL_FEATURES = [
  { value: "email-notifications", label: "Email Notifications" },
  { value: "file-upload", label: "File Upload" },
  { value: "real-time", label: "Real-time Updates" },
  { value: "search", label: "Full-text Search" },
  { value: "analytics", label: "Analytics Dashboard" },
];

export default function MvpGenerationModal({
  isOpen,
  onClose,
  onGenerate,
  blueprintPreview,
}: MvpGenerationModalProps) {
  const [step, setStep] = useState(1);
  const [options, setOptions] = useState<MvpGenerationOptions>({
    primaryModel: "Project",
    includeAuth: true,
    includePayments: true,
    databaseProvider: "postgresql",
    additionalFeatures: [],
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await onGenerate(options);
      onClose();
    } catch (error) {
      console.error("Generation failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate MVP"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleFeature = (feature: string) => {
    setOptions((prev) => ({
      ...prev,
      additionalFeatures: prev.additionalFeatures.includes(feature)
        ? prev.additionalFeatures.filter((f) => f !== feature)
        : [...prev.additionalFeatures, feature],
    }));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                🚀 Build Your MVP
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Step {step} of 3: Let&apos;s customize your codebase
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-6">
            {/* Progress Bar */}
            <div className="flex gap-2">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-2 flex-1 rounded-full transition-colors ${
                    s <= step ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* Step 1: Primary Model */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Database className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">
                    What&apos;s your most critical data model?
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  This will be the core entity in your application that users
                  interact with most.
                </p>

                {blueprintPreview && (
                  <div className="p-4 bg-muted/50 rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-2">
                      Based on your blueprint:
                    </p>
                    <p className="text-sm line-clamp-3">{blueprintPreview}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {COMMON_MODELS.map((model) => (
                    <button
                      key={model.value}
                      onClick={() =>
                        setOptions((prev) => ({
                          ...prev,
                          primaryModel: model.value,
                        }))
                      }
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        options.primaryModel === model.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="text-2xl mb-2">{model.icon}</div>
                      <div className="font-semibold">{model.label}</div>
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">
                    Or specify a custom model:
                  </label>
                  <input
                    type="text"
                    value={options.primaryModel}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        primaryModel: e.target.value,
                      }))
                    }
                    placeholder="e.g., Recipe, Property, Course..."
                    className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </motion.div>
            )}

            {/* Step 2: Core Features */}
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Code className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">
                    Core Features to Include
                  </h3>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={options.includeAuth}
                      onChange={(e) =>
                        setOptions((prev) => ({
                          ...prev,
                          includeAuth: e.target.checked,
                        }))
                      }
                      className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex-1">
                      <div className="font-semibold">
                        🔐 Authentication (NextAuth.js)
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Google OAuth + session management
                      </div>
                    </div>
                    {options.includeAuth && (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    )}
                  </label>

                  <label className="flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={options.includePayments}
                      onChange={(e) =>
                        setOptions((prev) => ({
                          ...prev,
                          includePayments: e.target.checked,
                        }))
                      }
                      className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex-1">
                      <div className="font-semibold">
                        💳 Payment Integration (Stripe)
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Subscription billing based on your pricing tiers
                      </div>
                    </div>
                    {options.includePayments && (
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                    )}
                  </label>
                </div>

                <div className="mt-6">
                  <h4 className="font-semibold mb-3">Database Provider</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {(
                      ["postgresql", "mysql", "sqlite"] as const
                    ).map((db) => (
                      <button
                        key={db}
                        onClick={() =>
                          setOptions((prev) => ({
                            ...prev,
                            databaseProvider: db,
                          }))
                        }
                        className={`p-3 rounded-lg border-2 transition-all capitalize ${
                          options.databaseProvider === db
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        {db}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Additional Features */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Zap className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">
                    Additional Features (Optional)
                  </h3>
                </div>

                <p className="text-sm text-muted-foreground">
                  Select any additional features you&apos;d like scaffolded in your
                  MVP:
                </p>

                <div className="space-y-2">
                  {ADDITIONAL_FEATURES.map((feature) => (
                    <label
                      key={feature.value}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={options.additionalFeatures.includes(
                          feature.value
                        )}
                        onChange={() => toggleFeature(feature.value)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                      />
                      <span className="flex-1">{feature.label}</span>
                      {options.additionalFeatures.includes(feature.value) && (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      )}
                    </label>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <h4 className="font-semibold text-blue-400 mb-2">
                    📦 What You&apos;ll Get
                  </h4>
                  <ul className="text-sm space-y-1 text-blue-300">
                    <li>✓ Complete Next.js 14+ app with App Router</li>
                    <li>✓ TypeScript configured with strict mode</li>
                    <li>✓ Prisma schema with {options.primaryModel} model</li>
                    {options.includeAuth && <li>✓ NextAuth.js authentication</li>}
                    {options.includePayments && <li>✓ Stripe integration</li>}
                    <li>✓ Tailwind CSS with components</li>
                    <li>✓ README with setup instructions</li>
                  </ul>
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex items-center justify-between">
            <button
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1 || isGenerating}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Back
            </button>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={isGenerating}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>

              {step < 3 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={isGenerating}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={() => void handleGenerate()}
                  disabled={isGenerating}
                  className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all shadow-md"
                >
                  {isGenerating ? "Generating..." : "🚀 Generate MVP"}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
