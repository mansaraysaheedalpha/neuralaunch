// src/lib/achievements.config.ts

export const Achievements = {
  FIRST_STEP_TAKEN: {
    type: "FIRST_STEP_TAKEN",
    title: "First Step Taken!",
    description: "You've completed your first validation task.",
    scope: "sprint", // This is a sprint-level achievement
    icon: "🥇",
  },
  SPRINT_CHAMPION: {
    type: "SPRINT_CHAMPION",
    title: "Sprint Champion!",
    description: "You've completed all tasks in this 72-hour sprint.",
    scope: "sprint", // This is a sprint-level achievement
    icon: "🏆",
  },
  AI_POWER_USER: {
    type: "AI_POWER_USER",
    title: "AI Power User",
    description: "You've used the AI Assistant 5 times across all sprints.",
    scope: "user", // This is a user-level achievement
    icon: "🤖",
    condition: { count: 5 }, // Condition for unlocking
  },
} as const;

// This allows us to use the keys as a type
export type AchievementType = keyof typeof Achievements;
