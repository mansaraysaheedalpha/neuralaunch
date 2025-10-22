// src/app/api/sprint/export/[conversationId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { Task, TaskOutput } from "@prisma/client";
import { marked } from "marked";

// Import for production (Vercel)
import chromium from "chrome-aws-lambda";
import puppeteerCore from "puppeteer-core";

// Import for development (local)
import puppeteerFull from "puppeteer";

export const runtime = "nodejs";

async function generateHTML(
  title: string,
  tasks: (Task & { outputs: TaskOutput[] })[]
): Promise<string> {
  const styles = `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; padding: 40px; }
    h1, h2, h3 { color: #111; }
    h1 { font-size: 28px; border-bottom: 2px solid #eee; padding-bottom: 15px; }
    h2 { font-size: 22px; margin-top: 40px; }
    hr { border: none; border-top: 1px solid #eee; margin: 40px 0; }
    .task-card { page-break-inside: avoid; }
    .output-content { background-color: #f6f8fa; padding: 16px; border-radius: 6px; border: 1px solid #e1e4e8; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 1em; margin-bottom: 1em; table-layout: fixed; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; vertical-align: top; word-wrap: break-word; }
    th { background-color: #f2f2f2; font-weight: 600; }
    tr:nth-child(even) { background-color: #f9f9f9; }
  `;

  const tasksWithParsedContent = await Promise.all(
    tasks
      .filter((task) => task.outputs.length > 0)
      .map(async (task) => {
        const content = task.outputs[0]?.content;
        let contentStr: string;
        if (typeof content === "string") {
          contentStr = content;
        } else if (content === null || content === undefined) {
          contentStr = "";
        } else {
          contentStr = JSON.stringify(content);
        }
        const parsedContent = await marked.parse(contentStr);
        return {
          title: task.title,
          description: task.description,
          parsedContent,
        };
      })
  );

  const tasksHTML = tasksWithParsedContent
    .map(
      (task) => `
      <div class="task-card">
        <hr />
        <h2>✅ Task: ${task.title}</h2>
        <p>${task.description}</p>
        <div class="output-content">
          ${task.parsedContent}
        </div>
      </div>
    `
    )
    .join("");

  return `<!DOCTYPE html><html><head><title>Sprint Report: ${title}</title><style>${styles}</style></head><body><h1>🚀 IdeaSpark Sprint Report: ${title}</h1><p>This document contains all the AI-generated assets from your 72-hour validation sprint.</p>${tasksHTML}</body></html>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const resolvedParams = await params;
    const conversationId: string = resolvedParams.conversationId;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
      include: {
        tasks: {
          orderBy: { orderIndex: "asc" },
          include: { outputs: true },
        },
      },
    });

    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }

    let browser = null;
    try {
      console.log("🚀 Launching browser...");

      const isDevelopment = process.env.NODE_ENV === "development";

      if (isDevelopment) {
        // Local development - use full puppeteer
        console.log("Running in development mode");
        browser = await puppeteerFull.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      } else {
        // Production (Vercel) - use chrome-aws-lambda
        console.log("Running in production mode");
        browser = await puppeteerCore.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
        });
      }

      const page = await browser.newPage();
      const htmlContent = await generateHTML(
        conversation.title,
        conversation.tasks
      );

      await page.setContent(htmlContent, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
      });

      console.log("✅ PDF generated successfully.");

      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${conversation.title}-sprint-report.pdf"`,
        },
      });
    } finally {
      if (browser) {
        await browser.close();
        console.log("🔒 Browser closed.");
      }
    }
  } catch (error) {
    console.error("❌ [PDF_EXPORT_ERROR]", error);
    return new NextResponse(
      JSON.stringify({
        error: "Failed to generate PDF",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
