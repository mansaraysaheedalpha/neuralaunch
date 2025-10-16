// src/components/landing-page/SprintAchievements.tsx
"use client";

import useSWR from "swr";
import { motion } from "framer-motion";
import { Achievements } from "@/lib/achievements.config";
import { Achievement } from "@prisma/client";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Get all possible achievement types from our definition file
const allAchievementTypes = Object.values(Achievements);

export default function SprintAchievements() {
  const { data: unlockedAchievements, error } = useSWR<Achievement[]>(
    "/api/achievements",
    fetcher
  );

  if (error) return null; // Don't show the component if there's an error
  if (!unlockedAchievements) {
    // Return a loading skeleton
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="p-5 bg-card border border-border rounded-xl animate-pulse"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-muted rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const unlockedTypes = new Set(
    unlockedAchievements.map((a) => a.achievementType)
  );

  return (
    <div className="mt-12">
      <h3 className="text-2xl font-bold text-foreground mb-4">
        🏆 Achievements
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {allAchievementTypes.map((ach, index) => {
          const isUnlocked = unlockedTypes.has(ach.type);
          return (
            <motion.div
              key={ach.type}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`p-5 border rounded-xl transition-all ${isUnlocked ? "bg-card border-border" : "bg-muted/50 border-dashed"}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`text-4xl transition-transform ${isUnlocked ? "grayscale-0 scale-100" : "grayscale scale-90"}`}
                >
                  {ach.type === "FIRST_TASK_COMPLETE"
                    ? "🥇"
                    : ach.type === "SPRINT_CHAMPION"
                      ? "🏆"
                      : "🤖"}
                </div>
                <div className="flex-1">
                  <p
                    className={`font-bold ${isUnlocked ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {ach.title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {ach.description}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
