// src/lib/achievements.ts

import prisma from "@/lib/prisma";
import { Achievements } from "./achievements.config";
// ================== FIX #2: Import TaskStatus ==================
import { TaskStatus } from "@prisma/client";
// ===============================================================

export async function checkAndGrantAchievements(
  userId: string,
  conversationId: string
) {
  const newAchievements = [];

  try {
    const [sprint, tasks, userAchievements] = await Promise.all([
      prisma.sprint.findUnique({ where: { conversationId } }),
      prisma.task.findMany({ where: { conversationId } }),
      prisma.achievement.findMany({
        where: { userId, conversationId: conversationId },
      }),
    ]);

    if (!sprint || tasks.length === 0) return [];

    const existingSprintAchievements = new Set(
      userAchievements.map((a) => a.achievementType)
    );

    const completedTasksCount = tasks.filter(
      (t) => t.status === TaskStatus.COMPLETE
    ).length;

    // --- Check for "First Step Taken" ---
    if (
      completedTasksCount >= 1 &&
      !existingSprintAchievements.has(Achievements.FIRST_STEP_TAKEN.type)
    ) {
      await prisma.achievement.create({
        data: {
          userId,
          conversationId,
          achievementType: Achievements.FIRST_STEP_TAKEN.type,
        },
      });
      newAchievements.push(Achievements.FIRST_STEP_TAKEN);
    }

    // --- Check for "Sprint Champion" ---
    if (
      completedTasksCount > 0 &&
      completedTasksCount === sprint.totalTasks &&
      !existingSprintAchievements.has(Achievements.SPRINT_CHAMPION.type)
    ) {
      await prisma.achievement.create({
        data: {
          userId,
          conversationId,
          achievementType: Achievements.SPRINT_CHAMPION.type,
        },
      });
      newAchievements.push(Achievements.SPRINT_CHAMPION);
    }

    return newAchievements;
  } catch (error) {
    console.error("Error granting achievements:", error);
    return [];
  }
}

// We also need to update the AI Power User check to be user-wide
export async function checkAndGrantAIAchievement(userId: string) {
  try {
    const aiAssistCount = await prisma.sprint.aggregate({
      _sum: { aiAssistsUsed: true },
      where: { userId },
    });

    const totalAssists = aiAssistCount._sum.aiAssistsUsed || 0;

    if (totalAssists >= Achievements.AI_POWER_USER.condition.count) {
      // --- THE FIX ---
      // 1. Manually check if the user-level achievement already exists.
      const existingAchievement = await prisma.achievement.findFirst({
        where: {
          userId,
          achievementType: Achievements.AI_POWER_USER.type,
          conversationId: null, // Specifically look for the user-level one
        },
      });

      // 2. Only create it if it does NOT exist.
      if (!existingAchievement) {
        await prisma.achievement.create({
          data: {
            userId,
            achievementType: Achievements.AI_POWER_USER.type,
            // conversationId is omitted, so it defaults to null
          },
        });
        console.log(`🏆 Granted 'AI_POWER_USER' achievement to user ${userId}`);
      }
      // ---------------
    }
  } catch (error) {
    console.error("Error checking AI achievement:", error);
  }
}
