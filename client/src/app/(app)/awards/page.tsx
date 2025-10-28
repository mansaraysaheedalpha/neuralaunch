// src/app/profile/page.tsx

"use client";

import useSWR from "swr";
import { motion } from "framer-motion";
import { Achievements } from "@/lib/achievements.config";
import { Achievement } from "@prisma/client";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// NEW: Define the shape of your API's success response
interface AchievementsApiResponse {
  success: boolean;
  data: Achievement[];
  timestamp?: string; // Optional, but good to include
}

// FIX: Line 13 - Define proper interface instead of 'any'
interface AchievementConfig {
  type: string;
  scope: string;
  icon: string;
  title: string;
  description: string;
}

interface UserAchievementCardProps {
  achConfig: AchievementConfig;
  isUnlocked: boolean;
  index: number;
}

// This is our new, top-tier card for user-level achievements
// FIX: Lines 30, 37, 40 - Properly typed props eliminate unsafe member access
const UserAchievementCard = ({
  achConfig,
  isUnlocked,
  index,
}: UserAchievementCardProps) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay: index * 0.1 }}
    className={`p-6 border rounded-2xl transition-all duration-300 ${
      isUnlocked
        ? "bg-card border-border shadow-lg"
        : "bg-muted/50 border-dashed"
    }`}
  >
    <div className="flex flex-col items-center text-center">
      <div
        className={`text-6xl mb-4 transition-transform duration-300 ${
          isUnlocked ? "grayscale-0 scale-100" : "grayscale scale-90"
        }`}
      >
        {achConfig.icon}
      </div>
      <p
        className={`text-lg font-bold ${
          isUnlocked ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {achConfig.title}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        {achConfig.description}
      </p>
    </div>
  </motion.div>
);

export default function ProfilePage() {
  // FIX 1: Tell SWR to expect the *API Response OBJECT*
  const swrResult = useSWR<AchievementsApiResponse, Error>(
    "/api/achievements?type=user",
    fetcher
  );
  const apiResponse = swrResult.data;
  const error = swrResult.error;

  if (error)
    return (
      <div className="p-8 text-center text-destructive">
                Failed to load achievements.      {" "}
      </div>
    ); // FIX 2: Check if the *entire response object* is loading

  if (!apiResponse)
    return <div className="p-8 text-center">Loading Awards...</div>; // FIX 3: Get the array from the '.data' property

  const unlockedAchievements = apiResponse.data; // FIX 4: Add a safety check for the array itself (handles null/undefined)

  if (!unlockedAchievements) {
    console.error(
      "API response was successful but 'data' field was missing or null."
    );
    return <div className="p-8 text-center">Could not load awards data.</div>;
  } // THIS WILL NOW WORK! unlockedAchievements is the array.

  const unlockedTypes = new Set(
    unlockedAchievements.map((a) => a.achievementType)
  ); // Get all possible user-level achievements from our config

  const allUserAchievements = (
    Object.values(Achievements) as AchievementConfig[]
  ).filter((ach: AchievementConfig) => ach.scope === "user");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-foreground mb-2">Your Awards</h1>
        <p className="text-muted-foreground mb-8">
          Celebrating your journey as a builder on the NeuraLaunch platform.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allUserAchievements.map((ach: AchievementConfig, index: number) => (
            <UserAchievementCard
              key={ach.type}
              achConfig={ach}
              isUnlocked={unlockedTypes.has(ach.type)}
              index={index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
