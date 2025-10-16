// src/lib/achievements.ts
import prisma from "@/lib/prisma";
import { Achievements, AchievementType } from "./achievements.config"; // <-- IMPORT from our new config file

/**
 * Checks for and grants new achievements to a user after an action.
 * This function should ONLY be called from the server (e.g., in an API route).
 * Returns an array of newly granted achievements.
 */
export async function checkAndGrantAchievements(
  userId: string,
  conversationId: string
): Promise<Array<(typeof Achievements)[AchievementType]>> {
  const newAchievements = [];

  const tasks = await prisma.task.findMany({
    where: { conversationId },
    include: { outputs: true },
  });

  if (tasks.length === 0) return [];

  const existingAchievements = await prisma.achievement.findMany({
    where: { userId },
    select: { achievementType: true },
  });
  const existingTypes = new Set(
    existingAchievements.map((a) => a.achievementType)
  );

  // --- ACHIEVEMENT CHECKS ---

  // Check for FIRST_TASK_COMPLETE
  if (!existingTypes.has(Achievements.FIRST_TASK_COMPLETE.type)) {
    if (tasks.some((t) => t.status === "COMPLETE")) {
      newAchievements.push(Achievements.FIRST_TASK_COMPLETE);
    }
  }

  // Check for SPRINT_CHAMPION
  if (!existingTypes.has(Achievements.SPRINT_CHAMPION.type)) {
    if (tasks.every((t) => t.status === "COMPLETE")) {
      newAchievements.push(Achievements.SPRINT_CHAMPION);
    }
  }

  // Check for AI_POWER_USER
  if (!existingTypes.has(Achievements.AI_POWER_USER.type)) {
    const aiUses = tasks.reduce((sum, task) => sum + task.outputs.length, 0);
    if (aiUses >= 5) {
      newAchievements.push(Achievements.AI_POWER_USER);
    }
  }

  // --- Save new achievements to the database ---
  if (newAchievements.length > 0) {
    await prisma.achievement.createMany({
      data: newAchievements.map((ach) => ({
        userId: userId,
        achievementType: ach.type,
      })),
      skipDuplicates: true,
    });
    console.log(
      `🏆 Granted ${newAchievements.length} new achievements to user ${userId}`
    );
  }

  return newAchievements;
}
