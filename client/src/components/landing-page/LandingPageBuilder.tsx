"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { DESIGN_VARIANTS } from "lib/landing-page-generator";
import DesignVariantSelector from "./DesignVariantSelector";
import LandingPagePublic from "./landing-page-public/LandingPagePublic";
import SprintDashboard from "./SprintDashboard";
import toast from "react-hot-toast";
import { Prisma } from "@prisma/client";
import useSWR from "swr";
import React from "react"; // Import React

// Sub-component Imports
import AnalyticsOverview from "./analytics/AnalyticsOverview";
import FeedbackSection from "./analytics/FeedbackSection";
import RecentSignupsTable from "./analytics/RecentSignupsTable";
import TrafficSources from "./analytics/TrafficSources";
import AnalyticsCharts from "./analytics/AnalyticsChart";

// --- Interfaces ---
// Defined to match the structure used within this component and its children
export interface LandingPageFeature {
  title: string;
  description: string;
  icon?: string;
}
export interface EmailSignupData {
  id: string;
  email: string;
  name?: string | null;
  createdAt: string;
  source?: string | null;
}

// Initial data passed from the server component
export interface InitialLandingPageData {
  id: string;
  slug: string;
  isPublished: boolean;
  conversationId: string;
  title: string;
  headline: string;
  subheadline: string;
  problemStatement: string | null;
  solutionStatement: string | null;
  features: LandingPageFeature[];
  ctaText: string;
  designVariant: string;
  colorScheme: Prisma.JsonObject;
  surveyQuestion1?: string | null;
  surveyQuestion2?: string | null;
  calendlyUrl?: string | null;
  pricingTiers?: Prisma.JsonValue;
  abTestVariants?: Prisma.JsonValue;
  preorderLink?: string | null;
}

// Type for the full analytics API response (matching api/landing-page/analytics/route.ts)
export interface AnalyticsApiResponse {
  overview: {
    totalViews: number;
    uniqueVisitors: number;
    signupCount: number;
    conversionRate: number;
    avgTimeOnPage: number;
    bounceRate: number;
    isPublished: boolean;
    publishedAt: string | null;
  };
  charts: {
    last7Days: Array<{ date: string; views: number }>;
    last30Days: Array<{ date: string; views: number }>;
  };
  recentSignups: EmailSignupData[];
  topSources: Array<{ source: string; count: number }>;
  landingPage: {
    id: string;
    slug: string;
    title: string;
    url: string;
    createdAt: string;
    updatedAt: string;
  };
  feedback: {
    averageProblemRating: number;
    ratingDistribution: number[];
    averageSolutionRating: number;
    solutionRatingDistribution: number[];
    featureVoteDistribution?: Array<{ name: string; count: number }>;
    pricingVoteDistribution?: Array<{ name: string; count: number }>;
    surveyResponses: Array<{
      email: string;
      response1: string | null;
      response2: string | null;
      createdAt: string;
    }>;
  };
}

// Type for the /generate API response
interface GenerateApiResponse {
  success: boolean;
  landingPage: { id: string };
  message?: string;
}
// Type for generic error responses
interface ErrorApiResponse {
  message?: string;
  detail?: string;
  error?: string;
}
// -------------------

interface LandingPageBuilderProps {
  landingPage: InitialLandingPageData;
}

// SWR Fetcher function
const fetcher = (url: string): Promise<AnalyticsApiResponse> =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      const errorBody = (await res
        .json()
        .catch(() => ({ error: "Unknown fetch error" }))) as
        | ErrorApiResponse
        | { error?: string };

      // Derive a safe error message using type guards to avoid `any`
      const errorMessage =
        errorBody && typeof (errorBody as ErrorApiResponse).message === "string"
          ? (errorBody as ErrorApiResponse).message
          : typeof (errorBody as { error?: string }).error === "string"
            ? (errorBody as { error?: string }).error
            : `Failed to fetch: ${res.statusText}`;

      console.error("SWR Fetch Error:", errorBody); // Log the error body
      throw new Error(errorMessage);
    }
    return res.json() as Promise<AnalyticsApiResponse>;
  });

