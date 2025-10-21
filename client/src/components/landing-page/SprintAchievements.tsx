//src/components/landing-pae/SprintAchievements.tsx
"use client";

import useSWR from "swr";
import { motion } from "framer-motion";
import { Achievements } from "@/lib/achievements.config";
import { Achievement } from "@prisma/client";

// Define the API error response type
interface ApiErrorResponse {
  message?: string;
}

// Define the expected return type of the fetcher
const fetcher = (url: string): Promise<Achievement[]> =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      const errorData: unknown = await res.json();
      const errorBody = errorData as ApiErrorResponse;
      throw new Error(errorBody.message || `API Error: ${res.status}`);
    }
    const data: unknown = await res.json();
    return data as Achievement[];
  });

export default function SprintAchievements({
  conversationId,
}: {
  conversationId: string;
}) {
  const { data: unlockedAchievements, error } = useSWR<Achievement[], Error>(
    `/api/achievements?conversationId=${conversationId}`,
    fetcher
  );

  // Now the check uses the properly typed error variable
  if (error || !unlockedAchievements || unlockedAchievements.length === 0) {
    // Optionally log the actual error if needed for debugging
    // if (error) { console.error("Error fetching achievements:", error); }
    return null;
  }

  const unlockedTypes = new Set(
    unlockedAchievements.map((a) => a.achievementType)
  );

  const sprintAchievementTypes = Object.values(Achievements).filter(
    (ach) => ach.scope === "sprint"
  );

  // Filter out achievements that are defined but not unlocked for this specific sprint run
  const achievementsToShow = sprintAchievementTypes.filter((ach) =>
    unlockedTypes.has(ach.type)
  );

  // If after filtering, there are no achievements to show for this sprint, return null
  if (achievementsToShow.length === 0) {
    return null;
  }

  return (
    <div className="mt-12">
      <h3 className="text-2xl font-bold text-foreground mb-4">
        🏆 Sprint Milestones
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {achievementsToShow.map((ach, index) => {
          // 'isUnlocked' is always true here because we filtered above
          return (
            <motion.div
              key={ach.type}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="p-5 border rounded-xl bg-card border-border" // Always show as unlocked
            >
              <div className="flex items-center gap-4">
                <div className="text-4xl">{ach.icon}</div>
                <div className="flex-1">
                  <p className="font-bold text-foreground">{ach.title}</p>
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
