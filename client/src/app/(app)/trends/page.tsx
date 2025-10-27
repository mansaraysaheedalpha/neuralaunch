//client/src/app/trends/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";

type TagData = {
  rank: number;
  name: string;
  count: number;
  percentage: string;
};
type CombinationData = { combination: string; count: number };
type TrendsData = {
  overview: {
    totalIdeas: number;
    growthRate: number;
    recentIdeas: number;
    mostActiveHour: { hour: number; count: number } | null;
  };
  topTags: TagData[];
  topCombinations: CombinationData[];
  isSnapshot?: boolean;
  snapshotDate?: string;
};

interface TrendsApiResponse {
  success: boolean;
  data: TrendsData;
  timestamp?: string;
}

const _SkeletonLoader = () => (
  <div className="bg-card/80 border border-border p-6 rounded-2xl animate-pulse">
    <div className="h-6 bg-muted rounded-xl w-3/4 mb-3"></div>
    <div className="h-4 bg-muted rounded-lg w-1/2"></div>
  </div>
);

const StatCard = ({
  title,
  value,
  subtitle,
  icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="relative group"
  >
    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-secondary rounded-2xl opacity-0 group-hover:opacity-75 blur transition duration-500"></div>
    <div className="relative bg-card border border-border p-6 rounded-2xl h-full">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-1">
            {title}
          </p>
          <p className="text-3xl font-black text-foreground">{value}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
          {icon}
        </div>
      </div>
      {trend !== undefined && (
        <div
          className={`inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full text-xs font-semibold ${
            trend >= 0
              ? "bg-green-500/10 text-green-500"
              : "bg-red-500/10 text-red-500"
          }`}
        >
          <svg
            className={`w-4 h-4 ${trend >= 0 ? "rotate-0" : "rotate-180"}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
          {trend >= 0 ? "+" : ""}
          {trend}%
        </div>
      )}
    </div>
  </motion.div>
);

const TrendingTag = ({ tag, index }: { tag: TagData; index: number }) => {
  const medalColors = [
    "from-amber-400 to-amber-600",
    "from-slate-300 to-slate-500",
    "from-orange-400 to-orange-600",
  ];
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative group"
    >
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-secondary rounded-xl opacity-0 group-hover:opacity-20 blur-lg transition duration-300"></div>
      <div className="relative flex items-center gap-4 bg-card border border-border p-4 rounded-xl hover:shadow-xl transition-all duration-300">
        <div className="relative flex-shrink-0">
          {tag.rank <= 3 ? (
            <div
              className={`w-10 h-10 bg-gradient-to-br ${
                medalColors[tag.rank - 1]
              } rounded-lg flex items-center justify-center shadow-lg`}
            >
              <span className="text-white font-black text-lg">{tag.rank}</span>
            </div>
          ) : (
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <span className="text-muted-foreground font-bold text-lg">
                {tag.rank}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground truncate">
            {tag.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {tag.count} ideas · {tag.percentage}% of total
          </p>
        </div>
        <div className="flex-shrink-0 w-20 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(parseFloat(tag.percentage) * 2, 100)}%`,
            }}
          ></div>
        </div>
      </div>
    </motion.div>
  );
};

export default function TrendsPage() {
  const [trends, setTrends] = useState<TrendsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"day" | "week" | "month" | "all">(
    "week"
  );
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { status } = useSession();

  const fetchTrends = useCallback(
    async (showLoadingState = false) => {
      if (showLoadingState) setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);
      try {
        const response = await fetch(`/api/trends?timeframe=${timeframe}`);
        if (!response.ok) throw new Error("Failed to fetch trends data.");
        const responseData: unknown = await response.json();
        const apiResponse = responseData as TrendsApiResponse;
        setTrends(apiResponse.data); // Get the data from the correct property
        setLastUpdated(new Date());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred."
        );
      } finally {
        if (showLoadingState) setIsLoading(false);
        else setIsRefreshing(false);
      }
    },
    [timeframe]
  );

  useEffect(() => {
    void fetchTrends(true);
  }, [fetchTrends]);

  useEffect(() => {
    if (status === "authenticated") {
      const interval = setInterval(() => {
        void fetchTrends(false);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchTrends, status]);

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${period}`;
  };
  const getTimeSinceUpdate = () => {
    const seconds = Math.floor(
      (new Date().getTime() - lastUpdated.getTime()) / 1000
    );
    return seconds < 5 ? "Just now" : `${seconds}s ago`;
  };

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-muted rounded-xl w-1/3"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div
                  key={i}
                  className="h-32 bg-card border border-border rounded-2xl"
                ></div>
              ))}
            </div>
            <div className="space-y-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="h-20 bg-card border border-border rounded-xl"
                ></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            Error Loading Trends
          </h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => void fetchTrends(true)}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-4xl sm:text-5xl font-black text-foreground">
                <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
                  Spark Index™
                </span>
              </h1>
              <p className="text-muted-foreground mt-2">
                Real-time startup ideas & trending technologies
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void fetchTrends(false)}
                disabled={isRefreshing}
                className="px-4 py-2 bg-card border border-border rounded-xl font-semibold hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <svg
                  className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <div className="text-xs text-muted-foreground">
                Updated {getTimeSinceUpdate()}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6 overflow-x-auto pb-2">
            {(["day", "week", "month", "all"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
                  timeframe === tf
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "bg-card border border-border hover:bg-muted"
                }`}
              >
                {tf === "day"
                  ? "24 Hours"
                  : tf === "week"
                    ? "This Week"
                    : tf === "month"
                      ? "This Month"
                      : "All Time"}
              </button>
            ))}
          </div>
        </motion.div>
        {!trends || !trends.topTags || trends.topTags.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="text-6xl mb-4">🚀</div>
            <h2 className="text-2xl font-bold text-foreground mb-3">
              No Trends Data Yet
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              Be the first to generate an idea and start the trend! NeuraLaunch
              analyzes thousands of startup concepts to show you what&apos;s
              hot.
            </p>
            {status === "authenticated" ? (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl hover:scale-105"
              >
                Generate Your First Idea
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
            ) : (
              <button
                onClick={() => void signIn("google")}
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg hover:shadow-xl hover:scale-105"
              >
                Sign In & Generate Ideas
              </button>
            )}
          </motion.div>
        ) : (
          /* Main Content */ <div className="space-y-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Ideas"
                value={trends.overview.totalIdeas.toLocaleString()}
                subtitle={`${trends.overview.recentIdeas} in last 24h`}
                icon={
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                }
              />
              {/* StatCard with corrected icon */}
              <StatCard
                title="Growth Rate"
                value={`${trends.overview.growthRate >= 0 ? "+" : ""}${
                  trends.overview.growthRate
                }%`}
                subtitle={`vs. previous ${timeframe}`}
                trend={trends.overview.growthRate}
                icon={
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                }
              />
              {/* StatCard with corrected icon */}
              <StatCard
                title="Recent Activity"
                value={trends.overview.recentIdeas}
                subtitle="Ideas in last 24h"
                icon={
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6l4 2"
                    />
                  </svg>
                }
              />
              {/* StatCard with corrected icon */}
              <StatCard
                title="Peak Activity"
                value={
                  trends.overview.mostActiveHour
                    ? formatHour(trends.overview.mostActiveHour.hour)
                    : "N/A"
                }
                subtitle={
                  trends.overview.mostActiveHour
                    ? `${trends.overview.mostActiveHour.count} ideas`
                    : "Gathering data..."
                }
                icon={
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 3v18h18M18.7 8a2 2 0 0 1 0 2.8l-6 6-4-4-4 4"
                    />
                  </svg>
                }
              />
            </div>
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-black text-foreground">
                  🔥 Top Trending Ideas
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Most popular startup categories right now
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {trends.topTags.map((tag, index) => (
                  <TrendingTag key={tag.name} tag={tag} index={index} />
                ))}
              </div>
            </div>
            {trends.topCombinations && trends.topCombinations.length > 0 && (
              <div>
                <div className="mb-6">
                  <h2 className="text-2xl font-black text-foreground">
                    💡 Hot Skill Combinations
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Powerful tech stacks and business model pairings
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {trends.topCombinations.map((combo, index) => (
                    <motion.div
                      key={combo.combination}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-card border border-border p-5 rounded-2xl hover:shadow-lg transition-all duration-300"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-base font-bold text-foreground">
                            {combo.combination}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {combo.count} ideas generated
                          </p>
                        </div>
                        <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                          <span className="text-lg text-primary">⚡</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative group mt-12"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-2xl opacity-10 group-hover:opacity-20 blur-xl transition duration-500"></div>
              <div className="relative bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-primary/20 p-8 rounded-3xl text-center">
                <h3 className="text-2xl font-black text-foreground mb-3">
                  Ready to Build Something Amazing?
                </h3>
                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                  Join thousands of builders using NeuraLaunch™ to validate and
                  launch their startups with proven frameworks.
                </p>
                {status === "authenticated" ? (
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                  >
                    Generate Your Idea <svg className="w-5 h-5" />
                  </Link>
                ) : (
                  <button
                    onClick={() => void signIn("google")}
                    className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                  >
                    Sign In & Generate Ideas
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
