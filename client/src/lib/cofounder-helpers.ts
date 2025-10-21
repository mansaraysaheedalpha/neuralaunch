//src/lib/cofounder-helpers.ts
import prisma from "./prisma";

// --- ADD HELPER 1: Get Landing Page Analytics Summary ---
export async function getLandingPageAnalyticsSummary(
  conversationId: string
): Promise<string | null> {
  const landingPage = await prisma.landingPage.findUnique({
    where: { conversationId },
    select: {
      id: true,
      _count: {
        select: { pageViews: true, emailSignups: true },
      },
    },
  });

  if (!landingPage) return null;

  const views = landingPage._count.pageViews;
  const signups = landingPage._count.emailSignups;
  const conversionRate =
    views > 0 ? ((signups / views) * 100).toFixed(1) : "0.0";

  return `Landing Page Analytics Summary:
- Total Views: ${views}
- Total Signups: ${signups}
- Conversion Rate: ${conversionRate}%`;
}

// --- ADD HELPER 2: Get Sprint Progress Summary ---
export async function getSprintProgressSummary(
  conversationId: string
): Promise<string | null> {
  const sprint = await prisma.sprint.findUnique({
    where: { conversationId },
    select: { totalTasks: true, completedTasks: true },
  });

  if (!sprint || sprint.totalTasks === 0) return null; // No sprint started or no tasks

  const completionPercentage = Math.round(
    (sprint.completedTasks / sprint.totalTasks) * 100
  );

  return `Sprint Progress Summary:
- Tasks Completed: ${sprint.completedTasks} / ${sprint.totalTasks}
- Completion: ${completionPercentage}%`;
}
