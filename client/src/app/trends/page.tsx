"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

const SkeletonLoader = () => (
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

  const fetchTrends = async (showLoadingState = false) => {
    if (showLoadingState) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`/api/trends?timeframe=${timeframe}`);
      if (!response.ok) throw new Error("Failed to fetch trends data.");
      const data = await response.json();
      setTrends(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred."
      );
    } finally {
      if (showLoadingState) setIsLoading(false);
      else setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTrends(true);
  }, [timeframe]);

  useEffect(() => {
    if (status === "authenticated") {
      const interval = setInterval(() => {
        fetchTrends(false);
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [timeframe, status]);

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
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl sm:text-6xl font-black tracking-tight mb-4"
          >
            <span className="text-foreground">Spark</span>
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              {" "}
              Index™
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Discover what the world's next generation of builders are creating
            right now, powered by thousands of validated startup ideas.
          </motion.p>
        </div>

        <AnimatePresence>
          {!isLoading && trends?.isSnapshot && status === "unauthenticated" && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="mb-6"
            >
              <div className="bg-primary/10 border border-primary/20 p-5 rounded-2xl flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center ring-2 ring-primary/20">
                  <span className="text-2xl">💡</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-foreground">
                    You're Viewing a Snapshot
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    This is a public preview of the Spark Index. Sign in to
                    access live, real-time data with auto-updating trends.
                  </p>
                </div>
                <button
                  onClick={() => signIn("google")}
                  className="px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shadow-lg"
                >
                  Sign In for Live Data
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {status === "authenticated" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center gap-2 mb-8"
          >
            {(["day", "week", "month", "all"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  timeframe === tf
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "bg-card text-foreground hover:bg-muted border border-border"
                }`}
              >
                {tf === "all"
                  ? "All Time"
                  : tf.charAt(0).toUpperCase() + tf.slice(1)}
              </button>
            ))}
          </motion.div>
        )}

        {!isLoading &&
          trends &&
          status === "authenticated" &&
          !trends.isSnapshot && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-3 mb-6"
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-full">
                <div
                  className={`relative flex h-3 w-3 ${
                    isRefreshing ? "opacity-100" : ""
                  }`}
                >
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </div>
                <span className="text-xs font-medium text-foreground">
                  {isRefreshing ? "Updating..." : "Live"}
                </span>
                <span className="text-xs text-muted-foreground">
                  • Updated {getTimeSinceUpdate()}
                </span>
              </div>
              <button
                onClick={() => fetchTrends(false)}
                disabled={isRefreshing}
                className="p-2 hover:bg-muted rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Refresh data"
              >
                <svg
                  className={`w-4 h-4 text-muted-foreground ${
                    isRefreshing ? "animate-spin" : ""
                  }`}
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
              </button>
            </motion.div>
          )}

        {isLoading ? (
          /* Skeleton UI */ <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <SkeletonLoader key={i} />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <SkeletonLoader key={i} />
              ))}
            </div>
          </div>
        ) : error ? (
          /* Error UI */ <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 bg-card border border-border rounded-2xl"
          >
            <h3 className="font-semibold text-lg text-foreground mb-2">
              Oops! Something Went Wrong
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              We're having trouble loading the trends data right now.
            </p>
            <button
              onClick={() => fetchTrends(true)}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          </motion.div>
        ) : !trends || trends.topTags.length === 0 ? (
          /* Empty UI */ <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 bg-card border border-border rounded-2xl"
          >
            <h3 className="text-xl font-bold text-foreground mb-2">
              Be the First Builder! 🚀
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              The Spark Index is waiting for amazing ideas like yours. Start
              generating and shape the future of startup trends!
            </p>
            {status === "authenticated" ? (
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg"
              >
                Generate Your First Idea <svg />
              </Link>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg"
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
                  Join thousands of builders using IdeaSpark™ to validate and
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
                    onClick={() => signIn("google")}
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
