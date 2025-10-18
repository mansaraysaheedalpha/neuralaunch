// src/components/landing-page/LandingPageBuilder.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { DESIGN_VARIANTS } from "lib/landing-page-generator"; // Correct import path & import type
import DesignVariantSelector from "./DesignVariantSelector";
import LandingPagePublic from "./LandingPagePublic";
import SprintDashboard from "./SprintDashboard";
import toast from "react-hot-toast";
import { Prisma } from "@prisma/client"; // Import Prisma helper type

// --- FIX: Define more specific types ---
// Type for individual features (adjust if your generator returns different fields)
interface LandingPageFeature {
  title: string;
  description: string;
  icon?: string; // Icon might be optional
}

// Type for email signups (based on typical fields)
interface EmailSignupData {
  id: string;
  email: string;
  name?: string | null; // Name is optional
  createdAt: string; // Typically a string date
}

// Update LandingPageData with specific types
interface LandingPageData {
  id: string;
  slug: string;
  isPublished: boolean;
  conversationId: string;
  title: string;
  headline: string;
  subheadline: string;
  problemStatement: string | null;
  solutionStatement: string | null;
  features: LandingPageFeature[]; // Use specific feature type
  ctaText: string;
  designVariant: string;
  colorScheme: Prisma.JsonObject; // Use Prisma's JsonObject type
  emailSignups: EmailSignupData[]; // Use specific signup type
}

// Define the expected shape of the data from the /generate API
interface GenerateApiResponse {
  success: boolean;
  landingPage: LandingPageData;
  message?: string; // Optional error message
}
// ------------------------------------

interface ErrorApiResponse {
  message?: string;
  detail?: string;
  error?: string;
}

interface LandingPageBuilderProps {
  landingPage: LandingPageData;
  analytics: {
    totalViews: number;
    uniqueVisitors: number;
    signupCount: number;
  };
}

export default function LandingPageBuilder({
  landingPage: initialData,
}: LandingPageBuilderProps) {
  const router = useRouter();
  const [landingPage, setLandingPage] = useState<LandingPageData>(initialData); // Ensure state has the correct type
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "preview" | "analytics" | "sprint"
  >("preview");

  const handlePublish = async (publishState: boolean) => {
    setIsPublishing(true);
    try {
      const response = await fetch("/api/landing-page/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingPageId: landingPage.id,
          isPublished: publishState,
        }),
      });
      if (response.ok) {
        setLandingPage((prev) => ({ ...prev, isPublished: publishState }));
        // Optionally show success toast
        toast.success(
          `Page ${publishState ? "published" : "unpublished"} successfully!`
        );
        // Refresh server components if needed (e.g., if status affects SSR)
        router.refresh();
      } else {
        const errorData: unknown = await response.json();
        const typedError = errorData as ErrorApiResponse;
        toast.error(
          `Failed to update status: ${typedError.message || "Please try again."}`
        );
      }
    } catch {
      // Use _error to mark as unused but typed
      toast.error("An error occurred while updating status. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const response = await fetch("/api/landing-page/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: landingPage.conversationId,
          designVariantId: landingPage.designVariant,
        }),
      });
      if (!response.ok) {
        const errorData: unknown = await response.json();
        const typedError = errorData as ErrorApiResponse;
        throw new Error(typedError.message || "Regeneration failed");
      }
      // --- FIX: Safely parse and use response data ---
      const responseData: unknown = await response.json();
      const data = responseData as GenerateApiResponse;
      if (data.success && data.landingPage) {
        setLandingPage(data.landingPage); // data.landingPage now has the correct type
        toast.success("Landing page content regenerated!");
        router.refresh(); // Refresh server data if needed
      } else {
        throw new Error(
          data.message || "Regeneration succeeded but returned invalid data."
        );
      }
      // ---------------------------------------------
    } catch (error: unknown) {
      // Use typed error
      toast.error(
        `Failed to regenerate: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSelectDesign = (variantId: string) => {
    const newVariant = DESIGN_VARIANTS.find((v) => v.id === variantId);
    if (newVariant) {
      setLandingPage((prev) => ({
        ...prev,
        designVariant: newVariant.id,
        // Ensure colorScheme is treated as JsonObject
        colorScheme: newVariant.colorScheme as Prisma.JsonObject,
      }));
    }
  };

  const copyUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = `${baseUrl}/lp/${landingPage.slug}`;
    // --- FIX: Handle floating promise ---
    void navigator.clipboard.writeText(url);
    // ------------------------------------
    toast.success("URL copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {landingPage.title}
              </h1>
              <p
                className={`text-sm font-semibold mt-1 ${
                  landingPage.isPublished ? "text-green-500" : "text-amber-500"
                }`}
              >
                ● {landingPage.isPublished ? "Published" : "Draft"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {landingPage.isPublished && (
                <button
                  onClick={copyUrl} // No promise here, so direct call is fine
                  className="px-4 py-2 border rounded-lg hover:bg-muted transition-colors text-sm font-semibold"
                >
                  📋 Copy URL
                </button>
              )}
              {/* --- FIX: Handle misused promises --- */}
              <button
                onClick={() => void handleRegenerate()} // Wrap async func
                disabled={isRegenerating}
                className="px-4 py-2 border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 text-sm font-semibold"
              >
                {isRegenerating ? "Regenerating..." : "🔄 Regenerate"}
              </button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => void handlePublish(!landingPage.isPublished)} // Wrap async func
                disabled={isPublishing}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 text-sm ${
                  landingPage.isPublished
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-green-500 text-white hover:bg-green-600"
                }`}
              >
                {isPublishing
                  ? "..."
                  : landingPage.isPublished
                    ? "Unpublish"
                    : "🚀 Publish"}
              </motion.button>
              {/* ---------------------------------- */}
            </div>
          </div>
          {/* Tabs remain the same */}
          <div className="flex gap-4 mt-4 border-b border-border">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === "preview"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === "analytics"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab("sprint")}
              className={`px-4 py-2 font-semibold transition-colors ${
                activeTab === "sprint"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sprint
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "preview" && (
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-bold mb-4">Design Variant</h2>
              <DesignVariantSelector
                selected={landingPage.designVariant}
                onSelect={handleSelectDesign}
              />
              <p className="text-sm text-muted-foreground mt-4">
                Clicking a new design updates the preview below. Click
                &quot;Regenerate&quot; to apply the new style and save.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-bold mb-4">Live Preview</h2>
              <div className="border border-border rounded-2xl overflow-hidden shadow-lg">
                <div className="h-[700px] overflow-y-auto">
                  {/* Pass the correctly typed landingPage */}
                  <LandingPagePublic landingPage={landingPage} />
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Stat cards remain the same */}
            </div>
            <div className="border rounded-2xl p-6 bg-card">
              <h3 className="text-lg font-bold mb-4">Recent Signups</h3>
              {landingPage.emailSignups.length === 0 ? (
                <p className="text-muted-foreground">No signups yet.</p>
              ) : (
                <div className="space-y-3">
                  {/* --- FIX: Use the specific type for signup --- */}
                  {landingPage.emailSignups.map((signup: EmailSignupData) => (
                    <div
                      key={signup.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <div className="font-medium">{signup.email}</div>
                        {signup.name && (
                          <div className="text-sm text-muted-foreground">
                            {signup.name}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {/* Ensure createdAt is treated as a date string */}
                        {new Date(signup.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                  {/* ---------------------------------------------- */}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "sprint" && (
          <SprintDashboard conversationId={landingPage.conversationId} />
        )}
      </main>
    </div>
  );
}
