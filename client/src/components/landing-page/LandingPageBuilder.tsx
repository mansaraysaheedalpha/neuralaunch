// src/components/landing-page/LandingPageBuilder.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { DESIGN_VARIANTS } from "lib/landing-page-generator";
import DesignVariantSelector from "./DesignVariantSelector";
import LandingPagePublic from "./LandingPagePublic";
import SprintDashboard from "./SprintDashboard";

// Define a more specific type for the landing page data
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
  features: any;
  ctaText: string;
  designVariant: string;
  colorScheme: any;
  emailSignups: any[];
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
  analytics,
}: LandingPageBuilderProps) {
  const router = useRouter();
  const [landingPage, setLandingPage] = useState(initialData);
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
      } else {
        alert("Failed to update status. Please try again.");
      }
    } catch (error) {
      alert("An error occurred. Please try again.");
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
      if (!response.ok) throw new Error("Regeneration failed");
      const data = await response.json();
      if (data.success) {
        setLandingPage(data.landingPage);
        router.refresh();
      }
    } catch (error) {
      alert("Failed to regenerate. Please try again.");
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
        colorScheme: newVariant.colorScheme,
      }));
    }
  };

  const copyUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const url = `${baseUrl}/lp/${landingPage.slug}`;
    navigator.clipboard.writeText(url);
    alert("URL copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
                  onClick={copyUrl}
                  className="px-4 py-2 border rounded-lg hover:bg-muted transition-colors text-sm font-semibold"
                >
                  📋 Copy URL
                </button>
              )}
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="px-4 py-2 border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 text-sm font-semibold"
              >
                {isRegenerating ? "Regenerating..." : "🔄 Regenerate"}
              </button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePublish(!landingPage.isPublished)}
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
            </div>
          </div>
          <div className="flex gap-4 mt-4 border-b border-border">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-4 pb-2 font-medium transition-colors text-sm ${
                activeTab === "preview"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-4 pb-2 font-medium transition-colors text-sm ${
                activeTab === "analytics"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab("sprint")}
              className={`px-4 pb-2 font-medium transition-colors text-sm ${
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

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* FIX: Each tab now has its own, separate conditional block */}
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
                &quot;Regenerate&quot; to apply the new style to the
                AI-generated content and save.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-bold mb-4">Live Preview</h2>
              <div className="border border-border rounded-2xl overflow-hidden shadow-lg">
                <div className="h-[700px] overflow-y-auto">
                  <LandingPagePublic landingPage={landingPage} />
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 border rounded-2xl bg-card">
                <div className="text-sm text-muted-foreground mb-2">
                  Total Views
                </div>
                <div className="text-4xl font-bold">{analytics.totalViews}</div>
              </div>
              <div className="p-6 border rounded-2xl bg-card">
                <div className="text-sm text-muted-foreground mb-2">
                  Unique Visitors
                </div>
                <div className="text-4xl font-bold">
                  {analytics.uniqueVisitors}
                </div>
              </div>
              <div className="p-6 border rounded-2xl bg-card">
                <div className="text-sm text-muted-foreground mb-2">
                  Email Signups
                </div>
                <div className="text-4xl font-bold">
                  {analytics.signupCount}
                </div>
                <div className="text-sm text-green-600 mt-2">
                  {analytics.uniqueVisitors > 0
                    ? `${((analytics.signupCount / analytics.uniqueVisitors) * 100).toFixed(1)}% conversion`
                    : "0% conversion"}
                </div>
              </div>
            </div>
            <div className="border rounded-2xl p-6 bg-card">
              <h3 className="text-lg font-bold mb-4">Recent Signups</h3>
              {landingPage.emailSignups.length === 0 ? (
                <p className="text-muted-foreground">
                  No signups yet. Share your page to start collecting emails!
                </p>
              ) : (
                <div className="space-y-3">
                  {landingPage.emailSignups.map((signup: any) => (
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
                        {new Date(signup.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
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