export default function LandingPageBuilder({
  landingPage: initialData,
}: LandingPageBuilderProps) {
  const router = useRouter();
  const [landingPage, setLandingPage] =
    useState<InitialLandingPageData>(initialData);
  const [isPublishing, setIsPublishing] = useState(false); // Init with correct status
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "preview" | "analytics" | "sprint"
  >("preview");

  // SWR Fetching for Analytics
  const {
    data: analyticsData,
    error: analyticsError,
    mutate: mutateAnalytics,
  } = useSWR<AnalyticsApiResponse, Error>(
    // Only fetch if landingPage.id is available
    landingPage.id
      ? `/api/landing-page/analytics?landingPageId=${landingPage.id}`
      : null,
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      onError: (err: unknown) => {
        console.error("SWR Error:", err);
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : String(err);
        toast.error(`Failed to load analytics: ${message}`);
      },
    }
  );

  const handlePublish = async (publishState: boolean) => {
    setIsPublishing(true); // Indicate loading immediately
    const optimisticData = analyticsData
      ? {
          ...analyticsData,
          overview: { ...analyticsData.overview, isPublished: publishState },
        }
      : undefined;

    try {
      // Optimistically update UI
      setLandingPage((prev) => ({ ...prev, isPublished: publishState }));
      if (optimisticData) {
        await mutateAnalytics(optimisticData, false); // Update SWR cache without revalidation yet
      }

      const response = await fetch("/api/landing-page/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingPageId: landingPage.id,
          isPublished: publishState,
        }),
      });

      if (!response.ok) {
        // Revert optimistic update on failure
        setLandingPage((prev) => ({ ...prev, isPublished: !publishState }));
        if (analyticsData) await mutateAnalytics(analyticsData, false); // Revert SWR cache

        const errorData: unknown = await response.json().catch(() => ({}));
        const typedError = errorData as ErrorApiResponse;
        throw new Error(typedError.message || "Failed to update status.");
      }

      toast.success(`Page ${publishState ? "published" : "unpublished"}!`);
      // Trigger revalidation after success
      await mutateAnalytics();
      router.refresh(); // Refresh server components if necessary
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "An error occurred.");
      // Ensure state reflects reality after error (revert if not already done)
      setLandingPage((prev) => ({ ...prev, isPublished: !publishState }));
      if (analyticsData) await mutateAnalytics(analyticsData, false); // Revert SWR cache
    } finally {
      setIsPublishing(false); // Buttons re-enable after operation
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    toast.loading("Regenerating content...", { id: "regenerate-toast" });
    try {
      const response = await fetch("/api/landing-page/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: landingPage.conversationId,
          // Pass current design variant and color scheme for regeneration context if API uses it
          designVariantId: landingPage.designVariant,
        }),
      });
      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => ({}));
        const typedError = errorData as ErrorApiResponse;
        throw new Error(typedError.message || "Regeneration request failed");
      }
      const data = (await response.json()) as GenerateApiResponse;
      if (data.success && data.landingPage) {
        toast.success("Content regenerated! Refreshing preview...", {
          id: "regenerate-toast",
        });
        // Best way to see updated content is often a full refresh
        // as server components might hold old data
        window.location.reload();
        // Alternatively, if API returned full updated LandingPageData:
        // setLandingPage(data.landingPage); // Assuming API returns full data matching InitialLandingPageData
        // setActiveTab("preview");
      } else {
        throw new Error(data.message || "Regeneration failed to return data.");
      }
    } catch (error: unknown) {
      toast.error(
        `Regeneration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        { id: "regenerate-toast" }
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  // Update state AND trigger regeneration if design changes significantly
  const handleSelectDesign = (variantId: string) => {
    const newVariant = DESIGN_VARIANTS.find((v) => v.id === variantId);
    if (newVariant && newVariant.id !== landingPage.designVariant) {
      setLandingPage((prev) => ({
        ...prev,
        designVariant: newVariant.id,
        colorScheme: newVariant.colorScheme as Prisma.JsonObject,
      }));
      // Optionally trigger regenerate here if content should adapt to design personality
      // handleRegenerate(); // Uncomment if needed
      toast(
        "Design selected. Click Regenerate to apply style & potentially update content.",
        { icon: "ℹ️" }
      );
    }
  };

  const copyUrl = () => {
    const url =
      analyticsData?.landingPage.url ||
      `${process.env.NEXT_PUBLIC_APP_URL || ""}/lp/${landingPage.slug}`;
    void navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard!");
  };

  // Extract primary color safely, used for chart
  const getPrimaryColor = (colorScheme: unknown): string => {
    if (!colorScheme || typeof colorScheme !== "object") return "#8B5CF6";
    const cs = colorScheme as Record<string, unknown>;
    const primary = cs.primary;
    return typeof primary === "string" ? primary : "#8B5CF6";
  };
  const primaryColor = getPrimaryColor(landingPage.colorScheme);

  // Determine current published status reliably
  const currentIsPublished =
    analyticsData?.overview.isPublished ?? initialData.isPublished;

  return (
    <div className="min-h-screen bg-background">
      {/* Header section with Title, Status, Buttons, Tabs */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Title and Status */}
            <div>
              <h1 className="text-2xl font-bold text-foreground truncate">
                {landingPage.title}
              </h1>
              <p
                className={`text-sm font-semibold mt-1 transition-colors duration-300 ${currentIsPublished ? "text-green-500" : "text-amber-500"}`}
              >
                ● {currentIsPublished ? "Published" : "Draft"}
                {/* Loading indicators */}
                {isPublishing && !currentIsPublished && " (Publishing...)"}
                {isPublishing && currentIsPublished && " (Unpublishing...)"}
                {isRegenerating && " (Regenerating...)"}
              </p>
            </div>
            {/* Action Buttons */}
            <div className="flex items-center flex-wrap justify-start md:justify-end gap-3">
              {currentIsPublished && (
                <button
                  onClick={copyUrl}
                  disabled={isPublishing || isRegenerating}
                  className="px-4 py-2 border rounded-lg hover:bg-muted transition-colors text-sm font-semibold whitespace-nowrap disabled:opacity-50"
                >
                  📋 Copy URL
                </button>
              )}
              <button
                onClick={() => void handleRegenerate()}
                disabled={isRegenerating || isPublishing}
                className="px-4 py-2 border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 text-sm font-semibold whitespace-nowrap"
              >
                {isRegenerating ? "..." : "🔄 Regenerate"}
              </button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => void handlePublish(!currentIsPublished)}
                disabled={isPublishing || isRegenerating}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 text-sm whitespace-nowrap ${currentIsPublished ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-green-500 text-white hover:bg-green-600"}`}
              >
                {isPublishing
                  ? "..."
                  : currentIsPublished
                    ? "Unpublish"
                    : "🚀 Publish"}
              </motion.button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-4 mt-4 border-b border-border">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-4 py-2 font-semibold transition-colors ${activeTab === "preview" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-4 py-2 font-semibold transition-colors ${activeTab === "analytics" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab("sprint")}
              className={`px-4 py-2 font-semibold transition-colors ${activeTab === "sprint" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              Sprint
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area based on Active Tab */}
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
                Select a style, then click Regenerate to apply changes and
                potentially update content for the new style.
              </p>
            </section>
            <section>
              <h2 className="text-xl font-bold mb-4">Live Preview</h2>
              <div className="border border-border rounded-2xl overflow-hidden shadow-lg bg-white dark:bg-black">
                {" "}
                {/* Added bg */}
                <div className="h-[700px] overflow-y-auto">
                  {/* Pass the current state data to the preview */}
                  <LandingPagePublic
                    landingPage={
                      landingPage as unknown as InitialLandingPageData & {
                        preorderLink?: string | null;
                        abTestVariants?: Record<string, string[]> | null;
                      }
                    }
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-8">
            {/* Loading State */}
            {!analyticsData && !analyticsError && (
              <div className="text-center py-16">
                <div
                  className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
                  role="status"
                >
                  <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
                    Loading...
                  </span>
                </div>
                <p className="mt-4 text-muted-foreground">
                  Loading Analytics Data...
                </p>
              </div>
            )}
            {/* Error State */}
            {analyticsError && (
              <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-center">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  ⚠️ Error loading analytics:{" "}
                  {analyticsError instanceof Error
                    ? analyticsError.message
                    : String(analyticsError)}
                </p>
              </div>
            )}

            {/* Data Loaded State */}
            {analyticsData && (
              <>
                <AnalyticsOverview overview={analyticsData.overview} />
                <FeedbackSection
                  feedback={analyticsData.feedback}
                  primaryColor={primaryColor}
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  {" "}
                  {/* Use items-start for alignment */}
                  <RecentSignupsTable signups={analyticsData.recentSignups} />
                  <TrafficSources sources={analyticsData.topSources} />
                </div>
                {/* Add Charts Component Here */}
                <AnalyticsCharts
                  chartData={analyticsData.charts}
                  primaryColor={primaryColor}
                />
              </>
            )}
          </div>
        )}

        {activeTab === "sprint" && (
          <SprintDashboard
            conversationId={landingPage.conversationId}
            landingPageId={landingPage.id}
          />
        )}
      </main>
    </div>
  );
}
