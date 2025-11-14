// src/app/api/sprint/reminders/cron/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { env } from "@/lib/env";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const now = new Date();

    const pendingReminders = await prisma.taskReminder.findMany({
      where: {
        sent: false,
        scheduledFor: { lte: now },
      },
      include: {
        task: {
          // We need the task to get to the conversation
          include: {
            conversation: {
              include: {
                user: true, // We need the user to get their email
                landingPage: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (pendingReminders.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No reminders to send.",
      });
    }

    console.log(`📧 Found ${pendingReminders.length} reminders to send.`);

    const sprintUrlBase = env.NEXT_PUBLIC_APP_URL;

    for (const reminder of pendingReminders) {
      const user = reminder.task.conversation.user;
      const conversation = reminder.task.conversation;

      if (user?.email) {
        // FIX: Line 51 - Safely access landingPage?.id with proper null handling
        const landingPageId = conversation.landingPage?.id;
        const sprintUrl = landingPageId
          ? `${sprintUrlBase}/build/${landingPageId}`
          : `${sprintUrlBase}/chat/${conversation.id}`;

        const { sendSprintReminderEmail } = await import("@/lib/email-service");
        await sendSprintReminderEmail({
          to: user.email,
          userName: user.name,
          startupName: conversation.title,
          sprintUrl: sprintUrl,
        });

        await prisma.taskReminder.update({
          where: { id: reminder.id },
          data: { sent: true, sentAt: new Date() },
        });
      }
    }

    return NextResponse.json({ success: true, sent: pendingReminders.length });
  } catch (error) {
    console.error("[CRON_REMINDER_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
