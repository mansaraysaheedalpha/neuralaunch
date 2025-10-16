// src/lib/achievements.config.ts

// Define all possible achievements in the system
export const Achievements = {
  FIRST_TASK_COMPLETE: {
    type: "FIRST_TASK_COMPLETE",
    title: "First Step Taken!",
    description: "You've completed your first validation task.",
  },
  SPRINT_CHAMPION: {
    type: "SPRINT_CHAMPION",
    title: "Sprint Champion!",
    description: "You've completed all tasks in a 72-hour sprint.",
  },
  AI_POWER_USER: {
    type: "AI_POWER_USER",
    title: "AI Power User",
    description: "You've used the AI Assistant 5 times.",
  },
} as const;

// This allows us to use the keys as a type
export type AchievementType = keyof typeof Achievements;
