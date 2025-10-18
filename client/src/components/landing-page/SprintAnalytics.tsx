// src/components/landing-page/SprintAnalytics.tsx
"use client";

import useSWR from "swr";
import { motion } from "framer-motion";

// Define the shape of the analytics data
interface AnalyticsData {
  completedTasks: number;
  totalTasks: number;
  completionPercentage: number;
  aiAssistsUsed: number;
  hoursRemaining: number;
}

const fetcher = (url: string): Promise<AnalyticsData> =>
  fetch(url).then(async (res) => {
    const data: unknown = await res.json();
    return data as AnalyticsData;
  });

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  index: number;
}

const StatCard = ({ title, value, icon, index }: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.1 }}
    className="p-6 bg-card border border-border rounded-2xl"
  >
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <div className="p-2 bg-primary/10 rounded-lg text-primary">{icon}</div>
    </div>
    <p className="text-4xl font-bold text-foreground mt-2">{value}</p>
  </motion.div>
);

export default function SprintAnalytics({
  conversationId,
}: {
  conversationId: string;
}) {
  const { data: stats, error } = useSWR<AnalyticsData, Error>(
    `/api/sprint/analytics/${conversationId}`,
    fetcher
  );

  if (error) return <p className="text-red-500">Failed to load stats.</p>;
  if (!stats) {
    // Show a loading skeleton that matches the card layout
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="p-6 bg-card border border-border rounded-2xl animate-pulse"
          >
            <div className="h-4 bg-muted rounded w-2/3 mb-4"></div>
            <div className="h-8 bg-muted rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  const completionText = `${stats.completedTasks} / ${stats.totalTasks}`;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <StatCard
        index={0}
        title="Progress"
        value={completionText}
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            ></path>
          </svg>
        }
      />
      <StatCard
        index={1}
        title="Completion"
        value={`${stats.completionPercentage}%`}
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M7 3v9a5 5 0 0010 0V3m-5 9v9"
            ></path>
          </svg>
        }
      />
      <StatCard
        index={2}
        title="AI Assists Used"
        value={stats.aiAssistsUsed}
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            ></path>
          </svg>
        }
      />
      <StatCard
        index={3}
        title="Hours Remaining"
        value={`~${stats.hoursRemaining}`}
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
        }
      />
    </div>
  );
}
